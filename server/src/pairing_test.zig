//! Pairing over a loopback socket: `anole.testing` cannot upgrade to WebSocket, so these
//! tests listen on 127.0.0.1 as Anole's realtime template does. Time is the fake clock below,
//! moved by hand: nothing here waits on a timer.
const std = @import("std");
const anole = @import("anole");
const app_main = @import("app");
const Config = app_main.Config;

const gpa = std.testing.allocator;
const Server = anole.Server(app_main.App);
const WsClient = anole.websocket.Client;

const t0: i64 = 1_800_000_000_000;
var fake_now: std.atomic.Value(i64) = .init(t0);

fn fakeClock(_: std.Io) i64 {
    return fake_now.load(.monotonic);
}

/// A server on a loopback port, running `check(live)` beside it and stopping after.
const Live = struct {
    state: app_main.App,
    limiter: anole.ratelimit.MemoryLimiter,
    app: Server,
    io: std.Io,

    fn run(comptime check: fn (*Live) anyerror!void, limits: struct { rooms_per_client: u32 = 10, host_secret: ?[]const u8 = null }) !void {
        fake_now.store(t0, .monotonic);
        const cfg: Config = .{
            .gemini_api_key = .init("test-key"),
            .gemini_auth_tokens_url = "http://127.0.0.1:1/auth_tokens",
            .gemini_generate_url = "http://127.0.0.1:1/generate",
            .room_rate_limit = 1000,
            .rooms_per_client = limits.rooms_per_client,
            .host_secret = if (limits.host_secret) |k| .init(k) else null,
        };
        var live: Live = undefined;
        live.state = .{
            .api_key = cfg.gemini_api_key,
            .auth_tokens_url = cfg.gemini_auth_tokens_url,
            .generate_url = cfg.gemini_generate_url,
            .pairing = .init(gpa, app_main.pairing.limitsOf(cfg)),
        };
        live.state.pairing.clock = fakeClock;
        defer live.state.pairing.deinit();
        live.app = try Server.init(gpa, .{ .executors = .exact(2), .errors = .json }, &live.state);
        defer live.app.deinit();
        live.io = live.app.io();
        live.limiter = .init(gpa, live.io, .{});
        defer live.limiter.deinit();
        live.state.pairing.limiter = &live.limiter;
        try app_main.routes(&live.app, &live.state, cfg, live.limiter.limiter());

        const Task = struct {
            fn go(l: *Live) !void {
                defer l.app.stop();
                try l.app.waitReady();
                try check(l);
            }
        };
        var checking = try live.io.concurrent(Task.go, .{&live});
        try live.app.listen("127.0.0.1:0");
        try checking.await(live.io);
    }

    fn port(l: *Live) u16 {
        return l.app.addresses()[0].ip.getPort();
    }

    const Room = struct { code: [22]u8, host_key: [22]u8, expires_at: i64 };

    /// `POST /rooms` over the loopback.
    fn createRoom(l: *Live) !Room {
        return l.createRoomAs(null);
    }

    /// `POST /rooms` carrying `key` as the booth's pass.
    fn createRoomAs(l: *Live, key: ?[]const u8) !Room {
        var url_buf: [64]u8 = undefined;
        const url = try std.fmt.bufPrint(&url_buf, "http://127.0.0.1:{d}/rooms", .{l.port()});
        var res = try anole.client(l.io).fetch(url, .{ .method = .post, .headers = if (key) |k| &.{.{ "X-API-Key", k }} else &.{} });
        defer res.deinit();
        try std.testing.expectEqual(.created, res.status());
        var arena: std.heap.ArenaAllocator = .init(gpa);
        defer arena.deinit();
        const body = try res.json(struct { code: []const u8, hostKey: []const u8, expiresAt: i64, expiresIn: i64 }, arena.allocator());
        try std.testing.expectEqual(600, body.expiresIn);
        return .{ .code = body.code[0..22].*, .host_key = body.hostKey[0..22].*, .expires_at = body.expiresAt };
    }

    /// The status of a bodiless `POST path` carrying `key` (none when null).
    fn postStatus(l: *Live, path: []const u8, key: ?[]const u8) !anole.http.Status {
        var url_buf: [96]u8 = undefined;
        const url = try std.fmt.bufPrint(&url_buf, "http://127.0.0.1:{d}{s}", .{ l.port(), path });
        var res = try anole.client(l.io).fetch(url, .{ .method = .post, .headers = if (key) |k| &.{.{ "X-API-Key", k }} else &.{}, .body = "{}" });
        defer res.deinit();
        return res.status();
    }

    fn connect(l: *Live, code: []const u8) !WsClient {
        var url_buf: [96]u8 = undefined;
        const url = try std.fmt.bufPrint(&url_buf, "ws://127.0.0.1:{d}/rooms/{s}", .{ l.port(), code });
        return anole.client(l.io).http.connectWebSocket(url, .{});
    }

    /// A host connected and welcomed.
    fn host(l: *Live, room: Room, language: []const u8) !WsClient {
        var ws = try l.connect(&room.code);
        errdefer ws.deinit();
        var buf: [256]u8 = undefined;
        try ws.send(.text, try std.fmt.bufPrint(&buf, "{{\"type\":\"hello\",\"role\":\"host\",\"key\":\"{s}\",\"language\":\"{s}\"}}", .{ &room.host_key, language }));
        try expectText(&ws, try std.fmt.bufPrint(&buf, "{{\"type\":\"welcome\",\"role\":\"host\",\"expiresAt\":{d}}}", .{room.expires_at}));
        return ws;
    }

    /// A guest's socket with its hello sent.
    fn guest(l: *Live, room: Room, language: []const u8) !WsClient {
        var ws = try l.connect(&room.code);
        errdefer ws.deinit();
        var buf: [128]u8 = undefined;
        try ws.send(.text, try std.fmt.bufPrint(&buf, "{{\"type\":\"hello\",\"role\":\"guest\",\"language\":\"{s}\"}}", .{language}));
        return ws;
    }

    /// Host and guest, both welcomed, the host told of the guest.
    fn pair(l: *Live, room: Room) !struct { WsClient, WsClient } {
        const h, const g, _ = try l.pairKeyed(room);
        return .{ h, g };
    }

    /// `pair`, and the key the guest rejoins with.
    fn pairKeyed(l: *Live, room: Room) !struct { WsClient, WsClient, [22]u8 } {
        var h = try l.host(room, "en-US");
        errdefer h.deinit();
        var g = try l.guest(room, "fr-CA");
        errdefer g.deinit();
        const welcome = try g.receive();
        const prefix = "{\"type\":\"welcome\",\"role\":\"guest\",\"peerLanguage\":\"en-US\",\"key\":\"";
        try std.testing.expect(std.mem.startsWith(u8, welcome.data, prefix));
        try std.testing.expectEqualStrings("\"}", welcome.data[prefix.len + 22 ..]);
        const key = welcome.data[prefix.len..][0..22].*;
        try expectText(&h, "{\"type\":\"peer_joined\",\"peerLanguage\":\"fr-CA\"}");
        return .{ h, g, key };
    }

    /// A side's hello to rejoin with its key.
    fn rejoin(l: *Live, room: Room, role: []const u8, key: []const u8) !WsClient {
        var ws = try l.connect(&room.code);
        errdefer ws.deinit();
        var buf: [160]u8 = undefined;
        try ws.send(.text, try std.fmt.bufPrint(&buf, "{{\"type\":\"hello\",\"role\":\"{s}\",\"key\":\"{s}\",\"language\":\"en\"}}", .{ role, key }));
        return ws;
    }
};

