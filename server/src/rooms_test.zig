//! The room states as a pure value: every call takes the time, so expiry is tested by
//! passing a later `now`, never by waiting.
const std = @import("std");
const rooms = @import("app").rooms;
const Registry = rooms.Registry;

const t0: i64 = 1_800_000_000_000;
const second = std.time.ms_per_s;
const minute = std.time.ms_per_min;

fn entropy(seed: u8) [Registry.entropy_len]u8 {
    var e: [Registry.entropy_len]u8 = undefined;
    for (&e, 0..) |*b, i| b.* = seed +% @as(u8, @intCast(i));
    return e;
}

fn lang(text: []const u8) rooms.Language {
    return rooms.Language.init(text).?;
}

/// Records what `sweep` tells.
const Told = struct {
    n: *usize,
    last: *?rooms.EndReason,
    pub fn ended(self: @This(), _: rooms.Code, reason: rooms.EndReason) void {
        self.n.* += 1;
        self.last.* = reason;
    }
};

/// A room with its host connected and its guest paired: the two hellos.
fn paired(reg: *Registry, seed: u8) !struct { rooms.Code, Registry.Joined, Registry.Joined } {
    const room = try reg.create("a", entropy(seed), t0);
    const h = try reg.hello(room.code, .host, &room.host_key, lang("en-US"), t0);
    const g = try reg.hello(room.code, .guest, "", lang("fr-CA"), t0);
    return .{ room.code, h, g };
}

test "a room pairs its host and one guest, who learn each other's language" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("198.51.100.7", entropy(1), t0);
    try std.testing.expect(rooms.validCode(&room.code));
    try std.testing.expect(!std.mem.eql(u8, &room.code, &room.host_key));
    try std.testing.expectEqual(t0 + 10 * minute, room.expires_ms);

    const h = try reg.hello(room.code, .host, &room.host_key, lang("en-US"), t0);
    try std.testing.expectEqual(room.expires_ms, h.expires_ms);
    try std.testing.expectEqual(Registry.State.waiting, reg.state(room.code, .host, h.epoch, t0));
    const g = try reg.hello(room.code, .guest, "", lang("fr-CA"), t0 + minute);
    try std.testing.expectEqualStrings("en-US", g.peer_language.slice());
    try std.testing.expect(!g.rejoined);
    // The guest's own key, apart from the code and the host's.
    try std.testing.expect(!std.mem.eql(u8, &g.key, &room.host_key));
    try std.testing.expect(!std.mem.eql(u8, &g.key, &room.code));
    try std.testing.expect(reg.state(room.code, .host, h.epoch, t0 + minute).paired.peer_here);
    // A paired room does not expire.
    try std.testing.expect(reg.state(room.code, .guest, g.epoch, t0 + 60 * minute) == .paired);
}

test "the code is single-use: a second guest is refused, during and after the session" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const code, _, _ = try paired(&reg, 2);
    try std.testing.expectError(error.Taken, reg.hello(code, .guest, "", lang("de"), t0));
    try std.testing.expectEqual(rooms.EndReason.guest_stopped, reg.stop(code, .guest, t0).?);
    try std.testing.expectError(error.Taken, reg.hello(code, .guest, "", lang("de"), t0));
}

test "the host needs its key, and only one host connects" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(3), t0);
    try std.testing.expectError(error.BadKey, reg.hello(room.code, .host, "short", lang("en"), t0));
    var wrong = room.host_key;
    wrong[0] = if (wrong[0] == 'A') 'B' else 'A';
    try std.testing.expectError(error.BadKey, reg.hello(room.code, .host, &wrong, lang("en"), t0));
    // A guest has no key before it pairs.
    try std.testing.expectError(error.BadKey, reg.hello(room.code, .guest, &room.host_key, lang("en"), t0));
    _ = try reg.hello(room.code, .host, &room.host_key, lang("en"), t0);
    try std.testing.expectError(error.Taken, reg.hello(room.code, .host, &room.host_key, lang("en"), t0));
}

