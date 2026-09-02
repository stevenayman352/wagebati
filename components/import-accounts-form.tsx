"use client";

import { useActionState, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, Download, FileUp } from "lucide-react";
import type { ActionState } from "@/lib/types";

type Props = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
};

const initialState: ActionState = { ok: false, message: "" };

const COLUMN_LABELS: Record<string, string> = {
  code: "code",
  name: "name",
  role: "role",
  class: "class",
  password: "password",
  file: "ملف"
};

export function ImportAccountsForm({ action }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [dismissed, setDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = Boolean(state.message) && !pending && !dismissed;

  const pickFile = () => fileRef.current?.click();

  const handleFileChange = () => {
    const input = fileRef.current;
    if (!input?.files?.length) return;
    setDismissed(false);
    formRef.current?.requestSubmit();
    input.value = "";
  };

  const created = state.created ?? 0;
  const rejected = state.rejected ?? 0;
  const approved = Boolean(state.ok) && created > 0;

  return (
    <>
      <form ref={formRef} action={formAction} className="space-y-3">
        <input
          ref={fileRef}
          name="file"
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileChange}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={pickFile} disabled={pending} className="flex-1">
            <FileUp className="size-4" />
            {pending ? "جار الاستيراد..." : "استيراد الحسابات"}
          </Button>
          <Button asChild variant="outline">
            <a href="/api/import-template" download>
              <Download className="size-4" /> تحميل القالب
            </a>
          </Button>
        </div>
      </form>

      <Dialog open={open} onOpenChange={(value) => { if (!value) setDismissed(true); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader className="flex items-center gap-2">
            <span
              className={`flex size-11 items-center justify-center rounded-full ${
                approved
                  ? "bg-success/10 text-success"
                  : rejected > 0
                    ? "bg-warning/10 text-warning"
                    : "bg-destructive/10 text-destructive"
              }`}
            >
              {approved ? <CheckCircle2 className="size-6" /> : <AlertCircle className="size-6" />}
            </span>
            <DialogTitle className="text-lg">
              {approved ? "تقرير الاستيراد" : "تعذر الاستيراد"}
            </DialogTitle>
            <DialogDescription className="text-center">{state.message}</DialogDescription>
          </DialogHeader>

          {created > 0 || rejected > 0 ? (
            <div className="flex items-center justify-center gap-3">
              {created > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-sm font-bold text-success">
                  <CheckCircle2 className="size-4" /> تم إنشاء {created} حساب
                </span>
              ) : null}
              {rejected > 0 ? (
                <span className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive">
                  <AlertCircle className="size-4" /> مرفوض {rejected}
                </span>
              ) : null}
            </div>
          ) : null}

          {(state.issues?.length ?? 0) > 0 ? (
            <div className="max-h-52 space-y-1.5 overflow-y-auto rounded-xl border border-border/70 bg-secondary/40 p-3">
              <p className="text-xs font-bold text-muted-foreground">تفاصيل المشاكل:</p>
              {state.issues!.map((issue, index) => (
                <p key={index} className="text-xs leading-relaxed text-muted-foreground">
                  الصف {issue.row} · عمود {COLUMN_LABELS[issue.column] ?? issue.column}: {issue.message}
                </p>
              ))}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button className="w-full sm:w-auto">إغلاق</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}