fn expectText(ws: *WsClient, expected: []const u8) !void {
    const msg = try ws.receive();
    if (msg.type != .text) {
        std.debug.print("expected text {s}, got {t} (close {?d})\n", .{ expected, msg.type, if (msg.close_code) |c| @intFromEnum(c) else null });
        return error.TestUnexpectedResult;
    }
    try std.testing.expectEqualStrings(expected, msg.data);
}

fn expectClose(ws: *WsClient, code: u16) !void {
    const msg = try ws.receive();
    try std.testing.expectEqual(.close, msg.type);
    try std.testing.expectEqual(code, @intFromEnum(msg.close_code.?));
}

/// The `error` message for `code`, then the close carrying `close_code`.
fn expectRefusal(ws: *WsClient, code: []const u8, close_code: u16) !void {
    try expectError(ws, code);
    try expectClose(ws, close_code);
}

fn expectError(ws: *WsClient, code: []const u8) !void {
    const msg = try ws.receive();
    try std.testing.expectEqual(.text, msg.type);
    var buf: [64]u8 = undefined;
    const prefix = try std.fmt.bufPrint(&buf, "{{\"type\":\"error\",\"code\":\"{s}\",", .{code});
    if (!std.mem.startsWith(u8, msg.data, prefix)) {
        std.debug.print("expected {s}..., got {s}\n", .{ prefix, msg.data });
        return error.TestUnexpectedResult;
    }
}