test "an unused code expires after 10 minutes, and says so" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(4), t0);
    const h = try reg.hello(room.code, .host, &room.host_key, lang("en"), t0);
    try std.testing.expectEqual(Registry.State.waiting, reg.state(room.code, .host, h.epoch, t0 + 10 * minute - 1));
    try std.testing.expectError(error.Expired, reg.hello(room.code, .guest, "", lang("fr"), t0 + 10 * minute));
    try std.testing.expectEqual(rooms.EndReason.expired, reg.state(room.code, .host, h.epoch, t0 + 10 * minute).ended);
}

test "a guest finds the host gone when the waiting host left" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(5), t0);
    // Not connected yet.
    try std.testing.expectError(error.HostGone, reg.hello(room.code, .guest, "", lang("fr"), t0));
    const h = try reg.hello(room.code, .host, &room.host_key, lang("en"), t0);
    try std.testing.expectEqual(rooms.EndReason.host_left, reg.leave(room.code, .host, h.epoch, t0).ended);
    try std.testing.expectError(error.HostGone, reg.hello(room.code, .guest, "", lang("fr"), t0));
    try std.testing.expectError(error.NotFound, reg.hello("AAAAAAAAAAAAAAAAAAAAAA".*, .guest, "", lang("fr"), t0));
}

test "either side's Stop ends the room once, with its reason" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const code, const h, const g = try paired(&reg, 6);
    try std.testing.expectEqual(rooms.EndReason.host_stopped, reg.stop(code, .host, t0).?);
    // The guest's socket closing afterwards is no news.
    try std.testing.expectEqual(Registry.Left.none, reg.leave(code, .guest, g.epoch, t0));
    try std.testing.expectEqual(rooms.EndReason.host_stopped, reg.state(code, .host, h.epoch, t0).ended);
    try std.testing.expectEqual(null, reg.stop(code, .guest, t0));
}

test "a paired side that drops is away, and rejoins with its key within a minute" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const code, const h, const g = try paired(&reg, 7);
    try std.testing.expectEqual(Registry.Left.away, reg.leave(code, .guest, g.epoch, t0));
    try std.testing.expect(!reg.state(code, .host, h.epoch, t0).paired.peer_here);
    // Only with its key: the code alone is spent.
    try std.testing.expectError(error.Taken, reg.hello(code, .guest, "", lang("fr-CA"), t0));
    try std.testing.expectError(error.BadKey, reg.hello(code, .guest, "AAAAAAAAAAAAAAAAAAAAAA", lang("fr-CA"), t0));
    const back = try reg.hello(code, .guest, &g.key, lang("fr-CA"), t0 + 59 * second);
    try std.testing.expect(back.rejoined);
    try std.testing.expectEqualStrings("en-US", back.peer_language.slice());
    try std.testing.expect(reg.state(code, .host, h.epoch, t0 + 59 * second).paired.peer_here);
}

test "a side away for a minute ends the room as having left" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const code, const h, _ = try paired(&reg, 8);
    try std.testing.expectEqual(Registry.Left.away, reg.leave(code, .host, h.epoch, t0));
    var n: usize = 0;
    var last: ?rooms.EndReason = null;
    reg.sweep(t0 + 60 * second - 1, Told{ .n = &n, .last = &last });
    try std.testing.expectEqual(0, n);
    reg.sweep(t0 + 60 * second, Told{ .n = &n, .last = &last });
    // The guest, still connected, is told.
    try std.testing.expectEqual(1, n);
    try std.testing.expectEqual(rooms.EndReason.host_left, last.?);
    try std.testing.expectError(error.Taken, reg.hello(code, .host, &h.key, lang("en"), t0 + 61 * second));
}

