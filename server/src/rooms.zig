//! Pairing rooms, as pure state: which codes exist, who is in each room, and how a room ends.
//! No sockets and no clock here: every call takes the time (`now`, Unix milliseconds) and the
//! caller holds the lock (src/pairing.zig). The protocol is docs/pairing-protocol.md.
//!
//! A room lives through three phases:
//!
//!   open    created; the host may say hello, then waits for one guest until `expires_ms`
//!   paired  the guest said hello; everything is relayed until either side stops, or one
//!           side's socket has been gone longer than `away_ms` (a locked phone, a network
//!           blip: within that time it says hello again with its key and carries on)
//!   ended   a tombstone, kept `tombstone_ms` so a late scan learns why ("taken", "expired",
//!           "host_gone") instead of "not_found"
const std = @import("std");

/// A code, a host key or a guest key: 16 random bytes, base64url without padding.
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
    /// How long a paired side may be disconnected before the room ends for it.
    away_ms: i64 = 60 * std.time.ms_per_s,
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

/// One side's connection: whether a socket holds it, and which one. Each accepted hello
/// starts a new `epoch`, so a socket a rejoin replaced cannot speak or leave for the new one.
const Side = struct {
    here: bool = false,
    epoch: u32 = 0,
    /// When its socket went, in a paired room, until it rejoins.
    away_since: ?i64 = null,
    language: Language = .{},
};

