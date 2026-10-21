"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Table2, Trash2 } from "lucide-react";
import { useActionState } from "react";
import { deleteClassAction } from "@/app/actions/admin";
import { TransferClassStudentsDialog } from "@/components/transfer-class-students-dialog";
import { EditClassDialog } from "@/components/edit-class-dialog";
import type { TransferClass } from "@/lib/transfer";
import type { ActionState } from "@/lib/types";
import { cn } from "@/lib/utils";

type ClassStudent = { id: string; name: string; code: string };

type ClassRowProps = {
  id: string;
  name: string;
  gradeLabel: string | null;
  students: number;
  teachers: number;
  classStudents: ClassStudent[];
  allClasses: TransferClass[];
};

export function ClassRow({ id, name, gradeLabel, students, teachers, classStudents, allClasses }: ClassRowProps) {
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
          {gradeLabel ? <Badge variant="secondary">{gradeLabel}</Badge> : <Badge variant="outline">بدون سنة</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          {students} طلاب · {teachers} مُدرّسون
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <TransferClassStudentsDialog
          sourceClass={{ id, name, gradeLabel: String(gradeLabel ?? "") }}
          students={classStudents}
          allClasses={allClasses}
        />
        <EditClassDialog id={id} name={name} gradeLabel={String(gradeLabel ?? "")} />
        <Button asChild variant="outline" size="sm">
          <a href={`/admin/grades?class=${id}`} className="gap-1">
            <Table2 className="size-3.5" /> الدرجات
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/preview?target=class&format=xlsx&id=${id}`} className="gap-1">
            <Download className="size-3.5" /> إكسل
          </a>
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
