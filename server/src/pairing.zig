//! Pairing two phones by QR code: `POST /rooms` makes a room, `WS /rooms/:code` connects
//! its host and its one guest, and the server relays between them. Each phone runs its own
//! Gemini Live session; only its results (translated audio, captions, turn and playback marks) cross here.
//! The protocol, for the app's side, is docs/pairing-protocol.md; the room states are
//! src/rooms.zig.
//!
//! Everything is Anole's own: WebSocket callbacks, `websocket.Rooms` for the relay (a slow
//! phone fills only its own queue and is closed), the memory rate limiter for each socket's
//! message rate, and the request's client address (trusted proxies resolved) for limits.
const std = @import("std");
const anole = @import("anole");
const rooms = @import("rooms.zig");
const App = @import("main.zig").App;

const websocket = anole.websocket;

/// The largest message either way, text or binary. Bigger is closed with 1009 by Anole.
pub const max_message = 64 * 1024;
/// A socket is closed this long after it opened, whatever it is doing.
pub const socket_lifetime: std.Io.Duration = .fromSeconds(60 * 60);
/// Each socket's message rate, in tokens: one per message and one more per KiB. About six
/// times what live translated speech needs (24 kHz 16-bit audio is 47 KiB/s).
pub const relay_policy: anole.ratelimit.Policy = .{
    .limit = 600,
    .window = .fromSeconds(1),
    .burst = 3000,
    // Apart from every HTTP middleware's buckets on the same limiter.
    .scope = 0x5641_5250, // "VARP"
};

/// The room limits the settings ask for.
pub fn limitsOf(cfg: @import("config.zig").Config) rooms.Limits {
    return .{ .max_rooms = cfg.max_rooms, .max_rooms_per_client = cfg.rooms_per_client };
}

/// Unix milliseconds. A test replaces it to move time without sleeping.
pub const Clock = *const fn (std.Io) i64;

pub fn realClock(io: std.Io) i64 {
    return std.Io.Clock.real.now(io).toMilliseconds();
}

/// The pairing state the server holds: the rooms and their sockets.
pub const Pairing = struct {
    gpa: std.mem.Allocator,
    /// Over `registry`. Held only for registry calls and the `Rooms` calls that must happen
    /// in step with them (a join, a broadcast that may not be overtaken); never across a
    /// send to a peer.
    mutex: std.Io.Mutex = .init,
    registry: rooms.Registry,
    /// The relay: one `Rooms` room per code, holding the host's and the guest's sockets.
    sockets: websocket.Rooms,
    /// For each socket's message rate. Set before the server runs.
    limiter: ?*anole.ratelimit.MemoryLimiter = null,
    clock: Clock = realClock,

    pub fn init(gpa: std.mem.Allocator, limits: rooms.Limits) Pairing {
        return .{ .gpa = gpa, .registry = .init(gpa, limits), .sockets = .init(gpa, .{}) };
    }

    /// After the server: every socket has left `sockets` by then.
    pub fn deinit(p: *Pairing) void {
        p.sockets.deinit();
        p.registry.deinit();
    }

    fn lock(p: *Pairing, io: std.Io) void {
        p.mutex.lockUncancelable(io);
    }

    fn unlock(p: *Pairing, io: std.Io) void {
        p.mutex.unlock(io);
    }

    /// Whether `digest` is a paired guest's key (`rooms.Registry.pairedGuest`), now.
    pub fn pairedGuest(p: *Pairing, io: std.Io, digest: [32]u8) bool {
        p.lock(io);
        defer p.unlock(io);
        return p.registry.pairedGuest(digest, p.clock(io));
    }

    /// Ends rooms whose time ran out (telling whoever is still connected) and forgets old
    /// tombstones. Under the lock.
    fn sweep(p: *Pairing, now: i64) void {
        p.registry.sweep(now, struct {
            p: *Pairing,
            pub fn ended(self: @This(), code: rooms.Code, reason: rooms.EndReason) void {
                _ = broadcastJson(self.p, code, endedMessage(reason), null);
            }
        }{ .p = p });
    }
};

// ------------------------------------------------------------------ HTTP

