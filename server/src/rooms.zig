//! Pairing rooms, as pure state: which codes exist, who is in each room, and how a room ends.
//! No sockets and no clock here: every call takes the time (`now`, Unix milliseconds) and the
//! caller holds the lock (src/pairing.zig). The protocol is docs/pairing-protocol.md.
//!
//! A room lives through three phases:
//!
//!   open    created; the host may say hello, then waits for one guest until `expires_ms`
//!   paired  the guest said hello; everything is relayed until either side stops or leaves
//!   ended   a tombstone, kept `tombstone_ms` so a late scan learns why ("taken", "expired",
//!           "host_gone") instead of "not_found"
const std = @import("std");

/// A code or a host key: 16 random bytes, base64url without padding.
pub const secret_bytes = 16;
pub const code_len = std.base64.url_safe_no_pad.Encoder.calcSize(secret_bytes);
pub const Code = [code_len]u8;
pub const Key = [code_len]u8;

pub const Role = enum { host, guest };

/// Why a room ended; sent to both sides in the `ended` message.
pub const EndReason = enum { host_stopped, guest_stopped, host_left, guest_left, expired };

/// Why a hello was refused; sent as the `error` message's `code` (src/pairing.zig names them).
pub const Refusal = error{ NotFound, Expired, Taken, HostGone, BadKey };

pub const Limits = struct {
    /// An unused code lives this long (owner: 10 minutes).
    ttl_ms: i64 = 10 * std.time.ms_per_min,
    /// How long an ended room is remembered, so a late scan gets a precise refusal.
    tombstone_ms: i64 = 10 * std.time.ms_per_min,
    /// Rooms open or paired at once, across every client.
    max_rooms: u32 = 100,
    /// Rooms open or paired at once that one client address created.
    max_rooms_per_client: u32 = 10,
};

/// A BCP-47 tag as the client sent it ("en", "fr-CA", "zh-Hant-TW"). Not checked against the
/// app's languages table: the server only carries it to the other phone.
pub const max_language = 35;
pub const Language = struct {
    buf: [max_language]u8 = undefined,
    len: u8 = 0,

    pub fn init(text: []const u8) ?Language {
        if (!validLanguage(text)) return null;
        var l: Language = .{ .len = @intCast(text.len) };
        @memcpy(l.buf[0..text.len], text);
        return l;
    }

    pub fn slice(l: *const Language) []const u8 {
        return l.buf[0..l.len];
    }
};

/// 2 to 35 characters, letters, digits and '-', starting with a letter.
pub fn validLanguage(text: []const u8) bool {
    if (text.len < 2 or text.len > max_language) return false;
    if (!std.ascii.isAlphabetic(text[0])) return false;
    for (text) |c| if (!std.ascii.isAlphanumeric(c) and c != '-') return false;
    return true;
}

/// Whether `text` has a code's shape: 22 base64url characters.
pub fn validCode(text: []const u8) bool {
    if (text.len != code_len) return false;
    for (text) |c| if (!std.ascii.isAlphanumeric(c) and c != '-' and c != '_') return false;
    return true;
}

/// A client address as the rate limiter keys it (at most 64 bytes).
const ClientKey = struct {
    buf: [64]u8 = undefined,
    len: u8 = 0,

    fn init(text: []const u8) ClientKey {
        const n = @min(text.len, 64);
        var k: ClientKey = .{ .len = @intCast(n) };
        @memcpy(k.buf[0..n], text[0..n]);
        return k;
    }

    fn eql(k: *const ClientKey, text: []const u8) bool {
        return std.mem.eql(u8, k.buf[0..k.len], text[0..@min(text.len, 64)]);
    }
};

pub const Phase = enum { open, paired, ended };

