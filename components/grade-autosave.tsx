"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveGradeAction } from "@/app/actions/teacher";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Trophy, Check } from "lucide-react";

/**
 * How long typing pauses before the grade is written.
 *
 * Every keystroke used to run `saveGradeAction`, which is a Server Action *and*
 * revalidates `/teacher` plus `/student`. Typing "18" therefore issued two full
 * function invocations, persisted an intermediate grade of 1 that nobody ever
 * meant to record, and produced a `grades` change that made every open student
 * page re-render. Letting the value settle writes the grade that was actually
 * typed, once.
 */
const SAVE_DEBOUNCE_MS = 700;

export function GradeAutosave({
  conversationId,
  maxGrade,
  initialGrade
}: {
  conversationId: string;
  maxGrade: number;
  initialGrade: number | null;
}) {
  const [value, setValue] = useState<string>(initialGrade != null ? String(initialGrade) : "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped per save so a slow earlier response cannot overwrite the state that
  // a later keystroke already produced.
  const runRef = useRef(0);

  const cancelPending = useCallback(() => {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const isValid = useCallback(
    (next: string) => {
      const num = Number(next);
      return !Number.isNaN(num) && num >= 0 && num <= maxGrade;
    },
    [maxGrade]
  );

  const save = useCallback(
    async (next: string) => {
      const run = ++runRef.current;
      setSaving(true);
      const fd = new FormData();
      fd.set("conversationId", conversationId);
      fd.set("grade", next);
      fd.set("maxGrade", String(maxGrade));
      const state: ActionState = await saveGradeAction({ ok: false, message: "" }, fd);
      if (run !== runRef.current) return;
      setSaving(false);
      if (state.ok) {
        // The page re-renders the grade through LiveGradeRefresh (debounced
        // realtime subscription) so we don't force a full router.refresh() on
        // every keystroke-save.
        setSaved(true);
      } else setError(state.message || "تعذر حفظ الدرجة.");
    },
    [conversationId, maxGrade]
  );

  // A pending write must not be dropped if the field unmounts mid-debounce.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  function handleChange(next: string) {
    setValue(next);
    setSaved(false);
    setError(null);
    cancelPending();
    if (next === "") return;

    if (!isValid(next)) {
      setError("الدرجة يجب أن تكون بين 0 و " + maxGrade);
      return;
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save(next);
    }, SAVE_DEBOUNCE_MS);
  }

  /** Leaving the field commits what is typed rather than waiting out the timer. */
  function handleBlur() {
    if (!timerRef.current) return;
    const pending = value;
    cancelPending();
    if (pending === "" || !isValid(pending)) return;
    void save(pending);
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold",
        saved ? "border-success/30 bg-success/10 text-success" : "border-border/70 bg-muted/40 text-muted-foreground"
      )}
      title={error ?? undefined}
    >
      <Trophy className="size-3.5" />
      <label htmlFor={`grade-${conversationId}`} className="sr-only">
        الدرجة
      </label>
      <input
        id={`grade-${conversationId}`}
        type="number"
        min={0}
        max={maxGrade}
        step={0.5}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="w-16 bg-transparent text-end outline-none"
        placeholder="الدرجة"
      />
      من {maxGrade}
      {saving ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {saved && !saving ? (
        <Check className="size-3.5" />
      ) : null}
    </span>
  );
}