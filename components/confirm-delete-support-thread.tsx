"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSupportThreadAction } from "@/app/actions/support";
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

/**
 * Deleting a support thread is destructive and irreversible: the row, every
 * message, and every uploaded file are all gone. Per the admin's decision this
 * asks for a plain confirmation rather than the admin password — managing
 * conversations is routine inbox work, unlike deleting an account.
 */
export function ConfirmDeleteSupportThread({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="size-4" />
          حذف
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>حذف المحادثة</DialogTitle>
          <DialogDescription>
            هتتشال المحادثة وكل الرسائل والملفات المرفوعة نهائيًا. مفيش طريقة ترجّعها.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                const formData = new FormData();
                formData.set("threadId", threadId);
                const result = await deleteSupportThreadAction({ ok: false, message: "" }, formData);
                if (result.ok) {
                  close();
                  router.refresh();
                  router.push("/admin/support");
                  return;
                }
                setError(result.message || "فشل الحذف");
              } catch {
                // A rejected server action used to leave the button stuck on
                // "جارِ الحذف..." with nothing on screen.
                setError("تعذر حذف المحادثة. حاول تاني.");
              }
            });
          }}
        >
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={pending} className="bg-destructive text-white hover:bg-destructive/90">
              {pending ? "جارِ الحذف..." : "احذف نهائيًا"}
            </Button>
            <Button type="button" variant="ghost" onClick={close} disabled={pending}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
