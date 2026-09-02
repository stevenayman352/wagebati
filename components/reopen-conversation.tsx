"use client";

import { useState } from "react";
import { reopenConversationAction } from "@/app/actions/teacher";
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
import { Unlock } from "lucide-react";

export function ReopenConversation({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" className="w-full bg-success text-white hover:bg-success/90">
          <Unlock className="h-4 w-4" />
          فتح المحادثة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>فتح المحادثة</DialogTitle>
          <DialogDescription>
            هل تريد فتح المحادثة مجددًا؟ بعد الإتاحة سيتمكن الطالب من إرسال رسائل وتعديلات جديدة.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <ActionForm action={reopenConversationAction} submitLabel="نعم، فتح المحادثة" className="grid gap-2">
            <input type="hidden" name="conversationId" value={conversationId} />
          </ActionForm>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}