/// `POST /rooms`: a new room for the host. No body.
pub fn create(app: *App, req: *anole.Request, res: *anole.Response) !void {
    const p = &app.pairing;
    var entropy: [rooms.Registry.entropy_len]u8 = undefined;
    req.io.randomSecure(&entropy) catch |err| switch (err) {
        error.Canceled => return err,
        error.EntropyUnavailable => return res.fail(.service_unavailable, "no randomness for a code right now"),
    };
    var client_buf: [64]u8 = undefined;
    const client = anole.ratelimit.clientAddress(req, &client_buf);
    const now = p.clock(req.io);

    p.lock(req.io);
    p.sweep(now);
    const made = p.registry.create(client, entropy, now);
    p.unlock(req.io);
    const room = made catch |err| switch (err) {
        error.TooManyForClient => return res.fail(.too_many_requests, "too many pairings open from this address"),
        error.TooManyRooms, error.Collision => return res.fail(.service_unavailable, "no room for another pairing right now"),
        error.OutOfMemory => return err,
    };

    try res.header("Cache-Control", "no-store");
    res.status = .created;
    try res.json(.{
        .code = @as([]const u8, &room.code),
        .hostKey = @as([]const u8, &room.host_key),
        .expiresAt = room.expires_ms,
        .expiresIn = @divTrunc(p.registry.limits.ttl_ms, std.time.ms_per_s),
    });
}


// ------------------------------------------------------------------ WebSocket

/// The largest text message: every relayed type is a small JSON object (a caption carries a
/// delta, not the whole text). Bigger is a `bad_message` error.
pub const max_text = 4 * 1024;

/// What a socket knows of itself, in `ws.context` from `open` to `close`.
const Member = struct {
    code: rooms.Code,
    /// Set by an accepted hello.
    role: ?rooms.Role = null,
    /// The connection's epoch from that hello (`rooms.Registry.hello`).
    epoch: u32 = 0,
    /// The socket was told the room ended (or was refused) and closed; it relays nothing more
    /// and its close is no news to the peer.
    done: bool = false,

    fn relayKey(m: *const Member, buf: *[rooms.code_len + 2]u8) []const u8 {
        @memcpy(buf[0..rooms.code_len], &m.code);
        buf[rooms.code_len] = ':';
        buf[rooms.code_len + 1] = if (m.role == .host) 'h' else 'g';
        return buf;
    }
};

/// Close codes for refusals, after the `error` message that names them.
const Problem = enum(u16) {
    bad_message = 4400,
    bad_key = 4403,
    not_found = 4404,
    taken = 4409,
    expired = 4410,
    host_gone = 4411,
    replaced = 4412,
    rate_limited = 4429,

    fn of(err: rooms.Refusal) Problem {
        return switch (err) {
            error.NotFound => .not_found,
            error.Expired => .expired,
            error.Taken => .taken,
            error.HostGone => .host_gone,
            error.BadKey => .bad_key,
        };
    }

    fn text(problem: Problem) []const u8 {
        return switch (problem) {
            .bad_message => "the message is not one this endpoint takes here",
            .bad_key => "the key does not match this code",
            .not_found => "no pairing has this code",
            .taken => "this code has been used",
            .expired => "this code has expired",
            .host_gone => "the host is no longer connected",
            .replaced => "this side rejoined on another connection",
            .rate_limited => "too many messages",
        };
    }
};