test "a rejoin replaces a socket the server still holds; the old one cannot speak or leave" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const code, const h, const g = try paired(&reg, 9);
    // The phone locked without the connection closing, then came back on a new one.
    const again = try reg.hello(code, .host, &h.key, lang("en-US"), t0);
    try std.testing.expect(again.rejoined);
    try std.testing.expectEqual(Registry.State.replaced, reg.state(code, .host, h.epoch, t0));
    try std.testing.expectEqual(Registry.Left.none, reg.leave(code, .host, h.epoch, t0));
    try std.testing.expect(reg.state(code, .guest, g.epoch, t0).paired.peer_here);
    try std.testing.expect(reg.state(code, .host, again.epoch, t0) == .paired);
}

test "sweep tells waiting hosts of their expiry and forgets old tombstones" {
    var reg = Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const waiting = try reg.create("a", entropy(10), t0);
    _ = try reg.hello(waiting.code, .host, &waiting.host_key, lang("en"), t0);
    _ = try reg.create("a", entropy(70), t0); // no host to tell

    var n: usize = 0;
    var last: ?rooms.EndReason = null;
    reg.sweep(t0 + 10 * minute, Told{ .n = &n, .last = &last });
    try std.testing.expectEqual(1, n);
    try std.testing.expectEqual(rooms.EndReason.expired, last.?);
    try std.testing.expectEqual(0, reg.liveCount());
    // Remembered for another 10 minutes, then gone.
    reg.sweep(t0 + 20 * minute - 1, Told{ .n = &n, .last = &last });
    try std.testing.expect(reg.exists(waiting.code));
    reg.sweep(t0 + 20 * minute, Told{ .n = &n, .last = &last });
    try std.testing.expect(!reg.exists(waiting.code));
    try std.testing.expectEqual(1, n);
    try std.testing.expectError(error.NotFound, reg.hello(waiting.code, .guest, "", lang("fr"), t0 + 20 * minute));
}

test "rooms are bounded per client and in total; ended rooms do not count" {
    var reg = Registry.init(std.testing.allocator, .{ .max_rooms = 3, .max_rooms_per_client = 2 });
    defer reg.deinit();
    const first = try reg.create("a", entropy(10), t0);
    _ = try reg.create("a", entropy(60), t0);
    try std.testing.expectError(error.TooManyForClient, reg.create("a", entropy(110), t0));
    _ = try reg.create("b", entropy(160), t0);
    try std.testing.expectError(error.TooManyRooms, reg.create("c", entropy(210), t0));

    const h = try reg.hello(first.code, .host, &first.host_key, lang("en"), t0);
    _ = reg.leave(first.code, .host, h.epoch, t0);
    _ = try reg.create("a", entropy(250), t0);
}

test "tombstones are bounded: the oldest goes first" {
    var reg = Registry.init(std.testing.allocator, .{ .max_rooms = 1, .max_rooms_per_client = 1 });
    defer reg.deinit();
    var codes: [6]rooms.Code = undefined;
    for (&codes, 0..) |*c, i| {
        const at = t0 + @as(i64, @intCast(i));
        const room = try reg.create("a", entropy(@intCast(i * 40)), at);
        c.* = room.code;
        const h = try reg.hello(room.code, .host, &room.host_key, lang("en"), at);
        _ = reg.leave(room.code, .host, h.epoch, at);
    }
    // One live room's worth, plus three tombstones per room.
    try std.testing.expect(reg.rooms.count() <= 4);
    try std.testing.expect(!reg.exists(codes[0]));
    try std.testing.expect(reg.exists(codes[5]));
}

test "languages and codes are checked for shape only" {
    try std.testing.expect(rooms.validLanguage("en"));
    try std.testing.expect(rooms.validLanguage("zh-Hant-TW"));
    try std.testing.expect(!rooms.validLanguage("e"));
    try std.testing.expect(!rooms.validLanguage("en_US"));
    try std.testing.expect(!rooms.validLanguage("1en"));
    try std.testing.expect(!rooms.validLanguage("\"><script>"));
    try std.testing.expect(rooms.validCode("abcdefghijklmnopqrs-_0"));
    try std.testing.expect(!rooms.validCode("abcdefghijklmnopqrs-_"));
    try std.testing.expect(!rooms.validCode("abcdefghijklmnopqrs-_+"));
}
