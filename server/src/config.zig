//! The token server's settings, typed. Loaded once in `main` by `anole.config.load`: the
//! defaults below, then the `.env` file (development only), then the environment. A missing
//! or bad value stops the start with every problem listed. `Secret`s never print.
const anole = @import("anole");

pub const Config = struct {
    port: u16 = 8787,
    /// GEMINI_API_KEY: traded for short-lived Live API tokens; never sent to a client.
    gemini_api_key: anole.Secret,
    /// Where tokens are issued. Only a test changes it.
    gemini_auth_tokens_url: []const u8 = "https://generativelanguage.googleapis.com/v1beta/auth_tokens",
    /// TOKEN_RATE_LIMIT: tokens a client address may ask for per minute.
    token_rate_limit: u32 = 20,
    /// CORS_ORIGIN: another origin allowed to call /token. Production serves the web build
    /// from this origin, so it needs none.
    cors_origin: ?[]const u8 = null,
    /// WEB_DIR: the exported web build (`bun run export:web`), served at `/` when set.
    web_dir: ?[]const u8 = null,

    /// The Expo dev server.
    pub const development = .{ .cors_origin = "http://localhost:8081" };
};
