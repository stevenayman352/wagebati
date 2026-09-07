"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { deleteClassAction } from "@/app/actions/admin";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClassRowProps = {
  id: string;
  name: string;
  gradeLabel: string | null;
  students: number;
  teachers: number;
};

export function ClassRow({ id, name, gradeLabel, students, teachers }: ClassRowProps) {
  const [deleteState, requestDelete, isDeleting] = useActionState(
    async (prevState: ActionState, formData: FormData) => {
      return await deleteClassAction(prevState, formData);
    },
    { ok: false, message: "" }
  );
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 p-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{name}</span>
          {gradeLabel ? <Badge variant="secondary">{gradeLabel}</Badge> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {students} طلاب · {teachers} مُدرّسون
        </p>
      </div>
      <div className="flex gap-1.5">
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export?target=class&format=xlsx&id=${id}`} className="gap-1">
            <Download className="size-3.5" /> إكسل
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/api/export?target=class&format=pdf&id=${id}`}>PDF</a>
        </Button>

        {!showConfirm ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={() => setShowConfirm(true)}
            disabled={isDeleting}
          >
            <Trash2 className="size-3.5" /> حذف
          </Button>
        ) : (
          <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}
            >
              إلغاء
            </Button>
            <form action={requestDelete}>
              <input type="hidden" name="classId" value={id} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={isDeleting}
              >
                {isDeleting ? "جاري الحذف..." : "تأكيد"}
              </Button>
            </form>
          </div>
        )}
      </div>
      {deleteState.message && (
        <p className={cn("text-xs mt-1", deleteState.ok ? "text-green-500" : "text-destructive")}>
          {deleteState.message}
        </p>
      )}
    </div>
  );
}
