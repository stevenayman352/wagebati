import { describe, expect, it } from "vitest";
import { formatAppDate, formatAppTime, schoolLocalToISO } from "@/lib/dates";

describe("school time helpers (Etc/GMT-3, UTC+3)", () => {
  it("converts school local 22:00 on Sep 10 to 19:00Z", () => {
    expect(schoolLocalToISO("2026-09-10", "22:00")).toBe("2026-09-10T19:00:00.000Z");
  });

  it("crosses midnight correctly (school next-day 00:30 -> same-day 21:30Z)", () => {
    expect(schoolLocalToISO("2026-09-11", "00:30")).toBe("2026-09-10T21:30:00.000Z");
  });

  it("formatAppDate renders the school date, not the Z offset", () => {
    const out = formatAppDate("2026-09-10T19:00:00.000Z");
    expect(out).toMatch(/10/);
    expect(out).not.toMatch(/11/);
  });

  it("formatAppTime renders school time (10 PM) for 19:00Z", () => {
    expect(formatAppTime("2026-09-10T19:00:00.000Z")).toContain("10");
  });
});