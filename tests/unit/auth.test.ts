import { describe, it, expect } from "vitest";
import { isRoleAllowed, mustChangePassword, dashboardPath } from "@/lib/auth";
import type { Profile } from "@/lib/types";

function profile(over: Partial<Profile>): Profile {
  return {
    id: "u1",
    role: "student",
    full_name: "طالب",
    email: "s@wajebaty.local",
    code: "stud01",
    is_active: true,
    must_change_password: false,
    last_login_at: null,
    ...over
  };
}

describe("isRoleAllowed (role authorization)", () => {
  it("allows an active user whose role is in the required set", () => {
    expect(isRoleAllowed(profile({ role: "teacher" }), ["teacher", "admin"])).toBe(true);
  });

  it("denies a role not in the required set (role escalation guard)", () => {
    expect(isRoleAllowed(profile({ role: "student" }), ["teacher", "admin"])).toBe(false);
    expect(isRoleAllowed(profile({ role: "student" }), ["student"])).toBe(true);
  });

  it("denies inactive accounts", () => {
    expect(isRoleAllowed(profile({ is_active: false }), ["student"])).toBe(false);
  });

  it("denies access until password is changed (password-change gate)", () => {
    const pending = profile({ must_change_password: true });
    expect(isRoleAllowed(pending, ["student"])).toBe(false);
  });
});

describe("mustChangePassword", () => {
  it("is true only for active accounts that must change password", () => {
    expect(mustChangePassword(profile({ must_change_password: true }))).toBe(true);
    expect(mustChangePassword(profile({ must_change_password: false }))).toBe(false);
    expect(mustChangePassword(profile({ must_change_password: true, is_active: false }))).toBe(false);
    expect(mustChangePassword(null)).toBe(false);
  });
});

describe("dashboardPath", () => {
  it("maps each role to its dashboard route", () => {
    expect(dashboardPath("admin")).toBe("/admin");
    expect(dashboardPath("teacher")).toBe("/teacher");
    expect(dashboardPath("student")).toBe("/student");
  });
});

describe("auth flows (integration-level helpers)", () => {
  it("blocks cross-role access end-to-end", () => {
    const teacher = profile({ role: "teacher", must_change_password: true });
    const allowedAfterChange = profile({ role: "teacher", must_change_password: false });
    expect(isRoleAllowed(teacher, ["teacher"])).toBe(false);
    expect(isRoleAllowed(allowedAfterChange, ["teacher"])).toBe(true);
  });

  it("a student cannot reach teacher/admin dashboards", () => {
    const student = profile({ role: "student" });
    expect(isRoleAllowed(student, ["admin"])).toBe(false);
    expect(isRoleAllowed(student, ["teacher"])).toBe(false);
    expect(isRoleAllowed(student, ["student"])).toBe(true);
  });
});
