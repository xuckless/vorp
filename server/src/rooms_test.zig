//! The room states as a pure value: every call takes the time, so expiry is tested by
//! passing a later `now`, never by waiting.
const std = @import("std");
const rooms = @import("app").rooms;

const t0: i64 = 1_800_000_000_000;
const minute = std.time.ms_per_min;

fn entropy(seed: u8) [2 * rooms.secret_bytes]u8 {
    var e: [2 * rooms.secret_bytes]u8 = undefined;
    for (&e, 0..) |*b, i| b.* = seed +% @as(u8, @intCast(i));
    return e;
}

fn lang(text: []const u8) rooms.Language {
    return rooms.Language.init(text).?;
}

/// Counts the hosts `sweep` tells of an expiry.
const Expiries = struct {
    n: *usize,
    pub fn expired(self: @This(), _: rooms.Code) void {
        self.n.* += 1;
    }
};

test "a room pairs its host and one guest, who learn each other's language" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("198.51.100.7", entropy(1), t0);
    try std.testing.expect(rooms.validCode(&room.code));
    try std.testing.expect(!std.mem.eql(u8, &room.code, &room.host_key));
    try std.testing.expectEqual(t0 + 10 * minute, room.expires_ms);

    try std.testing.expectEqual(room.expires_ms, try reg.helloHost(room.code, &room.host_key, lang("en-US"), t0));
    try std.testing.expectEqual(rooms.Registry.State.waiting, reg.state(room.code, t0));
    const host_language = try reg.helloGuest(room.code, lang("fr-CA"), t0 + minute);
    try std.testing.expectEqualStrings("en-US", host_language.slice());
    try std.testing.expectEqual(rooms.Registry.State.paired, reg.state(room.code, t0 + minute));
    // A paired room does not expire.
    try std.testing.expectEqual(rooms.Registry.State.paired, reg.state(room.code, t0 + 60 * minute));
}

test "the code is single-use: a second guest is refused, during and after the session" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(2), t0);
    _ = try reg.helloHost(room.code, &room.host_key, lang("en"), t0);
    _ = try reg.helloGuest(room.code, lang("fr"), t0);
    try std.testing.expectError(error.Taken, reg.helloGuest(room.code, lang("de"), t0));
    try std.testing.expectEqual(rooms.EndReason.guest_stopped, reg.stop(room.code, .guest, t0).?);
    try std.testing.expectError(error.Taken, reg.helloGuest(room.code, lang("de"), t0));
}

test "the host needs its key, and only one host connects" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(3), t0);
    try std.testing.expectError(error.BadKey, reg.helloHost(room.code, "short", lang("en"), t0));
    var wrong = room.host_key;
    wrong[0] = if (wrong[0] == 'A') 'B' else 'A';
    try std.testing.expectError(error.BadKey, reg.helloHost(room.code, &wrong, lang("en"), t0));
    _ = try reg.helloHost(room.code, &room.host_key, lang("en"), t0);
    try std.testing.expectError(error.Taken, reg.helloHost(room.code, &room.host_key, lang("en"), t0));
}

test "an unused code expires after 10 minutes, and says so" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(4), t0);
    _ = try reg.helloHost(room.code, &room.host_key, lang("en"), t0);
    try std.testing.expectEqual(rooms.Registry.State.waiting, reg.state(room.code, t0 + 10 * minute - 1));
    try std.testing.expectError(error.Expired, reg.helloGuest(room.code, lang("fr"), t0 + 10 * minute));
    try std.testing.expectEqual(rooms.EndReason.expired, reg.state(room.code, t0 + 10 * minute).ended);
}

test "a guest finds the host gone when the host left before pairing" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(5), t0);
    // Not connected yet.
    try std.testing.expectError(error.HostGone, reg.helloGuest(room.code, lang("fr"), t0));
    _ = try reg.helloHost(room.code, &room.host_key, lang("en"), t0);
    try std.testing.expectEqual(rooms.EndReason.host_left, reg.leave(room.code, .host, t0).?);
    try std.testing.expectError(error.HostGone, reg.helloGuest(room.code, lang("fr"), t0));
    try std.testing.expectError(error.NotFound, reg.helloGuest(entropyCode(), lang("fr"), t0));
}

fn entropyCode() rooms.Code {
    return "AAAAAAAAAAAAAAAAAAAAAA".*;
}

test "either side ending ends the room once, with its reason" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const room = try reg.create("a", entropy(6), t0);
    _ = try reg.helloHost(room.code, &room.host_key, lang("en"), t0);
    _ = try reg.helloGuest(room.code, lang("fr"), t0);
    try std.testing.expectEqual(rooms.EndReason.host_stopped, reg.stop(room.code, .host, t0).?);
    // The guest's socket closing afterwards is no news.
    try std.testing.expectEqual(null, reg.leave(room.code, .guest, t0));
    try std.testing.expectEqual(rooms.EndReason.host_stopped, reg.state(room.code, t0).ended);
}

test "sweep tells waiting hosts of their expiry and forgets old tombstones" {
    var reg = rooms.Registry.init(std.testing.allocator, .{});
    defer reg.deinit();
    const waiting = try reg.create("a", entropy(7), t0);
    _ = try reg.helloHost(waiting.code, &waiting.host_key, lang("en"), t0);
    const unconnected = try reg.create("a", entropy(8), t0);
    _ = unconnected;

    var n: usize = 0;
    reg.sweep(t0 + 10 * minute, Expiries{ .n = &n });
    // Only the room with a host to tell.
    try std.testing.expectEqual(1, n);
    try std.testing.expectEqual(0, reg.liveCount());
    try std.testing.expect(reg.exists(waiting.code));
    // Remembered for another 10 minutes, then gone.
    reg.sweep(t0 + 20 * minute - 1, Expiries{ .n = &n });
    try std.testing.expect(reg.exists(waiting.code));
    reg.sweep(t0 + 20 * minute, Expiries{ .n = &n });
    try std.testing.expect(!reg.exists(waiting.code));
    try std.testing.expectEqual(1, n);
    try std.testing.expectError(error.NotFound, reg.helloGuest(waiting.code, lang("fr"), t0 + 20 * minute));
}

test "rooms are bounded per client and in total; ended rooms do not count" {
    var reg = rooms.Registry.init(std.testing.allocator, .{ .max_rooms = 3, .max_rooms_per_client = 2 });
    defer reg.deinit();
    const first = try reg.create("a", entropy(10), t0);
    _ = try reg.create("a", entropy(20), t0);
    try std.testing.expectError(error.TooManyForClient, reg.create("a", entropy(30), t0));
    _ = try reg.create("b", entropy(40), t0);
    try std.testing.expectError(error.TooManyRooms, reg.create("c", entropy(50), t0));

    _ = try reg.helloHost(first.code, &first.host_key, lang("en"), t0);
    _ = reg.leave(first.code, .host, t0);
    _ = try reg.create("a", entropy(60), t0);
}

test "tombstones are bounded: the oldest goes first" {
    var reg = rooms.Registry.init(std.testing.allocator, .{ .max_rooms = 1, .max_rooms_per_client = 1 });
    defer reg.deinit();
    var codes: [6]rooms.Code = undefined;
    for (&codes, 0..) |*c, i| {
        const room = try reg.create("a", entropy(@intCast(i * 40)), t0 + @as(i64, @intCast(i)));
        c.* = room.code;
        _ = try reg.helloHost(room.code, &room.host_key, lang("en"), t0);
        _ = reg.leave(room.code, .host, t0 + @as(i64, @intCast(i)));
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