pub const Room = struct {
    host_key: Key,
    client: ClientKey,
    created_ms: i64,
    /// When an unused code stops working. A paired room does not expire.
    expires_ms: i64,
    ended_ms: i64 = 0,
    phase: Phase = .open,
    /// The host said hello and has not left.
    host_here: bool = false,
    /// A guest joined once: the code is spent.
    was_paired: bool = false,
    host_language: Language = .{},
    guest_language: Language = .{},
    end_reason: ?EndReason = null,

    fn live(r: *const Room) bool {
        return r.phase != .ended;
    }

    fn end(r: *Room, reason: EndReason, now: i64) void {
        r.phase = .ended;
        r.end_reason = reason;
        r.ended_ms = now;
        r.host_here = false;
    }

    /// An open room past its time ends as expired. True when this call ended it.
    fn expire(r: *Room, now: i64) bool {
        if (r.phase != .open or now < r.expires_ms) return false;
        r.end(.expired, now);
        return true;
    }

    /// When an ended room is forgotten.
    fn forgetAt(r: *const Room, limits: Limits) i64 {
        return @max(r.expires_ms, r.ended_ms) + limits.tombstone_ms;
    }

    /// What a hello to this ended room is told.
    fn refusal(r: *const Room) Refusal {
        if (r.was_paired) return error.Taken;
        return if (r.end_reason == .expired) error.Expired else error.HostGone;
    }
};

