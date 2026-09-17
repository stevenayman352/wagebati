"use client";

import { useState } from "react";
import { CalendarClock, Unlock } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { DueDateInputs } from "@/components/due-date-inputs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { reopenAssignmentAction } from "@/app/actions/teacher";

type ReopenMode = "deadline" | "manual";

export function ReopenAssignmentDialog({ assignmentId, disabled = false }: { assignmentId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReopenMode>("deadline");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled} className="gap-1.5 bg-success text-white hover:bg-success/90">
          <Unlock className="h-4 w-4" />
          فتح الواجب
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>فتح الواجب</DialogTitle>
          <DialogDescription>
            الواجب مغلق حاليًا. ستُعاد فتح محادثات الطلاب غير المكتملين فقط، مع الحفاظ على المكتمل منهم. اختر كيف تريد إعادة فتح الاستلام.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => setMode("deadline")}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-lg)] border p-3.5 text-right transition-colors",
              mode === "deadline" ? "border-primary/50 bg-primary/5" : "border-border/70 hover:bg-muted"
            )}
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarClock className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">بموعد جديد</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">يفتح الاستلام حتى الموعد الذي تحدده.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-lg)] border p-3.5 text-right transition-colors",
              mode === "manual" ? "border-primary/50 bg-primary/5" : "border-border/70 hover:bg-muted"
            )}
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <Unlock className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">بدون موعد (إغلاق يدوي)</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                يبقى الواجب مفتوحًا حتى تقوم بإنهائه بنفسك.
              </span>
            </span>
          </button>
        </div>

        <DialogFooter>
          <ActionForm action={reopenAssignmentAction} submitLabel="نعم، فتح الواجب" className="grid gap-2">
            <input type="hidden" name="assignmentId" value={assignmentId} />
            {mode === "deadline" ? <DueDateInputs /> : <input type="hidden" name="dueAt" value="" />}
          </ActionForm>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}