/// The callbacks of `WS /rooms/:code`.
pub const Socket = struct {
    /// A code that names no room is refused at once; anything else waits for the hello.
    pub fn open(app: *App, ws: *websocket.Socket, req: *anole.Request) !void {
        const p = &app.pairing;
        const text = req.param("code") orelse "";
        if (!rooms.validCode(text)) return refuse(ws, .not_found);
        const code: rooms.Code = text[0..rooms.code_len].*;
        p.lock(ws.io);
        const known = p.registry.exists(code);
        p.unlock(ws.io);
        if (!known) return refuse(ws, .not_found);
        const m = try p.gpa.create(Member);
        m.* = .{ .code = code };
        ws.context = m;
    }

    pub fn message(app: *App, ws: *websocket.Socket, msg: websocket.Message) !void {
        const p = &app.pairing;
        if (ws.context == null) return;
        const m = ws.contextAs(Member);
        if (m.done) return;
        const role = m.role orelse return hello(p, ws, m, msg);

        const now = p.clock(ws.io);
        var key_buf: [rooms.code_len + 2]u8 = undefined;
        const cost: u32 = 1 + @as(u32, @intCast(msg.data.len / 1024));
        const allowed = (try p.limiter.?.takeAt(m.relayKey(&key_buf), cost, relay_policy, now)).allowed;
        if (!allowed) {
            try refuseMember(ws, m, .rate_limited);
            return leave(p, ws, m, role);
        }

        const kind: Kind = switch (msg.type) {
            .binary => if (msg.data.len % 2 == 0) .audio else return sendError(ws, .bad_message),
            .text => (if (msg.data.len <= max_text) kindOf(msg.data) else null) orelse return sendError(ws, .bad_message),
            else => return,
        };

        p.lock(ws.io);
        const state = p.registry.state(m.code, role, m.epoch, now);
        const stopped: ?rooms.EndReason = switch (state) {
            .waiting, .paired => if (kind == .end) p.registry.stop(m.code, role, now) else null,
            .replaced, .ended => null,
        };
        p.unlock(ws.io);

        if (stopped) |r| {
            _ = broadcastJson(p, m.code, endedMessage(r), ws);
            return finish(ws, m, r);
        }
        switch (state) {
            // A rejoin took this socket's place: it closes without news for anyone.
            .replaced => return refuseMember(ws, m, .replaced),
            // The peer left for good, or the code expired while waiting: only this socket
            // still needs telling.
            .ended => |r| return finish(ws, m, r),
            .waiting, .paired => {},
        }
        switch (kind) {
            .ping => try sendJson(ws, .{ .type = "pong" }),
            .hello => try sendError(ws, .bad_message),
            .end => unreachable,
            // Nothing to relay to before the guest is here, or while the peer is away.
            .audio, .caption, .turn, .playback, .speaking => if (state == .paired and state.paired.peer_here) {
                _ = p.sockets.broadcast(&m.code, msg.type, msg.data, ws);
            },
        }
    }

    pub fn close(app: *App, ws: *websocket.Socket) void {
        const p = &app.pairing;
        if (ws.context == null) return;
        const m = ws.contextAs(Member);
        ws.context = null;
        defer p.gpa.destroy(m);
        if (m.done) return;
        if (m.role) |role| leave(p, ws, m, role);
    }
};

/// What a message asks for: its `type` (binary frames are `audio`). The relayed types are
/// the phones' own (docs/pairing-protocol.md); the server reads only `type`.
const Kind = enum { hello, ping, end, caption, turn, playback, speaking, audio };

fn kindOf(data: []const u8) ?Kind {
    var buf: [256]u8 = undefined;
    var fba: std.heap.FixedBufferAllocator = .init(&buf);
    const head = std.json.parseFromSliceLeaky(struct { type: []const u8 }, fba.allocator(), data, .{ .ignore_unknown_fields = true }) catch return null;
    const kind = std.meta.stringToEnum(Kind, head.type) orelse return null;
    // Audio travels as binary frames only.
    return if (kind == .audio) null else kind;
}

const Hello = struct {
    type: []const u8,
    role: rooms.Role,
    language: []const u8,
    key: []const u8 = "",
};

