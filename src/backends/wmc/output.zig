const std = @import("std");

const Value = union(enum) {
    int: i64,
    boolean: bool,
    string: []const u8,
    void_val: void,
    func: WmFunc,

    pub fn initInt(n: i64) Value { return .{ .int = n }; }
    pub fn initBool(b: bool) Value { return .{ .boolean = b }; }
    pub fn initString(s: []const u8) Value { return .{ .string = s }; }
    pub fn initVoid() Value { return .{ .void_val = {} }; }
    pub fn toBool(self: Value) bool {
        return switch (self) {
            .boolean => |b| b,
            .int => |n| n != 0,
            else => true,
        };
    }
};

const WmFunc = struct {
    f: *const fn (Value) Value,
    pub fn init(f: *const fn (Value) Value) Value { return .{ .func = .{ .f = f } }; }
    pub fn call(self: WmFunc, args: anytype) Value { return self.f(args[0]); }
};

const rt = struct {
    fn intAdd(a: Value, b: Value) Value { return Value.initInt(a.int + b.int); }
    fn intSub(a: Value, b: Value) Value { return Value.initInt(a.int - b.int); }
    fn intMul(a: Value, b: Value) Value { return Value.initInt(a.int * b.int); }
    fn intDiv(a: Value, b: Value) Value { return Value.initInt(@divTrunc(a.int, b.int)); }
    fn intEq(a: Value, b: Value) Value { return Value.initBool(a.int == b.int); }
    fn intNe(a: Value, b: Value) Value { return Value.initBool(a.int != b.int); }
    fn intLt(a: Value, b: Value) Value { return Value.initBool(a.int < b.int); }
    fn intGt(a: Value, b: Value) Value { return Value.initBool(a.int > b.int); }
    fn intLe(a: Value, b: Value) Value { return Value.initBool(a.int <= b.int); }
    fn intGe(a: Value, b: Value) Value { return Value.initBool(a.int >= b.int); }
    fn boolAnd(a: Value, b: Value) Value { return Value.initBool(a.toBool() and b.toBool()); }
    fn boolOr(a: Value, b: Value) Value { return Value.initBool(a.toBool() or b.toBool()); }
    fn boolNot(a: Value) Value { return Value.initBool(!a.toBool()); }
    fn print(v: Value) Value {
        switch (v) {
            .int => |n| std.debug.print("{d}\n", .{n}),
            .boolean => |b| std.debug.print("{s}\n", .{if (b) "true" else "false"}),
            .string => |s| std.debug.print("{s}\n", .{s}),
            .void_val => std.debug.print("void\n", .{}),
            .func => std.debug.print("<function>\n", .{}),
        }
        return Value.initVoid();
    }
    fn panic_wm(v: Value) Value {
        switch (v) {
            .string => |s| @panic(s),
            else => @panic("workman panic"),
        }
    }
};

const wm_main = WmFunc.init(struct { fn f(_: Value) Value { return __blk_0: { const x = rt.intAdd(Value.initInt(1), Value.initInt(1)); break :__blk_0 __blk_1: { _ = rt.print(x); break :__blk_1 Value.initVoid(); }; }; } }.f);
pub fn main() void {
    _ = wm_main.func.f(Value.initVoid());
}

