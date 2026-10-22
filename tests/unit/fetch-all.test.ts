import { describe, it, expect } from "vitest";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * A fake PostgREST endpoint: every request is capped at `maxRows` rows per
 * page (HTTP still answers 200) and honors the range window.
 */
function fakeEndpoint(allRows: number[], maxRows: number) {
  let calls = 0;
  return {
    calls: () => calls,
    build: (range: { from: number; to: number }) => {
      calls += 1;
      const page = allRows.slice(range.from, Math.min(range.to + 1, allRows.length, range.from + maxRows));
      return Promise.resolve({ data: page, error: null });
    }
  };
}

describe("fetchAll (PostgREST max-rows pagination)", () => {
  it("walks every row past a capped page size", async () => {
    const rows = Array.from({ length: 1750 }, (_, i) => i);
    const endpoint = fakeEndpoint(rows, 1000);
    const result = await fetchAll<number>(endpoint.build, 500);
    expect(result).toEqual(rows);
    expect(endpoint.calls()).toBe(4); // 500 + 500 + 500 + 250
  });

  it("stops after one request when the table is smaller than a page", async () => {
    const endpoint = fakeEndpoint([1, 2, 3], 1000);
    const result = await fetchAll<number>(endpoint.build, 500);
    expect(result).toEqual([1, 2, 3]);
    expect(endpoint.calls()).toBe(1);
  });

  it("returns and empty array for an empty table without looping", async () => {
    const endpoint = fakeEndpoint([], 1000);
    const result = await fetchAll<number>(endpoint.build, 500);
    expect(result).toEqual([]);
    expect(endpoint.calls()).toBe(1);
  });

  it("rethrows real errors instead of swallowing them", async () => {
    await expect(
      fetchAll<number>(() => Promise.resolve({ data: null, error: { message: "boom" } }))
    ).rejects.toThrow("boom");
  });
});
