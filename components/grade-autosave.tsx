"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveGradeAction } from "@/app/actions/teacher";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Trophy, Check } from "lucide-react";

export function GradeAutosave({
  conversationId,
  maxGrade,
  initialGrade
}: {
  conversationId: string;
  maxGrade: number;
  initialGrade: number | null;
}) {
  const [value, setValue] = useState(initialGrade ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleChange(next: string) {
    setValue(next);
    setSaved(false);
    setError(null);
    if (next === "") return;

    const num = Number(next);
    if (Number.isNaN(num) || num < 0 || num > maxGrade) {
      setError("الدرجة يجب أن تكون بين 0 و " + maxGrade);
      return;
    }

    setSaving(true);
    const fd = new FormData();
    fd.set("conversationId", conversationId);
    fd.set("grade", next);
    fd.set("maxGrade", String(maxGrade));
    const state: ActionState = await saveGradeAction({ ok: false, message: "" }, fd);
    setSaving(false);
    if (state.ok) {
      setSaved(true);
      router.refresh();
    } else setError(state.message || "تعذر حفظ الدرجة.");
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
        onChange={(e) => void handleChange(e.target.value)}
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