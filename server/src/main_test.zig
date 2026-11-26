//! The routes, served in memory. No test reaches Google: the token URL points at a closed port.
const std = @import("std");
const anole = @import("anole");
const app_main = @import("app");
const Config = @import("app").Config;

const Fixture = struct {
    state: app_main.App,
    limiter: anole.ratelimit.MemoryLimiter,
    app: anole.Server(app_main.App),

    fn start(self: *Fixture, token_rate_limit: u32) !void {
        return self.startWith(.{ .token_rate_limit = token_rate_limit });
    }

    /// `trusted`: the proxies in front, as `ANOLE_PROXY_TRUSTED` gives them in production.
    fn startBehind(self: *Fixture, token_rate_limit: u32, trusted: ?[]const []const u8) !void {
        return self.startWith(.{ .token_rate_limit = token_rate_limit, .trusted = trusted });
    }

    const Options = struct {
        token_rate_limit: u32 = 20,
        trusted: ?[]const []const u8 = null,
        room_rate_limit: u32 = 30,
        rooms_per_client: u32 = 10,
    };

    fn startWith(self: *Fixture, o: Options) !void {
        const trusted = o.trusted;
        const cfg: Config = .{
            .gemini_api_key = .init("test-key"),
            .gemini_auth_tokens_url = "http://127.0.0.1:1/auth_tokens",
            .gemini_generate_url = "http://127.0.0.1:1/generate",
            .token_rate_limit = o.token_rate_limit,
            .room_rate_limit = o.room_rate_limit,
            .rooms_per_client = o.rooms_per_client,
        };
        self.state = .{
            .api_key = cfg.gemini_api_key,
            .auth_tokens_url = cfg.gemini_auth_tokens_url,
            .generate_url = cfg.gemini_generate_url,
            .pairing = .init(std.testing.allocator, app_main.pairing.limitsOf(cfg)),
        };
        self.app = try anole.Server(app_main.App).init(std.testing.allocator, .{ .executors = .exact(1), .errors = .json, .proxy = .{ .trusted = trusted } }, &self.state);
        self.limiter = .init(std.testing.allocator, self.app.io(), .{});
        self.state.pairing.limiter = &self.limiter;
        try app_main.routes(&self.app, &self.state, cfg, self.limiter.limiter());
    }

    fn stop(self: *Fixture) void {
        self.app.deinit();
        self.limiter.deinit();
        self.state.pairing.deinit();
    }
};

test {
    _ = @import("rooms_test.zig");
    _ = @import("pairing_test.zig");
}

test "health answers" {
    var f: Fixture = undefined;
    try f.start(20);
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    var res = try t.get("/healthz", .{});
    defer res.deinit();
    try res.expectStatus(.ok);
}

test "POST /token is a 502 when Gemini cannot be reached, and never leaks the key" {
    var f: Fixture = undefined;
    try f.start(20);
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    var res = try t.post("/token", .{});
    defer res.deinit();
    try res.expectStatus(.bad_gateway);
    try std.testing.expect(std.mem.indexOf(u8, res.body, "test-key") == null);
}

test "GET /token is not allowed" {
    var f: Fixture = undefined;
    try f.start(20);
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    var res = try t.get("/token", .{});
    defer res.deinit();
    try res.expectStatus(.method_not_allowed);
}

test "POST /token is rate limited per client" {
    var f: Fixture = undefined;
    try f.start(2);
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    for (0..2) |_| {
        var res = try t.post("/token", .{});
        defer res.deinit();
        try res.expectStatus(.bad_gateway);
    }
    var limited = try t.post("/token", .{});
    defer limited.deinit();
    try limited.expectStatus(.too_many_requests);
}

test "behind a trusted proxy, each forwarded client has its own limit" {
    var f: Fixture = undefined;
    try f.startBehind(1, &.{"loopback"});
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    // The test client's peer is 127.0.0.1: the proxy.
    var first = try t.post("/token", .{ .headers = &.{.{ "X-Forwarded-For", "198.51.100.7" }} });
    defer first.deinit();
    try first.expectStatus(.bad_gateway);
    var other = try t.post("/token", .{ .headers = &.{.{ "X-Forwarded-For", "198.51.100.8" }} });
    defer other.deinit();
    try other.expectStatus(.bad_gateway);
    var again = try t.post("/token", .{ .headers = &.{.{ "X-Forwarded-For", "198.51.100.7" }} });
    defer again.deinit();
    try again.expectStatus(.too_many_requests);
}

test "POST /recap refuses an empty conversation and is a 502 when Gemini cannot be reached" {
    var f: Fixture = undefined;
    try f.start(20);
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    const none: []const []const u8 = &.{};
    var empty = try t.post("/recap", .{ .json = .{ .languages = .{"English"}, .lines = none } });
    defer empty.deinit();
    try empty.expectStatus(.bad_request);

    var res = try t.post("/recap", .{ .json = .{ .languages = .{ "English", "French" }, .lines = .{"Hello. / Bonjour."} } });
    defer res.deinit();
    try res.expectStatus(.bad_gateway);
    try std.testing.expect(std.mem.indexOf(u8, res.body, "test-key") == null);
}

test "POST /rooms makes a room: a code, the host's key and the expiry, never cached" {
    var f: Fixture = undefined;
    try f.start(20);
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    var res = try t.post("/rooms", .{});
    defer res.deinit();
    try res.expectStatus(.created);
    try res.expectHeader("Cache-Control", "no-store");
    const room = try res.json(struct { code: []const u8, hostKey: []const u8, expiresAt: i64, expiresIn: i64 });
    try std.testing.expect(app_main.rooms.validCode(room.code));
    try std.testing.expect(app_main.rooms.validCode(room.hostKey));
    try std.testing.expectEqual(600, room.expiresIn);

    var again = try t.post("/rooms", .{});
    defer again.deinit();
    const other = try again.json(struct { code: []const u8, hostKey: []const u8, expiresAt: i64, expiresIn: i64 });
    try std.testing.expect(!std.mem.eql(u8, room.code, other.code));
}

test "POST /rooms is rate limited per client, apart from /token" {
    var f: Fixture = undefined;
    try f.startWith(.{ .room_rate_limit = 2, .rooms_per_client = 10 });
    defer f.stop();
    var t = try anole.testing.client(&f.app);
    defer t.deinit();

    for (0..2) |_| {
        var res = try t.post("/rooms", .{});
        defer res.deinit();
        try res.expectStatus(.created);
    }
    var limited = try t.post("/rooms", .{});
    defer limited.deinit();
    try limited.expectStatus(.too_many_requests);
    var token = try t.post("/token", .{});
    defer token.deinit();
    try token.expectStatus(.bad_gateway);
}
