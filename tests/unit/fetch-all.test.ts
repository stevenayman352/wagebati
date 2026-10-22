import { describe, it, expect } from "vitest";
import { chunkIds, fetchAll, fetchAllInChunks, ID_CHUNK_SIZE } from "@/lib/supabase/fetch-all";

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

describe("chunkIds", () => {
  it("splits an id list into URL-sized groups", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const chunks = chunkIds(ids);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks.flat()).toEqual(ids);
  });

  it("returns nothing for an empty list", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("keeps a real id filter under the gateway URL limit", () => {
    // 1086 UUIDs in one `in()` filter is ~40 KB of URL and answered
    // 400 Bad Request; 100 UUIDs is ~3.7 KB, which the gateway accepts.
    expect(ID_CHUNK_SIZE * 37).toBeLessThan(8 * 1024);
  });
});

describe("fetchAllInChunks", () => {
  it("queries every chunk, pages each one, and concatenates in order", async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const seen: string[][] = [];
    const result = await fetchAllInChunks<{ conversation_id: string }>(ids, (chunk, range) => {
      seen.push(chunk);
      const rows = chunk.map((id) => ({ conversation_id: id }));
      return Promise.resolve({ data: rows.slice(range.from, range.to + 1), error: null });
    });
    expect(seen.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(result).toEqual(ids.map((id) => ({ conversation_id: id })));
  });

  it("makes one request per chunk and no request for an empty list", async () => {
    let calls = 0;
    const build = (chunk: string[]) => {
      calls += 1;
      return Promise.resolve({ data: chunk.map((id) => ({ conversation_id: id })), error: null });
    };
    await fetchAllInChunks(["a", "b"], build);
    expect(calls).toBe(1);
    calls = 0;
    await fetchAllInChunks([], build);
    expect(calls).toBe(0);
  });

  it("surfaces an error from any chunk", async () => {
    await expect(
      fetchAllInChunks(["a"], () => Promise.resolve({ data: null, error: { message: "Bad Request" } }))
    ).rejects.toThrow("Bad Request");
  });
});