test "with HOST_SECRET only the booth makes rooms and recaps, and a paired guest's key gets tokens until the room ends" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            try std.testing.expectEqual(.unauthorized, try l.postStatus("/rooms", null));
            try std.testing.expectEqual(.unauthorized, try l.postStatus("/rooms", "guess"));
            try std.testing.expectEqual(.unauthorized, try l.postStatus("/token", null));
            // Admitted: Gemini is a closed port in tests, so an admitted token request is a 502.
            try std.testing.expectEqual(.bad_gateway, try l.postStatus("/token", "booth"));

            const room = try l.createRoomAs("booth");
            var h, var g, const key = try l.pairKeyed(room);
            defer h.deinit();
            defer g.deinit();
            try std.testing.expectEqual(.bad_gateway, try l.postStatus("/token", &key));
            try std.testing.expectEqual(.unauthorized, try l.postStatus("/recap", &key));
            try std.testing.expectEqual(.unauthorized, try l.postStatus("/rooms", &key));

            try g.send(.text, "{\"type\":\"end\"}");
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"guest_stopped\"}");
            try std.testing.expectEqual(.unauthorized, try l.postStatus("/token", &key));
        }
    }.check, .{ .host_secret = "booth" });
}

test "host and guest pair, learn each other's language, and relay captions and audio both ways" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            defer g.deinit();

            // Every relayed type, verbatim, in order.
            const sent = [_][]const u8{
                "{\"type\":\"speaking\",\"talking\":true}",
                "{\"type\":\"turn\",\"turn\":\"h1\",\"state\":\"talking\"}",
                "{\"type\":\"caption\",\"turn\":\"h1\",\"side\":\"source\",\"delta\":\"Hello \"}",
                "{\"type\":\"turn\",\"turn\":\"h1\",\"state\":\"translating\"}",
                "{\"type\":\"caption\",\"turn\":\"h1\",\"side\":\"translation\",\"delta\":\"Bonjour\"}",
            };
            for (sent) |m| try h.send(.text, m);
            for (sent) |m| try expectText(&g, m);
            const playback = "{\"type\":\"playback\",\"turn\":\"h1\",\"state\":\"playing\",\"progress\":0.5}";
            try g.send(.text, playback);
            try expectText(&h, playback);

            const pcm = [_]u8{ 1, 2, 3, 4, 5, 6 };
            try h.send(.binary, &pcm);
            const heard = try g.receive();
            try std.testing.expectEqual(.binary, heard.type);
            try std.testing.expectEqualSlices(u8, &pcm, heard.data);
            try g.send(.binary, pcm[0..4]);
            const back = try h.receive();
            try std.testing.expectEqual(.binary, back.type);
            try std.testing.expectEqualSlices(u8, pcm[0..4], back.data);

            // A ping is answered, not relayed.
            try g.send(.text, "{\"type\":\"ping\"}");
            try expectText(&g, "{\"type\":\"pong\"}");
            try h.close(.normal, "");
            try g.close(.normal, "");
        }
    }.check, .{});
}

test "a second guest is refused: the code is taken" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            defer g.deinit();
            var second = try l.guest(room, "de");
            defer second.deinit();
            try expectRefusal(&second, "taken", 4409);
            // The session goes on.
            try h.send(.text, "{\"type\":\"turn\",\"turn\":1,\"event\":\"start\"}");
            try expectText(&g, "{\"type\":\"turn\",\"turn\":1,\"event\":\"start\"}");
            try h.close(.normal, "");
            try g.close(.normal, "");
        }
    }.check, .{});
}

test "the host's Stop ends it for both" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            defer g.deinit();
            try h.send(.text, "{\"type\":\"end\"}");
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"host_stopped\"}");
            try expectClose(&h, 1000);
            try expectText(&g, "{\"type\":\"ended\",\"reason\":\"host_stopped\"}");
            try g.close(.normal, "");
            // Spent: a late scan is told so.
            var late = try l.guest(room, "de");
            defer late.deinit();
            try expectRefusal(&late, "taken", 4409);
        }
    }.check, .{});
}

test "the guest's Stop ends it for both" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            defer g.deinit();
            try g.send(.text, "{\"type\":\"end\"}");
            try expectText(&g, "{\"type\":\"ended\",\"reason\":\"guest_stopped\"}");
            try expectClose(&g, 1000);
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"guest_stopped\"}");
            try h.close(.normal, "");
        }
    }.check, .{});
}

