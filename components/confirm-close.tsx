"use client";

import { useState } from "react";
import { closeConversationAction } from "@/app/actions/teacher";
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

export function ConfirmClose({ conversationId, disabled = false }: { conversationId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" disabled={disabled} className="w-full bg-destructive text-white hover:bg-destructive/90">
          <Ban className="h-4 w-4" />
          إنهاء المحادثة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنهاء المحادثة</DialogTitle>
          <DialogDescription>
            هل أنت متأكد من إنهاء المحادثة؟ بعد الإنهاء لن يتمكن الطالب من إرسال رسائل أو تسليم تعديلات جديدة لهذا الواجب.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <ActionForm
            action={closeConversationAction}
            submitLabel="نعم، إنهاء المحادثة"
            className="grid gap-2"
          >
            <input type="hidden" name="conversationId" value={conversationId} />
          </ActionForm>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}