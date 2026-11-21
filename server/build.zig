const std = @import("std");

pub fn build(b: *std.Build) void {
    _ = @import("anole").addApp(b, .{
        .name = "vorp-token",
        .root_source_file = b.path("src/main.zig"),
        // REST and static files only: no HTTP/3, gRPC, MongoDB or Redis.
        .profile = .web,
    });
}