test "a side that drops is away; it rejoins with its key and the relay carries on" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g, const key = try l.pairKeyed(room);
            defer h.deinit();
            try g.close(.normal, "");
            g.deinit();
            try expectText(&h, "{\"type\":\"peer_away\"}");

            var back = try l.rejoin(room, "guest", &key);
            defer back.deinit();
            try expectText(&back, "{\"type\":\"welcome\",\"role\":\"guest\",\"peerLanguage\":\"en-US\",\"rejoined\":true}");
            try expectText(&h, "{\"type\":\"peer_back\"}");
            const speaking = "{\"type\":\"speaking\",\"talking\":true}";
            try h.send(.text, speaking);
            try expectText(&back, speaking);
            try h.close(.normal, "");
            try back.close(.normal, "");
        }
    }.check, .{});
}

test "a side away for a minute ends it for the other" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            try g.close(.normal, "");
            g.deinit();
            try expectText(&h, "{\"type\":\"peer_away\"}");
            fake_now.store(t0 + 60 * std.time.ms_per_s, .monotonic);
            try h.send(.text, "{\"type\":\"ping\"}");
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"guest_left\"}");
            try expectClose(&h, 1000);
        }
    }.check, .{});
}

test "a rejoin replaces a connection the server still holds" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            defer g.deinit();
            // The host's phone locked with its socket left open, then came back on a new one.
            var again = try l.rejoin(room, "host", &room.host_key);
            defer again.deinit();
            try expectText(&again, "{\"type\":\"welcome\",\"role\":\"host\",\"peerLanguage\":\"fr-CA\",\"rejoined\":true}");
            try expectText(&g, "{\"type\":\"peer_back\"}");
            try expectText(&h, "{\"type\":\"peer_back\"}"); // the old socket is still in the relay
            try h.send(.text, "{\"type\":\"ping\"}");
            try expectRefusal(&h, "replaced", 4412);
            const turn = "{\"type\":\"turn\",\"turn\":\"h2\",\"state\":\"talking\"}";
            try again.send(.text, turn);
            try expectText(&g, turn);
            try again.close(.normal, "");
            try expectText(&g, "{\"type\":\"peer_away\"}");
            try g.close(.normal, "");
        }
    }.check, .{});
}

test "a host that stops before the guest joins leaves the code dead: host_gone" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h = try l.host(room, "en");
            defer h.deinit();
            try h.send(.text, "{\"type\":\"end\"}");
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"host_stopped\"}");
            try expectClose(&h, 1000);
            var g = try l.guest(room, "fr");
            defer g.deinit();
            try expectRefusal(&g, "host_gone", 4411);
        }
    }.check, .{});
}

test "an unused code expires after 10 minutes: the guest is refused and the host told" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h = try l.host(room, "en");
            defer h.deinit();
            fake_now.store(t0 + 10 * std.time.ms_per_min, .monotonic);
            var g = try l.guest(room, "fr");
            defer g.deinit();
            try expectRefusal(&g, "expired", 4410);
            try h.send(.text, "{\"type\":\"ping\"}");
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"expired\"}");
            try expectClose(&h, 1000);
        }
    }.check, .{});
}

test "a waiting host is told of its expiry when the next room is made" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h = try l.host(room, "en");
            defer h.deinit();
            fake_now.store(t0 + 10 * std.time.ms_per_min, .monotonic);
            _ = try l.createRoom();
            try expectText(&h, "{\"type\":\"ended\",\"reason\":\"expired\"}");
            try h.close(.normal, "");
        }
    }.check, .{});
}

