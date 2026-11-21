//! Vorp token server. `POST /token` trades the Gemini API key (from the environment, never
//! sent to a client) for a short-lived, single-use Live API token. With WEB_DIR set it also
//! serves the exported web app, so the demo is one origin.
//!
//!   bun run token-server        # from the repository root; reads .env there
//!   curl -X POST localhost:8787/token
//!   zig build test              # in server/: the routes, in memory
//!
//! The token uses Google's defaults: one session (`uses: 1`), a 60 second window to open it,
//! and 30 minutes of life. Everything here is Anole's own: typed config, the rate limiter,
//! health routes, CORS, static files and the outbound client.
const std = @import("std");
const anole = @import("anole");
pub const Config = @import("config.zig").Config;

pub const std_options = anole.std_options;
pub const panic = anole.panic;

/// The state every handler gets first.
pub const App = struct {
    api_key: anole.Secret,
    auth_tokens_url: []const u8,
    /// Open when the web build is served; unknown paths then get its index.html.
    web: ?std.Io.Dir = null,

    /// The web build is a single-page app: a path that is no file is one of its routes.
    pub fn notFound(app: *App, req: *anole.Request, res: *anole.Response) !void {
        const web = app.web orelse return error.NotFound;
        if (req.method != .get) return error.NotFound;
        _ = try res.sendFile(web, "index.html", .{});
        res.content_type = .html;
    }
};

/// The parts of Google's AuthToken resource the app needs.
const AuthToken = struct {
    name: []const u8,
    expireTime: []const u8 = "",
};

fn token(app: *App, req: *anole.Request, res: *anole.Response) !void {
    var upstream = anole.client(req).fetch(app.auth_tokens_url, .{
        .method = .post,
        .headers = &.{
            .{ "x-goog-api-key", app.api_key.expose() },
            .{ "Content-Type", "application/json" },
        },
        .body = "{\"uses\":1}",
    }) catch |err| {
        std.log.warn("auth_tokens request failed: {t}", .{err});
        return res.fail(.bad_gateway, "could not reach the Gemini API");
    };
    defer upstream.deinit();

    if (upstream.status() != .ok) {
        std.log.warn("auth_tokens answered {d}: {s}", .{ @intFromEnum(upstream.status()), upstream.body() catch "" });
        return res.fail(.bad_gateway, "the Gemini API refused to issue a token");
    }
    const issued = upstream.json(AuthToken, req.arena) catch return res.fail(.bad_gateway, "unexpected token response");
    try res.header("Cache-Control", "no-store");
    try res.json(.{ .token = issued.name, .expireTime = issued.expireTime });
}

/// Apart from `main` so that src/main_test.zig serves the same routes.
pub fn routes(app: *anole.Server(App), cfg: Config, limiter: anole.ratelimit.Limiter) !void {
    app.use(anole.middleware.RequestId.init(.{}));
    app.use(anole.observe.AccessLog.init(.{ .exclude = &anole.observe.probe_paths }));
    if (cfg.cors_origin) |origin| app.use(anole.middleware.Cors.init(.{ .origins = &.{origin} }));
    _ = app.health(.{}); // /healthz and /readyz

    // Only /token is limited: each one costs a Gemini session. Static files are not.
    app.with(.{anole.ratelimit.Middleware.init(limiter, .{ .limit = cfg.token_rate_limit })}).post("/token", token);

    if (cfg.web_dir) |dir| try app.staticDir("/", dir, .{});
}

pub fn main(init: std.process.Init) !void {
    const cfg = try anole.config.load(Config, init, .{});
    var state: App = .{ .api_key = cfg.gemini_api_key, .auth_tokens_url = cfg.gemini_auth_tokens_url };

    var app = try anole.Server(App).init(init.gpa, .{
        .http = .{ .address = "", .port = cfg.port },
        .errors = .json,
        // Socket activation, sd_notify and zero-downtime restarts under systemd.
        .process = init.minimal,
    }, &state);
    defer app.deinit();

    if (cfg.web_dir) |dir| state.web = try std.Io.Dir.cwd().openDir(app.io(), dir, .{});
    defer if (state.web) |d| d.close(app.io());

    var limiter = anole.ratelimit.MemoryLimiter.init(init.gpa, app.io(), .{});
    defer limiter.deinit();
    try routes(&app, cfg, limiter.limiter());
    try app.run();
}