/// The first message: who this socket is. A bad one closes the socket.
fn hello(p: *Pairing, ws: *websocket.Socket, m: *Member, msg: websocket.Message) !void {
    if (msg.type != .text) return refuseMember(ws, m, .bad_message);
    var buf: [1024]u8 = undefined;
    var fba: std.heap.FixedBufferAllocator = .init(&buf);
    const in = std.json.parseFromSliceLeaky(Hello, fba.allocator(), msg.data, .{ .ignore_unknown_fields = true }) catch
        return refuseMember(ws, m, .bad_message);
    if (!std.mem.eql(u8, in.type, "hello")) return refuseMember(ws, m, .bad_message);
    const language = rooms.Language.init(in.language) orelse return refuseMember(ws, m, .bad_message);
    const now = p.clock(ws.io);

    p.lock(ws.io);
    const accepted = p.registry.hello(m.code, in.role, in.key, language, now);
    const joined = accepted catch |err| {
        p.unlock(ws.io);
        return refuseMember(ws, m, .of(err));
    };
    m.role = in.role;
    m.epoch = joined.epoch;

    if (in.role == .host and !joined.rejoined) {
        // A host opening its room: joined and welcomed under the lock. The guest can pair
        // only after this, so its `peer_joined` reaches the host, after the welcome.
        defer p.unlock(ws.io);
        p.sockets.join(&m.code, ws) catch |err| {
            _ = p.registry.leave(m.code, .host, m.epoch, now);
            return err;
        };
        _ = broadcastJson(p, m.code, .{ .type = "welcome", .role = "host", .expiresAt = joined.expires_ms }, null);
        return;
    }
    p.unlock(ws.io);

    // A guest pairing, or either side rejoining: welcomed before joining the relay, so
    // nothing relayed from the peer comes first.
    if (joined.rejoined) {
        try sendJson(ws, .{ .type = "welcome", .role = @tagName(in.role), .peerLanguage = joined.peer_language.slice(), .rejoined = true });
    } else {
        try sendJson(ws, .{ .type = "welcome", .role = "guest", .peerLanguage = joined.peer_language.slice(), .key = @as([]const u8, &joined.key) });
    }
    p.sockets.join(&m.code, ws) catch |err| {
        leave(p, ws, m, in.role);
        return err;
    };
    // The peer may have ended it between the hello and the join, its news sent to a room
    // this socket was not yet in.
    p.lock(ws.io);
    const state = p.registry.state(m.code, in.role, m.epoch, now);
    p.unlock(ws.io);
    switch (state) {
        .ended => |r| return finish(ws, m, r),
        .replaced => return refuseMember(ws, m, .replaced),
        .waiting => unreachable, // a guest's hello pairs the room, and only a paired room is rejoined
        .paired => |paired| {
            if (joined.rejoined) {
                _ = broadcastJson(p, m.code, .{ .type = "peer_back" }, ws);
            } else {
                _ = broadcastJson(p, m.code, .{ .type = "peer_joined", .peerLanguage = language.slice() }, ws);
            }
            // The peer is away itself: its `peer_back` follows when it returns (a host that
            // rejoins learns the guest's language from its own welcome).
            if (!paired.peer_here) try sendJson(ws, .{ .type = "peer_away" });
        },
    }
}

/// `role`'s socket is going without a Stop: a paired peer is told it is away (it may
/// rejoin), a waiting host's room ends.
fn leave(p: *Pairing, ws: *websocket.Socket, m: *Member, role: rooms.Role) void {
    const now = p.clock(ws.io);
    p.lock(ws.io);
    const left = p.registry.leave(m.code, role, m.epoch, now);
    p.unlock(ws.io);
    switch (left) {
        .none => {},
        .away => _ = broadcastJson(p, m.code, .{ .type = "peer_away" }, ws),
        .ended => |r| _ = broadcastJson(p, m.code, endedMessage(r), ws),
    }
}

fn endedMessage(reason: rooms.EndReason) struct { type: []const u8 = "ended", reason: []const u8 } {
    return .{ .reason = @tagName(reason) };
}

/// Tells this socket the room ended, and closes it.
fn finish(ws: *websocket.Socket, m: *Member, reason: rooms.EndReason) !void {
    m.done = true;
    try sendJson(ws, endedMessage(reason));
    try ws.close(.normal, "");
}

fn refuseMember(ws: *websocket.Socket, m: *Member, problem: Problem) !void {
    m.done = true;
    return refuse(ws, problem);
}

/// The `error` message, then a close with the problem's code.
fn refuse(ws: *websocket.Socket, problem: Problem) !void {
    try sendError(ws, problem);
    try ws.close(@enumFromInt(@intFromEnum(problem)), "");
}

fn sendError(ws: *websocket.Socket, problem: Problem) !void {
    try sendJson(ws, .{ .type = "error", .code = @tagName(problem), .message = problem.text() });
}

fn sendJson(ws: *websocket.Socket, value: anytype) !void {
    var buf: [512]u8 = undefined;
    try ws.send(.text, try encode(&buf, value));
}

/// To everyone in the room but `except`. The number of sockets it was queued for.
fn broadcastJson(p: *Pairing, code: rooms.Code, value: anytype, except: ?*websocket.Socket) usize {
    var buf: [512]u8 = undefined;
    const text = encode(&buf, value) catch return 0;
    return p.sockets.broadcast(&code, .text, text, except);
}

fn encode(buf: []u8, value: anytype) ![]const u8 {
    var w = std.Io.Writer.fixed(buf);
    try std.json.Stringify.value(value, .{}, &w);
    return w.buffered();
}