test "refusals: unknown code, wrong key, bad hello, a second host" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            var unknown = try l.connect("AAAAAAAAAAAAAAAAAAAAAA");
            defer unknown.deinit();
            try expectRefusal(&unknown, "not_found", 4404);
            var malformed = try l.connect("short");
            defer malformed.deinit();
            try expectRefusal(&malformed, "not_found", 4404);

            const room = try l.createRoom();
            var wrong = try l.connect(&room.code);
            defer wrong.deinit();
            try wrong.send(.text, "{\"type\":\"hello\",\"role\":\"host\",\"key\":\"AAAAAAAAAAAAAAAAAAAAAA\",\"language\":\"en\"}");
            try expectRefusal(&wrong, "bad_key", 4403);

            var bad = try l.connect(&room.code);
            defer bad.deinit();
            try bad.send(.text, "{\"type\":\"hello\",\"role\":\"guest\",\"language\":\"<b>\"}");
            try expectRefusal(&bad, "bad_message", 4400);

            var early = try l.connect(&room.code);
            defer early.deinit();
            try early.send(.text, "{\"type\":\"caption\",\"text\":\"hi\"}");
            try expectRefusal(&early, "bad_message", 4400);

            var h = try l.host(room, "en");
            defer h.deinit();
            var second = try l.connect(&room.code);
            defer second.deinit();
            var buf: [160]u8 = undefined;
            try second.send(.text, try std.fmt.bufPrint(&buf, "{{\"type\":\"hello\",\"role\":\"host\",\"key\":\"{s}\",\"language\":\"en\"}}", .{&room.host_key}));
            try expectRefusal(&second, "taken", 4409);

            // An unknown type or odd-length audio is an error, not the end.
            try h.send(.text, "{\"type\":\"shout\"}");
            try expectError(&h, "bad_message");
            try h.send(.binary, "odd");
            try expectError(&h, "bad_message");
            try h.send(.text, "{\"type\":\"ping\"}");
            try expectText(&h, "{\"type\":\"pong\"}");
            try h.close(.normal, "");
        }
    }.check, .{});
}

test "bounds: an oversized message closes with 1009; a flood is cut and the peer told it is away" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            const room = try l.createRoom();
            var h, var g = try l.pair(room);
            defer h.deinit();
            defer g.deinit();

            // 60 KiB chunks cost 61 tokens each against a burst of 3000 refilling at 600 a
            // second (the limiter's clock is real), so a sender far faster than that is cut
            // after about fifty; how many exactly depends on speed, so it is not asserted.
            const chunk = try gpa.alloc(u8, 60 * 1024);
            defer gpa.free(chunk);
            @memset(chunk, 0);
            // One at a time: the relay queues at most 1 MiB for a phone that is not reading.
            const cut = for (0..1000) |_| {
                // A send can fail once the server has cut the host: the guest hears of it next.
                h.send(.binary, chunk) catch break try g.receive();
                const msg = try g.receive();
                if (msg.type != .binary) break msg;
            } else return error.TestUnexpectedResult;
            // Cut like a dropped connection: the host may rejoin within the minute.
            try std.testing.expectEqualStrings("{\"type\":\"peer_away\"}", cut.data);
            try expectRefusal(&h, "rate_limited", 4429);
            try g.close(.normal, "");

            const other = try l.createRoom();
            var big = try l.host(other, "en");
            defer big.deinit();
            const huge = try gpa.alloc(u8, 64 * 1024 + 2);
            defer gpa.free(huge);
            @memset(huge, 0);
            try big.send(.binary, huge);
            // The server closes with 1009 without reading the rest of the frame; the unread
            // bytes can turn the close into a TCP reset, which ends the socket all the same.
            const msg = big.receive() catch |err| switch (err) {
                error.ConnectionResetByPeer => return,
                else => return err,
            };
            try std.testing.expectEqual(.close, msg.type);
            try std.testing.expectEqual(1009, @intFromEnum(msg.close_code.?));
        }
    }.check, .{});
}

test "rooms per client are bounded" {
    try Live.run(struct {
        fn check(l: *Live) !void {
            _ = try l.createRoom();
            _ = try l.createRoom();
            var url_buf: [64]u8 = undefined;
            const url = try std.fmt.bufPrint(&url_buf, "http://127.0.0.1:{d}/rooms", .{l.port()});
            var res = try anole.client(l.io).fetch(url, .{ .method = .post });
            defer res.deinit();
            try std.testing.expectEqual(.too_many_requests, res.status());
        }
    }.check, .{ .rooms_per_client = 2 });
}

test "GET /rooms/:code without an upgrade is a 426" {
    // Over the loopback: under anole.testing a callback WebSocket route panics on a plain GET
    // (no connection behind the response), so this cannot be an in-memory test.
    try Live.run(struct {
        fn check(l: *Live) !void {
            var url_buf: [96]u8 = undefined;
            const url = try std.fmt.bufPrint(&url_buf, "http://127.0.0.1:{d}/rooms/AAAAAAAAAAAAAAAAAAAAAA", .{l.port()});
            var res = try anole.client(l.io).fetch(url, .{});
            defer res.deinit();
            try std.testing.expectEqual(.upgrade_required, res.status());
        }
    }.check, .{});
}
