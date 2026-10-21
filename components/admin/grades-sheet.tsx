"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveAdminGradeAction } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Download, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cellKey,
  formatGrade,
  gradeTone,
  studentTotals,
  type GradeSheetAssignment,
  type GradeSheetCells,
  type GradeSheetStudent
} from "@/lib/grades";

/**
 * How long typing pauses before the grade is written.
 *
 * Mirrors components/grade-autosave.tsx: every keystroke must not become a
 * write, or a grade of 1 lands on the way to 18 and every open student page
 * re-renders for a value nobody meant to record.
 */
const SAVE_DEBOUNCE_MS = 700;

type CellStatus = "idle" | "saving" | "saved" | "error";

const TONE_CLASS: Record<string, string> = {
  high: "border-success/40 bg-success/12 text-success",
  mid: "border-warning/50 bg-warning/15 text-warning-foreground",
  low: "border-destructive/40 bg-destructive/10 text-destructive"
};

/**
 * The admin grade sheet: students as rows, published assignments as columns.
 *
 * The matrix is the same one the Excel export builds, so what the admin edits
 * on screen and what the exported workbook shows can never drift apart.
 */
export function GradesSheet({
  classId,
  className,
  students,
  assignments,
  cells
}: {
  classId: string;
  className: string;
  students: GradeSheetStudent[];
  assignments: GradeSheetAssignment[];
  cells: GradeSheetCells;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [key, cell] of Object.entries(cells)) {
      initial[key] = cell.grade != null ? String(cell.grade) : "";
    }
    return initial;
  });
  const [statuses, setStatuses] = useState<Record<string, CellStatus>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const runs = useRef<Record<string, number>>({});
  // Cells the admin has touched but that are not confirmed by the server yet.
  // A background refresh must not overwrite what is being typed.
  const dirty = useRef<Set<string>>(new Set());

  // The server re-renders the page after every save, which hands this component
  // a fresh `cells` prop. Values the admin is mid-way through editing are kept
  // as they are; everything else follows the server.
  useEffect(() => {
    setValues((prev) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const [key, cell] of Object.entries(cells)) {
        if (dirty.current.has(key)) {
          next[key] = prev[key] ?? "";
          continue;
        }
        const value = cell.grade != null ? String(cell.grade) : "";
        next[key] = value;
        if (prev[key] !== value) changed = true;
      }
      for (const key of Object.keys(prev)) {
        if (!(key in cells)) changed = true;
      }
      return changed ? next : prev;
    });
  }, [cells]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      Object.values(pending).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  const assignmentById = useMemo(
    () => new Map(assignments.map((a) => [a.id, a])),
    [assignments]
  );

  const visibleStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;
    return students.filter(
      (student) =>
        student.name.toLowerCase().includes(needle) || student.code.toLowerCase().includes(needle)
    );
  }, [students, query]);

  function setStatus(key: string, status: CellStatus) {
    setStatuses((prev) => ({ ...prev, [key]: status }));
  }

  function cancelPending(key: string) {
    const timer = timers.current[key];
    if (!timer) return;
    clearTimeout(timer);
    delete timers.current[key];
  }

  async function commit(key: string, conversationId: string, value: string) {
    const run = (runs.current[key] = (runs.current[key] ?? 0) + 1);
    setStatus(key, "saving");
    setMessages((prev) => ({ ...prev, [key]: "" }));

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("grade", value);

    const state = await saveAdminGradeAction({ ok: false, message: "" }, formData);
    if (runs.current[key] !== run) return;

    if (state.ok) {
      dirty.current.delete(key);
      setStatus(key, "saved");
      return;
    }
    setStatus(key, "error");
    setMessages((prev) => ({ ...prev, [key]: state.message || "تعذر حفظ الدرجة." }));
  }

  async function clearGrade(key: string, conversationId: string) {
    const run = (runs.current[key] = (runs.current[key] ?? 0) + 1);
    cancelPending(key);
    setStatus(key, "saving");
    setMessages((prev) => ({ ...prev, [key]: "" }));

    const formData = new FormData();
    formData.set("conversationId", conversationId);
    formData.set("clear", "1");

    const state = await saveAdminGradeAction({ ok: false, message: "" }, formData);
    if (runs.current[key] !== run) return;

    if (state.ok) {
      dirty.current.delete(key);
      setValues((prev) => ({ ...prev, [key]: "" }));
      setStatus(key, "idle");
      return;
    }
    setStatus(key, "error");
    setMessages((prev) => ({ ...prev, [key]: state.message || "تعذر مسح الدرجة." }));
  }

  function handleChange(key: string, conversationId: string, next: string) {
    setValues((prev) => ({ ...prev, [key]: next }));
    dirty.current.add(key);
    setStatus(key, "idle");
    setMessages((prev) => ({ ...prev, [key]: "" }));
    cancelPending(key);

    // An empty field is "no grade", not a zero — writing it would record a mark
    // of 0 that the teacher never gave. Clearing is an explicit action.
    if (next.trim() === "") return;

    const assignment = assignmentById.get(key.split(":")[0]);
    const maxGrade = assignment?.maxGrade ?? 20;
    const grade = Number(next);
    if (!Number.isFinite(grade) || grade < 0 || grade > maxGrade) {
      setStatus(key, "error");
      setMessages((prev) => ({
        ...prev,
        [key]: `الدرجة يجب أن تكون بين 0 و ${formatGrade(maxGrade)}`
      }));
      return;
    }

    timers.current[key] = setTimeout(() => {
      delete timers.current[key];
      void commit(key, conversationId, next);
    }, SAVE_DEBOUNCE_MS);
  }

  function handleBlur(key: string, conversationId: string) {
    const timer = timers.current[key];
    if (!timer) return;
    const pending = values[key] ?? "";
    cancelPending(key);
    if (pending.trim() === "") return;
    const assignment = assignmentById.get(key.split(":")[0]);
    const maxGrade = assignment?.maxGrade ?? 20;
    const grade = Number(pending);
    if (!Number.isFinite(grade) || grade < 0 || grade > maxGrade) return;
    void commit(key, conversationId, pending);
  }

  if (assignments.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-sm text-muted-foreground">
        لا توجد واجبات منشورة في هذا الصف بعد — تظهر الأعمدة هنا فور نشر واجب.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            dir="rtl"
            type="search"
            value={query}
            placeholder="ابحث باسم الطالب أو الكود..."
            aria-label="بحث في طلاب الصف"
            className="ps-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {visibleStudents.length} طالب · {assignments.length} واجب
          </span>
          <Button asChild variant="outline" size="sm">
            <a href={`/preview?target=class&format=xlsx&id=${classId}`} className="gap-1">
              <Download className="size-3.5" /> إكسل
            </a>
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/70">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted">
              <th className="sticky start-0 z-20 w-[12rem] min-w-[12rem] border-b border-border/70 bg-muted px-3 py-2 text-start font-bold">
                الطالب
              </th>
              <th className="sticky start-[12rem] z-20 w-[6rem] min-w-[6rem] border-b border-border/70 bg-muted px-3 py-2 text-center font-bold">
                الكود
              </th>
              {assignments.map((assignment) => (
                <th
                  key={assignment.id}
                  className="min-w-[8rem] border-b border-border/70 bg-muted px-2 py-2 text-center font-bold"
                  title={assignment.title}
                >
                  <span className="line-clamp-2 text-[0.8rem] font-semibold leading-tight">
                    {assignment.title}
                  </span>
                  <span className="block text-[0.65rem] font-normal text-muted-foreground">
                    من {formatGrade(assignment.maxGrade)}
                  </span>
                </th>
              ))}
              <th className="min-w-[6rem] border-b border-border/70 bg-muted px-2 py-2 text-center font-bold">
                المجموع
              </th>
              <th className="min-w-[5rem] border-b border-border/70 bg-muted px-2 py-2 text-center font-bold">
                النسبة
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleStudents.map((student) => {
              const totals = studentTotals(student.id, assignments, values);
              return (
                <tr key={student.id} className="hover:bg-muted/40">
                  <td className="sticky start-0 z-10 border-b border-border/50 bg-card px-3 py-1.5 font-semibold">
                    {student.name}
                  </td>
                  <td className="sticky start-[12rem] z-10 border-b border-border/50 bg-card px-3 py-1.5 text-center font-mono text-xs text-muted-foreground">
                    {student.code}
                  </td>
                  {assignments.map((assignment) => {
                    const key = cellKey(assignment.id, student.id);
                    const cell = cells[key];
                    if (!cell) {
                      return (
                        <td
                          key={key}
                          className="border-b border-border/50 px-2 py-1.5 text-center text-muted-foreground/40"
                          title="لا يوجد واجب منشور لهذا الطالب"
                        >
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={key} className="border-b border-border/50 px-1.5 py-1.5">
                        <GradeInput
                          key={key}
                          value={values[key] ?? ""}
                          status={statuses[key] ?? "idle"}
                          message={messages[key]}
                          maxGrade={assignment.maxGrade}
                          onChange={(next) => handleChange(key, cell.conversationId, next)}
                          onBlur={() => handleBlur(key, cell.conversationId)}
                          onClear={() => void clearGrade(key, cell.conversationId)}
                        />
                      </td>
                    );
                  })}
                  <td className="border-b border-border/50 px-2 py-1.5 text-center font-bold">
                    {totals.sum > 0 ? formatGrade(totals.sum) : "—"}
                  </td>
                  <td
                    className={cn(
                      "border-b border-border/50 px-2 py-1.5 text-center font-semibold",
                      totals.percent >= 90 && totals.sum > 0 && "text-success",
                      totals.percent < 70 && totals.sum > 0 && "text-destructive"
                    )}
                  >
                    {totals.sum > 0 ? `${formatGrade(totals.percent)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {visibleStudents.length === 0 ? (
              <tr>
                <td
                  colSpan={assignments.length + 4}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  لا يوجد طالب بهذا الاسم.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        الدرجات تُحفظ تلقائيًا بعد التوقف عن الكتابة. اضغط × لإلغاء تسجيل درجة.
        {className ? ` — ${className}` : ""}
      </p>
    </div>
  );
}

function GradeInput({
  value,
  status,
  message,
  maxGrade,
  onChange,
  onBlur,
  onClear
}: {
  value: string;
  status: CellStatus;
  message?: string;
  maxGrade: number;
  onChange: (next: string) => void;
  onBlur: () => void;
  onClear: () => void;
}) {
  const grade = value.trim() === "" ? null : Number(value);
  const tone = gradeTone(grade, maxGrade);

  return (
    <div className="flex items-center justify-center gap-1">
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={maxGrade}
          step={0.5}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-label="الدرجة"
          title={message || undefined}
          className={cn(
            "h-8 w-20 px-1 text-center font-semibold",
            tone !== "none" && TONE_CLASS[tone],
            status === "error" && "border-destructive focus-visible:border-destructive"
          )}
        />
        {status === "saving" ? (
          <Loader2 className="pointer-events-none absolute end-1 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
        {status === "saved" ? (
          <Check className="pointer-events-none absolute end-1 top-1/2 size-3.5 -translate-y-1/2 text-success" />
        ) : null}
      </div>
      {value.trim() === "" ? null : (
        <button
          type="button"
          onClick={onClear}
          disabled={status === "saving"}
          aria-label="مسح الدرجة"
          title="مسح الدرجة"
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
