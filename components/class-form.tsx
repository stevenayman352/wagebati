"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { createClassAction } from "@/app/actions/admin";
import { Plus } from "lucide-react";
import type { ActionState } from "@/lib/types";

const initialState: ActionState = { ok: false, message: "" };

export function ClassForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createClassAction, initialState);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> إضافة صف
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة صف جديد</DialogTitle>
          <DialogDescription>أدخل اسم الصف والمرحلة الدراسية ثم احفظ.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="class-name">اسم الصف</Label>
            <Input id="class-name" name="name" required placeholder="مثال: سنة اولى بنين (A)" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-grade">السنة/المرحلة الدراسية</Label>
            <Input id="class-grade" name="gradeLabel" required placeholder="مثال: سنة اولى بنين" />
            <p className="text-xs text-muted-foreground">
              صفا السنة نفسها يكتبان بنفس القيمة (مثل «سنة اولى بنين» لصف A وB). تُستخدم لتحديد ما إذا كان
              نقل الطلاب سيُبقي الدرجات أو يمسحها.
            </p>
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "جار الحفظ..." : "حفظ الصف"}
          </Button>
          {state.message ? (
            <p className={`text-sm ${state.ok ? "text-primary" : "text-destructive"}`}>{state.message}</p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}