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
    /// Where recaps are written. Only a test changes it.
    gemini_generate_url: []const u8 = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
    /// HOST_SECRET: what a booth device sends (`X-API-Key`) to make rooms, ask for recaps and
    /// get Live tokens; a comma-separated list gives each host its own pass; a guest gets tokens with its room's key instead. Unset: no gate, any
    /// client is a host (development).
    host_secret: ?anole.Secret = null,
    /// TOKEN_RATE_LIMIT: tokens (and recaps) a client address may ask for per minute. Booth-sized:
    /// every host and visitor on the venue Wi-Fi shares one address.
    token_rate_limit: u32 = 120,
    /// ROOM_RATE_LIMIT: pairing rooms made and pairing sockets opened, per client address per
    /// minute. Phones behind the venue's NAT share it.
    room_rate_limit: u32 = 200,
    /// MAX_ROOMS: pairing rooms open or paired at once, across every client.
    max_rooms: u32 = 100,
    /// ROOMS_PER_CLIENT: pairing rooms open or paired at once made from one client address.
    rooms_per_client: u32 = 50,
    /// CORS_ORIGIN: another origin allowed to call /token. Production serves the web build
    /// from this origin, so it needs none.
    cors_origin: ?[]const u8 = null,
    /// WEB_DIR: the exported web build (`bun run export:web`), served at `/` when set.
    web_dir: ?[]const u8 = null,

    /// The Expo dev server.
    pub const development = .{ .cors_origin = "http://localhost:8081" };
};