/// The rooms, keyed by code. Not thread-safe: the caller holds a lock around every call.
pub const Registry = struct {
    gpa: std.mem.Allocator,
    limits: Limits,
    rooms: std.AutoHashMapUnmanaged(Code, Room) = .empty,

    pub fn init(gpa: std.mem.Allocator, limits: Limits) Registry {
        return .{ .gpa = gpa, .limits = limits };
    }

    pub fn deinit(self: *Registry) void {
        self.rooms.deinit(self.gpa);
    }

    /// Ended rooms are kept at most this many times over the live limit; past it the oldest
    /// tombstone goes first.
    const tombstones_per_room = 3;

    pub const Created = struct { code: Code, host_key: Key, expires_ms: i64 };
    pub const CreateError = error{ TooManyRooms, TooManyForClient, Collision, OutOfMemory };

    /// A new open room for `client`. `entropy`: 32 bytes from a CSPRNG, the code and then the
    /// host key. Call `sweep` first, so ended and expired rooms do not count.
    pub fn create(self: *Registry, client: []const u8, entropy: [2 * secret_bytes]u8, now: i64) CreateError!Created {
        var live: u32 = 0;
        var mine: u32 = 0;
        var it = self.rooms.valueIterator();
        while (it.next()) |r| if (r.live()) {
            live += 1;
            if (r.client.eql(client)) mine += 1;
        };
        if (live >= self.limits.max_rooms) return error.TooManyRooms;
        if (mine >= self.limits.max_rooms_per_client) return error.TooManyForClient;
        if (self.rooms.count() >= self.limits.max_rooms * (1 + tombstones_per_room)) self.evictOldestTombstone();

        var code: Code = undefined;
        var key: Key = undefined;
        _ = std.base64.url_safe_no_pad.Encoder.encode(&code, entropy[0..secret_bytes]);
        _ = std.base64.url_safe_no_pad.Encoder.encode(&key, entropy[secret_bytes..]);
        const slot = try self.rooms.getOrPut(self.gpa, code);
        if (slot.found_existing) return error.Collision;
        const expires = now + self.limits.ttl_ms;
        slot.value_ptr.* = .{ .host_key = key, .client = .init(client), .created_ms = now, .expires_ms = expires };
        return .{ .code = code, .host_key = key, .expires_ms = expires };
    }

    fn evictOldestTombstone(self: *Registry) void {
        var oldest: ?Code = null;
        var oldest_ms: i64 = std.math.maxInt(i64);
        var it = self.rooms.iterator();
        while (it.next()) |e| if (!e.value_ptr.live() and e.value_ptr.ended_ms < oldest_ms) {
            oldest_ms = e.value_ptr.ended_ms;
            oldest = e.key_ptr.*;
        };
        if (oldest) |c| _ = self.rooms.remove(c);
    }

    /// Ends open rooms past their time and forgets old tombstones. `notify.expired(code)` is
    /// called for each room that expired with its host still connected.
    pub fn sweep(self: *Registry, now: i64, notify: anytype) void {
        var forget: [64]Code = undefined;
        while (true) {
            var n: usize = 0;
            var it = self.rooms.iterator();
            while (it.next()) |e| {
                const r = e.value_ptr;
                const host_was_here = r.host_here;
                if (r.expire(now) and host_was_here) notify.expired(e.key_ptr.*);
                if (!r.live() and now >= r.forgetAt(self.limits) and n < forget.len) {
                    forget[n] = e.key_ptr.*;
                    n += 1;
                }
            }
            for (forget[0..n]) |c| _ = self.rooms.remove(c);
            if (n < forget.len) return;
        }
    }

    /// Whether a room by this code exists (in any phase).
    pub fn exists(self: *Registry, code: Code) bool {
        return self.rooms.contains(code);
    }

    /// The room's host says hello with its key and language. The expiry time on success.
    pub fn helloHost(self: *Registry, code: Code, key: []const u8, language: Language, now: i64) Refusal!i64 {
        const r = self.rooms.getPtr(code) orelse return error.NotFound;
        _ = r.expire(now);
        if (r.phase == .ended) return r.refusal();
        if (key.len != code_len or !std.crypto.timing_safe.eql(Key, r.host_key, key[0..code_len].*)) return error.BadKey;
        if (r.host_here or r.phase != .open) return error.Taken;
        r.host_here = true;
        r.host_language = language;
        return r.expires_ms;
    }

    /// The guest says hello with its language: the room is paired, the code is spent. The
    /// host's language on success.
    pub fn helloGuest(self: *Registry, code: Code, language: Language, now: i64) Refusal!Language {
        const r = self.rooms.getPtr(code) orelse return error.NotFound;
        _ = r.expire(now);
        switch (r.phase) {
            .ended => return r.refusal(),
            .paired => return error.Taken,
            .open => {},
        }
        if (!r.host_here) return error.HostGone;
        r.phase = .paired;
        r.was_paired = true;
        r.guest_language = language;
        return r.host_language;
    }

    /// What a message from a member of the room may do now. An open room past its time
    /// ends here as expired (the caller tells the host).
    pub const State = union(enum) { waiting, paired, ended: EndReason };

    pub fn state(self: *Registry, code: Code, now: i64) State {
        const r = self.rooms.getPtr(code) orelse return .{ .ended = .expired };
        _ = r.expire(now);
        return switch (r.phase) {
            .open => .waiting,
            .paired => .paired,
            .ended => .{ .ended = r.end_reason.? },
        };
    }

    /// `role` pressed Stop. The reason when this ended the room, null when it had ended.
    pub fn stop(self: *Registry, code: Code, role: Role, now: i64) ?EndReason {
        return self.finish(code, if (role == .host) .host_stopped else .guest_stopped, now);
    }

    /// `role`'s socket closed without a Stop. As `stop`.
    pub fn leave(self: *Registry, code: Code, role: Role, now: i64) ?EndReason {
        return self.finish(code, if (role == .host) .host_left else .guest_left, now);
    }

    fn finish(self: *Registry, code: Code, reason: EndReason, now: i64) ?EndReason {
        const r = self.rooms.getPtr(code) orelse return null;
        if (r.phase == .ended) return null;
        r.end(reason, now);
        return reason;
    }

    /// Rooms open or paired: for tests and the console.
    pub fn liveCount(self: *Registry) usize {
        var n: usize = 0;
        var it = self.rooms.valueIterator();
        while (it.next()) |r| if (r.live()) {
            n += 1;
        };
        return n;
    }
};
