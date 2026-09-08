"use client";

import { useState } from "react";
import { closeAssignmentAction } from "@/app/actions/teacher";
import { ActionForm } from "@/components/action-form";
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
import { Ban } from "lucide-react";

export function ConfirmCloseAssignment({ assignmentId, disabled = false }: { assignmentId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled} className="gap-1.5 bg-destructive text-white hover:bg-destructive/90">
          <Ban className="h-4 w-4" />
          إنهاء الواجب
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنهاء الواجب</DialogTitle>
          <DialogDescription>
            هل أنت متأكد من إنهاء الواجب؟ بعد الإنهاء يصبح الواجب خارج الموعد لجميع الطلاب ولا يمكن لأي طالب إرسال رسائل أو تسليم تعديلات جديدة.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <ActionForm
            action={closeAssignmentAction}
            submitLabel="نعم، إنهاء الواجب"
            className="grid gap-2"
          >
            <input type="hidden" name="assignmentId" value={assignmentId} />
          </ActionForm>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}