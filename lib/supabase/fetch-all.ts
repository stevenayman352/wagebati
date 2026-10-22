/**
 * PostgREST answers HTTP 200 but caps every request at the project's max-rows
 * setting (`db-max-rows`, 1000 on this project), so an unpaged select silently
 * drops every row past the cap — the teacher dashboard and statistics pages
 * were reading 1000 of 1086 conversations without any error. This helper
 * pages a query forward until a page comes back short.
 *
 * Two requirements on `build`:
 *   - every page needs a fresh query chain: postgrest-js builders are
 *     single-use and `range()` mutates the URL of the builder it is called on,
 *   - and a stable ORDER BY on a unique column (e.g. `.order("id")`), so page
 *     windows cannot overlap or skip rows.
 */
export type FetchPage<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

export async function fetchAll<T>(
  // The raw postgrest-js builder is deliberately typed as an unshaped
  // thenable: with an untyped supabase client its embed rows are `any[]`
  // arrays, so forcing the caller to cast and then casting once here keeps
  // the call sites clean.
  build: (range: { from: number; to: number }) => PromiseLike<unknown>,
  pageSize = 500
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = (await build({ from, to: from + pageSize - 1 })) as FetchPage<T>;
    if (result.error) throw new Error(`fetchAll: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
