//! Vorp token server. One endpoint, `POST /token`, that trades the Gemini API key (read from
//! the environment, never sent to the client) for a short-lived, single-use Live API token.
//!
//!   GEMINI_API_KEY=... zig build run                 # port 8787 on every interface
//!   GEMINI_API_KEY=... zig build run -- 127.0.0.1:9000
//!   curl -X POST localhost:8787/token
//!
//! The token uses Google's defaults: one session (`uses: 1`), a 60 second window to open it,
//! and 30 minutes of life. Rate limiting and locking the token to one model come in phase 6.
const std = @import("std");
const anole = @import("anole");

pub const std_options = anole.std_options;
pub const panic = anole.panic;

const auth_tokens_url = "https://generativelanguage.googleapis.com/v1beta/auth_tokens";

const Config = struct {
    api_key: []const u8,
};

/// The parts of Google's AuthToken resource the app needs.
const AuthToken = struct {
    name: []const u8,
    expireTime: ?[]const u8 = null,
};

fn token(config: *Config, req: *anole.Request, res: *anole.Response) !void {
    var upstream = anole.client(req).fetch(auth_tokens_url, .{
        .method = .post,
        .headers = &.{
            .{ "x-goog-api-key", config.api_key },
            .{ "Content-Type", "application/json" },
        },
        .body = "{\"uses\":1}",
    }) catch |err| {
        std.log.err("auth_tokens request failed: {t}", .{err});
        return res.fail(.bad_gateway, "could not reach the Gemini API");
    };
    defer upstream.deinit();

    if (upstream.status() != .ok) {
        const detail = upstream.body() catch "";
        std.log.err("auth_tokens answered {d}: {s}", .{ @intFromEnum(upstream.status()), detail });
        return res.fail(.bad_gateway, "the Gemini API refused to issue a token");
    }
    const issued = upstream.json(AuthToken, req.arena) catch return res.fail(.bad_gateway, "unexpected token response");
    try res.header("Cache-Control", "no-store");
    try res.json(.{ .token = issued.name, .expireTime = issued.expireTime orelse "" });
}

pub fn main(init: std.process.Init) !void {
    const api_key = init.environ_map.get("GEMINI_API_KEY") orelse init.environ_map.get("GOOGLE_API_KEY") orelse {
        std.log.err("set GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment", .{});
        return error.NoApiKey;
    };
    var config: Config = .{ .api_key = api_key };

    var app = try anole.Server(Config).init(init.gpa, .{ .errors = .json }, &config);
    defer app.deinit();
    app.use(anole.observe.AccessLog.init(.{}));
    // Development: the Expo dev server is another origin. In production the web build is
    // served from this origin (phase 6) and this can be narrowed to it.
    app.use(anole.middleware.Cors.init(.{}));
    app.post("/token", token);

    var args = try init.minimal.args.iterateAllocator(init.arena.allocator());
    _ = args.skip();
    try app.listen(args.next() orelse ":8787");
}
