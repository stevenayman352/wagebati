import { describe, it, expect } from "vitest";
import { dayKey, dayLabel } from "@/components/conversation-thread";

const NOW = new Date(2026, 8, 17, 12, 0, 0); // Thursday, Sept 17, 2026 (local)

function iso(y: number, m: number, d: number): string {
  return new Date(y, m, d, 12, 0, 0).toISOString();
}

function weekdayName(value: string): string {
  return new Date(value).toLocaleDateString("ar", { weekday: "long" });
}

describe("dayKey", () => {
  it("groups messages from the same local day", () => {
    const morning = new Date(2026, 8, 17, 8, 0, 0).toISOString();
    const evening = new Date(2026, 8, 17, 20, 0, 0).toISOString();
    expect(dayKey(morning)).toBe(dayKey(evening));
  });

  it("distinguishes consecutive days", () => {
    expect(dayKey(iso(2026, 8, 17))).not.toBe(dayKey(iso(2026, 8, 18)));
  });
});

describe("dayLabel", () => {
  it("labels today as اليوم", () => {
    expect(dayLabel(iso(2026, 8, 17), NOW)).toEqual({ line1: "اليوم" });
  });

  it("labels yesterday as أمس", () => {
    expect(dayLabel(iso(2026, 8, 16), NOW)).toEqual({ line1: "أمس" });
  });

  it("shows only the weekday name for older days in the same week", () => {
    const sunday = iso(2026, 8, 13);
    const monday = iso(2026, 8, 14);
    expect(dayLabel(sunday, NOW)).toEqual({ line1: weekdayName(sunday) });
    expect(dayLabel(monday, NOW)).toEqual({ line1: weekdayName(monday) });
  });

  it("adds the date below the weekday name for previous weeks", () => {
    const saturdayLastWeek = iso(2026, 8, 12);
    const sundayLastWeek = iso(2026, 8, 6);
    const label = dayLabel(saturdayLastWeek, NOW);
    expect(label.line1).toBe(weekdayName(saturdayLastWeek));
    expect(label.line2).toBe(
      new Date(2026, 8, 12).toLocaleDateString("ar", { day: "numeric", month: "long" })
    );
    expect(dayLabel(sundayLastWeek, NOW).line2).toBeTruthy();
  });

  it("includes the year for dates in a different year", () => {
    const old = iso(2025, 11, 30);
    const label = dayLabel(old, NOW);
    expect(label.line2).toContain("2025");
  });
});