pub const Room = struct {
    host_key: Key,
    guest_key: Key,
    client: ClientKey,
    created_ms: i64,
    /// When an unused code stops working. A paired room does not expire.
    expires_ms: i64,
    ended_ms: i64 = 0,
    phase: Phase = .open,
    /// A guest joined once: the code is spent.
    was_paired: bool = false,
    /// By `Role`: host, then guest.
    sides: [2]Side = .{ .{}, .{} },
    end_reason: ?EndReason = null,

    fn side(r: *Room, role: Role) *Side {
        return &r.sides[@intFromEnum(role)];
    }

    fn keyOf(r: *const Room, role: Role) *const Key {
        return if (role == .host) &r.host_key else &r.guest_key;
    }

    fn live(r: *const Room) bool {
        return r.phase != .ended;
    }

    fn end(r: *Room, reason: EndReason, now: i64) void {
        r.phase = .ended;
        r.end_reason = reason;
        r.ended_ms = now;
        for (&r.sides) |*sd| sd.here = false;
    }

    /// An open room past its time ends as expired; a paired one whose side has been away too
    /// long ends as that side's leaving. The reason when this call ended it.
    fn lapse(r: *Room, now: i64, limits: Limits) ?EndReason {
        switch (r.phase) {
            .ended => {},
            .open => if (now >= r.expires_ms) {
                r.end(.expired, now);
                return .expired;
            },
            .paired => for (r.sides, 0..) |sd, i| {
                const since = sd.away_since orelse continue;
                if (now - since < limits.away_ms) continue;
                const reason: EndReason = if (i == @intFromEnum(Role.host)) .host_left else .guest_left;
                r.end(reason, now);
                return reason;
            },
        }
        return null;
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

fn keyMatches(expected: *const Key, given: []const u8) bool {
    return given.len == code_len and std.crypto.timing_safe.eql(Key, expected.*, given[0..code_len].*);
}

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

    /// Bytes `create` takes from a CSPRNG: the code, the host key, the guest key.
    pub const entropy_len = 3 * secret_bytes;

    pub const Created = struct { code: Code, host_key: Key, expires_ms: i64 };
    pub const CreateError = error{ TooManyRooms, TooManyForClient, Collision, OutOfMemory };

    /// A new open room for `client`. Call `sweep` first, so ended and expired rooms do not
    /// count.
    pub fn create(self: *Registry, client: []const u8, entropy: [entropy_len]u8, now: i64) CreateError!Created {
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
        var host_key: Key = undefined;
        var guest_key: Key = undefined;
        const enc = std.base64.url_safe_no_pad.Encoder;
        _ = enc.encode(&code, entropy[0..secret_bytes]);
        _ = enc.encode(&host_key, entropy[secret_bytes .. 2 * secret_bytes]);
        _ = enc.encode(&guest_key, entropy[2 * secret_bytes ..]);
        const slot = try self.rooms.getOrPut(self.gpa, code);
        if (slot.found_existing) return error.Collision;
        const expires = now + self.limits.ttl_ms;
        slot.value_ptr.* = .{
            .host_key = host_key,
            .guest_key = guest_key,
            .client = .init(client),
            .created_ms = now,
            .expires_ms = expires,
        };
        return .{ .code = code, .host_key = host_key, .expires_ms = expires };
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

    /// Ends rooms whose time ran out (unused codes, sides away too long) and forgets old
    /// tombstones. `notify.ended(code, reason)` is called for each room this ended while a
    /// side was still connected to hear it.
    pub fn sweep(self: *Registry, now: i64, notify: anytype) void {
        var forget: [64]Code = undefined;
        while (true) {
            var n: usize = 0;
            var it = self.rooms.iterator();
            while (it.next()) |e| {
                const r = e.value_ptr;
                const someone_here = r.sides[0].here or r.sides[1].here;
                if (r.lapse(now, self.limits)) |reason| if (someone_here) notify.ended(e.key_ptr.*, reason);
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

    /// An accepted hello.
    pub const Joined = struct {
        /// This connection's epoch, which `state` and `leave` take.
        epoch: u32,
        /// The other side's language; empty for a host still waiting.
        peer_language: Language,
        /// The key this side rejoins with: how the guest learns its own.
        key: Key,
        /// When the code expires, while the room is open.
        expires_ms: i64,
        /// The side was here before: the peer is told it is back, not that it joined.
        rejoined: bool,
    };

    /// `role` says hello: the host with its key to open its room, the guest without a key to
    /// pair (spending the code), or either side with its key to rejoin a paired room. A
    /// rejoin replaces a socket the server still thinks is connected (a phone that locked
    /// without the connection closing).
    pub fn hello(self: *Registry, code: Code, role: Role, key: []const u8, language: Language, now: i64) Refusal!Joined {
        const r = self.rooms.getPtr(code) orelse return error.NotFound;
        _ = r.lapse(now, self.limits);
        const me = r.side(role);
        const peer = r.side(if (role == .host) .guest else .host);
        var rejoined = false;
        switch (r.phase) {
            .ended => return r.refusal(),
            .open => switch (role) {
                .host => {
                    if (!keyMatches(&r.host_key, key)) return error.BadKey;
                    if (me.here) return error.Taken;
                    me.language = language;
                },
                .guest => {
                    if (key.len != 0) return error.BadKey;
                    if (!peer.here) return error.HostGone;
                    r.phase = .paired;
                    r.was_paired = true;
                    me.language = language;
                },
            },
            .paired => {
                // The code is spent: only a side with its key comes back.
                if (key.len == 0) return error.Taken;
                if (!keyMatches(r.keyOf(role), key)) return error.BadKey;
                rejoined = true;
            },
        }
        me.here = true;
        me.away_since = null;
        me.epoch +%= 1;
        return .{
            .epoch = me.epoch,
            .peer_language = peer.language,
            .key = r.keyOf(role).*,
            .expires_ms = r.expires_ms,
            .rejoined = rejoined,
        };
    }

    /// What a message from a member of the room may do now. Time that ran out ends the room
    /// here (the caller tells the sockets). `replaced`: a rejoin took this socket's place.
    /// `peer_here`: whether a relayed message has anyone to reach.
    pub const State = union(enum) {
        waiting,
        paired: struct { peer_here: bool },
        replaced,
        ended: EndReason,
    };

    pub fn state(self: *Registry, code: Code, role: Role, epoch: u32, now: i64) State {
        const r = self.rooms.getPtr(code) orelse return .{ .ended = .expired };
        _ = r.lapse(now, self.limits);
        if (r.phase != .ended and r.side(role).epoch != epoch) return .replaced;
        return switch (r.phase) {
            .open => .waiting,
            .paired => .{ .paired = .{ .peer_here = r.side(if (role == .host) .guest else .host).here } },
            .ended => .{ .ended = r.end_reason.? },
        };
    }

    /// `role` pressed Stop. The reason when this ended the room, null when it had ended.
    pub fn stop(self: *Registry, code: Code, role: Role, now: i64) ?EndReason {
        const r = self.rooms.getPtr(code) orelse return null;
        if (r.phase == .ended) return null;
        const reason: EndReason = if (role == .host) .host_stopped else .guest_stopped;
        r.end(reason, now);
        return reason;
    }

    /// What a socket closing without a Stop did to its room.
    pub const Left = union(enum) {
        /// Nothing to tell: the room had ended, or a rejoin had replaced the socket.
        none,
        /// A paired side went away: the peer is told, and the side may rejoin within
        /// `away_ms`.
        away,
        /// The room ended: a waiting host left.
        ended: EndReason,
    };

    pub fn leave(self: *Registry, code: Code, role: Role, epoch: u32, now: i64) Left {
        const r = self.rooms.getPtr(code) orelse return .none;
        const me = r.side(role);
        if (r.phase == .ended or me.epoch != epoch or !me.here) return .none;
        me.here = false;
        if (r.phase == .open) {
            const reason: EndReason = if (role == .host) .host_left else .guest_left;
            r.end(reason, now);
            return .{ .ended = reason };
        }
        me.away_since = now;
        return .away;
    }

    /// Whether `digest` is the SHA-256 of the guest key of a room still paired: that guest may
    /// ask for Live tokens. Every room is looked at, so the time taken says nothing of which.
    /// A room whose side has been away too long counts as ended (without ending it here: the
    /// sweep tells its sockets).
    pub fn pairedGuest(self: *Registry, digest: [32]u8, now: i64) bool {
        var found = false;
        var it = self.rooms.valueIterator();
        while (it.next()) |r| {
            const lapsed = for (r.sides) |sd| {
                if (sd.away_since) |since| if (now - since >= self.limits.away_ms) break true;
            } else false;
            var d: [32]u8 = undefined;
            std.crypto.hash.sha2.Sha256.hash(&r.guest_key, &d, .{});
            if (std.crypto.timing_safe.eql([32]u8, d, digest) and r.phase == .paired and !lapsed) found = true;
        }
        return found;
    }

    /// Rooms open or paired: for tests.
    pub fn liveCount(self: *Registry) usize {
        var n: usize = 0;
        var it = self.rooms.valueIterator();
        while (it.next()) |r| if (r.live()) {
            n += 1;
        };
        return n;
    }
};
