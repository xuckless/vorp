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
        const cfg: Config = .{
            .gemini_api_key = .init("test-key"),
            .gemini_auth_tokens_url = "http://127.0.0.1:1/auth_tokens",
            .token_rate_limit = token_rate_limit,
        };
        self.state = .{ .api_key = cfg.gemini_api_key, .auth_tokens_url = cfg.gemini_auth_tokens_url };
        self.app = try anole.Server(app_main.App).init(std.testing.allocator, .{ .executors = .exact(1), .errors = .json }, &self.state);
        self.limiter = .init(std.testing.allocator, self.app.io(), .{});
        try app_main.routes(&self.app, cfg, self.limiter.limiter());
    }

    fn stop(self: *Fixture) void {
        self.app.deinit();
        self.limiter.deinit();
    }
};

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
