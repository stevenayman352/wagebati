"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { updateClassAction } from "@/app/actions/admin";
import { Pencil } from "lucide-react";
import type { ActionState } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };

/**
 * Edits a class name and its year/stage label. The year label decides whether
 * a transfer keeps the grades (same year) or resets them (cross-year), so
 * classes created before it became required get it here.
 */
export function EditClassDialog({ id, name, gradeLabel }: { id: string; name: string; gradeLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await updateClassAction(prev, formData);
      if (result.ok) {
        setOpen(false);
        router.refresh();
      }
      return result;
    },
    initialState
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1">
          <Pencil className="size-3.5" /> تعديل
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات الصف</DialogTitle>
          <DialogDescription>
            الاسم والسنة/المرحلة الدراسية. السنة تُستخدم في تحديد ما إذا كان النقل بين الصفوف سيُبقي الدرجات أو يمسحها.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-3 py-2">
          <input type="hidden" name="classId" value={id} />
          <div className="grid gap-1.5">
            <Label htmlFor={`className-${id}`}>اسم الصف</Label>
            <Input id={`className-${id}`} name="name" defaultValue={name} required minLength={2} maxLength={80} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`classGrade-${id}`}>السنة/المرحلة الدراسية</Label>
            <Input
              id={`classGrade-${id}`}
              name="gradeLabel"
              defaultValue={gradeLabel}
              required
              minLength={2}
              maxLength={80}
              placeholder="مثال: سنة اولى بنين"
            />
            <p className="text-xs text-muted-foreground">
              صفا السنة نفسها (مثل «سنة اولى بنين A» و«سنة اولى بنين B») يكتبان بنفس القيمة.
            </p>
          </div>
          {state.message ? (
            <p className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "جارِ الحفظ..." : "حفظ"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
