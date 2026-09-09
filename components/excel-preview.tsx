"use client";

import { useState, useEffect, useRef } from "react";
import { read, utils, type Sheet } from "xlsx";
import { Loader2 } from "lucide-react";

type ParsedSheet = {
  name: string;
  banner: string;
  headers: string[];
  rows: string[][];
  gradeMax: Record<number, number>;
  totalCols: number[];
};

function isBannerRow(row: unknown[]): boolean {
  const nonEmpty = row.filter((c) => c != null && String(c).trim() !== "");
  return nonEmpty.length <= 1;
}

function parseWorkbook(wb: ReturnType<typeof read>): ParsedSheet[] {
  const result: ParsedSheet[] = [];
  for (const name of wb.SheetNames) {
    const ws: Sheet = wb.Sheets[name];
    const data: unknown[][] = utils.sheet_to_json(ws, { header: 1, defval: "" });

    if (data.length === 0) {
      result.push({ name, banner: "", headers: [], rows: [], gradeMax: {}, totalCols: [] });
      continue;
    }

    const hasBanner = data.length >= 2 && isBannerRow(data[0]);
    const headerRow = (hasBanner ? data[1] : data[0]) ?? [];
    const headers = headerRow.map((c) => (c == null ? "" : String(c)));
    const rows = (hasBanner ? data.slice(2) : data.slice(1)).map((r) =>
      r.map((c) => (c == null ? "" : String(c)))
    );

    let banner = "";
    if (hasBanner) {
      const cell = (data[0] ?? []).find((c) => c != null && String(c).trim() !== "");
      banner = cell == null ? "" : String(cell);
    }

    const gradeMax: Record<number, number> = {};
    headers.forEach((h, idx) => {
      const m = h.match(/\(من\s*(\d+(?:\.\d+)?)\)/);
      if (m) gradeMax[idx] = Number.parseFloat(m[1]);
    });

    const totalCols: number[] = [];
    headers.forEach((h, idx) => {
      if (h.includes("المجموع") || h.includes("مجموع")) totalCols.push(idx);
    });

    result.push({ name, banner, headers, rows, gradeMax, totalCols });
  }
  return result;
}

function cellClass(
  cell: string,
  colIdx: number,
  sheet: ParsedSheet
): string {
  if (sheet.totalCols.includes(colIdx) && cell.trim() !== "") {
    return "bg-[#78350f] text-[#fde68a] font-bold";
  }
  const num = Number.parseFloat(cell);
  if (!Number.isFinite(num)) return "";
  const max = sheet.gradeMax[colIdx];
  if (!max || max <= 0) return "";
  const ratio = num / max;
  if (ratio >= 0.9) return "bg-[#166534] text-[#bbf7d0]";
  if (ratio >= 0.7) return "bg-[#92400e] text-[#fed7aa]";
  return "bg-[#991b1b] text-[#fecaca]";
}

function SheetTable({ sheet }: { sheet: ParsedSheet }) {
  const colCount = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length));

  return (
    <div className="mb-6">
      <p className="mb-1.5 text-xs font-semibold text-slate-400">{sheet.name}</p>
      <div className="overflow-hidden rounded-xl border border-white/10">
        {sheet.banner ? (
          <div className="bg-[#1F4E79] px-4 py-2.5 text-center text-sm font-extrabold text-white">
            {sheet.banner}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table dir="rtl" className="border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                {Array.from({ length: colCount }, (_, idx) => (
                  <th
                    key={idx}
                    className="whitespace-nowrap border border-[#2a2a2a] bg-[#1e40af] px-3 py-2 font-bold text-white"
                  >
                    {sheet.headers[idx] ?? ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, r) => (
                <tr key={r} className={r % 2 === 1 ? "bg-[#1a1a2e]" : "bg-[#121212]"}>
                  {Array.from({ length: colCount }, (_, c) => {
                    const val = row[c] ?? "";
                    const cls = cellClass(val, c, sheet);
                    const isName = c === 0;
                    return (
                      <td
                        key={c}
                        className={
                          "whitespace-nowrap border border-[#2a2a2a] px-3 py-1.5 text-slate-200" +
                          (cls ? ` ${cls}` : "") +
                          (isName ? " font-semibold" : "")
                        }
                      >
                        {val}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ExcelPreview({
  fileUrl,
  scale
}: {
  fileUrl: string;
  scale: number;
}) {
  const [sheets, setSheets] = useState<ParsedSheet[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const wb = read(new Uint8Array(buf), { type: "array" });
        if (!cancelled) setSheets(parseWorkbook(wb));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "فشل تحميل الملف");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [fileUrl]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (loading || !sheets) {
    return (
      <div className="flex items-center gap-2 py-20 text-white/70">
        <Loader2 className="size-5 animate-spin" />
        <span className="text-sm">جارِ التحميل...</span>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-w-full py-3" style={{ zoom: scale }}>
      {sheets.map((sheet) => (
        <SheetTable key={sheet.name} sheet={sheet} />
      ))}
    </div>
  );
}