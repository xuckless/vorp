const std = @import("std");
const anole = @import("anole");

pub fn build(b: *std.Build) void {
    const app = anole.addApp(b, .{
        .name = "vorp-token",
        .root_source_file = b.path("src/main.zig"),
        // REST and static files only: no HTTP/3, gRPC, MongoDB or Redis.
        .profile = .web,
    });

    // `zig build test`: src/main_test.zig serves the same routes in memory.
    // `zig build test -Dtest-filter="pairing"`: only the tests whose names contain it.
    const filters: []const []const u8 = if (b.option([]const u8, "test-filter", "Run only the tests whose names contain this")) |f| &.{f} else &.{};
    const tests = b.addTest(.{ .filters = filters, .root_module = b.createModule(.{
        .root_source_file = b.path("src/main_test.zig"),
        .target = app.exe.root_module.resolved_target,
        .optimize = app.exe.root_module.optimize,
        .imports = &.{
            .{ .name = "anole", .module = app.anole.module("anole") },
            .{ .name = "app", .module = app.exe.root_module },
        },
    }) });
    b.step("test", "Run the tests").dependOn(&b.addRunArtifact(tests).step);
}
