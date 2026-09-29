"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Eraser,
  ListChecks,
  MessageSquare,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  clearSupportThreadAction,
  deleteSupportThreadsBulkAction
} from "@/app/actions/support";
import { cn } from "@/lib/utils";

/** Mirrors SupportInboxRow, declared here so no server module is pulled in. */
export type InboxRow = {
  id: string;
  requesterName: string;
  requesterCode: string;
  isGuest: boolean;
  lastMessageAt: string;
  createdAt: string;
  lastMessage: string;
  unread: number;
};

const LONG_PRESS_MS = 500;

type PendingAction = { kind: "clear"; ids: string[] } | { kind: "delete"; ids: string[] };

/**
 * The admin support inbox.
 *
 * A plain click opens a conversation. A long press (or right click on desktop)
 * opens a per-thread menu offering "clear the conversation" and "select chats".
 * Choosing select switches the list into multi-select, after which an ordinary
 * click toggles that row instead of navigating — so picking several threads never
 * needs a second gesture.
 */
export function AdminSupportInbox({ rows }: { rows: InboxRow[] }) {
  const router = useRouter();
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set when a long press completes, so the click that follows it is swallowed
  // rather than also navigating into the thread.
  const consumedClick = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const startPress = useCallback(
    (id: string) => {
      cancelPress();
      consumedClick.current = false;
      pressTimer.current = setTimeout(() => {
        consumedClick.current = true;
        setMenuId((current) => (current === id ? null : id));
      }, LONG_PRESS_MS);
    },
    [cancelPress]
  );

  useEffect(() => cancelPress, [cancelPress]);

  // Dismiss the menu on an outside click or Escape.
  useEffect(() => {
    if (!menuId) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setMenuId(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuId(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuId]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClick(id: string) {
    if (consumedClick.current) {
      consumedClick.current = false;
      return;
    }
    if (selectMode) {
      toggle(id);
      return;
    }
    router.push(`/admin/support/${id}`);
  }

  function enterSelectMode(id: string) {
    setMenuId(null);
    setSelectMode(true);
    setSelected((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }

  function leaveSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const selectionCount = selected.size;

  return (
      <div ref={containerRef} className="grid min-w-0 gap-2.5">
      {rows.map((t) => {
        const isSelected = selected.has(t.id);
        const menuOpen = menuId === t.id;
        return (
          <div key={t.id} className="relative">
            <div
              role="button"
              tabIndex={0}
              aria-pressed={selectMode ? isSelected : undefined}
              onPointerDown={() => startPress(t.id)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenuId((current) => (current === t.id ? null : t.id));
              }}
              onClick={() => handleClick(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick(t.id);
                }
              }}
              className={cn(
                "flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-background/60 px-3.5 py-3 text-start transition-colors",
                "hover:border-primary/40 hover:bg-primary/[0.04]",
                isSelected ? "border-primary bg-primary/[0.08]" : "border-border/70",
                selectMode && "cursor-pointer select-none"
              )}
            >
              {selectMode ? (
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}
                >
                  {isSelected ? <Check className="size-3.5" /> : null}
                </span>
              ) : null}

              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/12 text-sm font-bold text-primary">
                {t.requesterName.trim().charAt(0) || "؟"}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-bold">{t.requesterName}</span>
                  <span
                    dir="ltr"
                    className="rounded-md bg-muted/70 px-1.5 py-0.5 text-[0.65rem] font-semibold text-muted-foreground"
                  >
                    {t.requesterCode}
                  </span>
                  <span
                    className={
                      t.isGuest
                        ? "rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.65rem] font-bold text-amber-600 dark:text-amber-400"
                        : "rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-bold text-primary"
                    }
                  >
                    {t.isGuest ? "زائر" : "طالب"}
                  </span>
                </span>
                {/*
                  max-w-full matters as much as truncate: this is a grid item,
                  and a grid item's default min-width is its content width, so a
                  long preview would otherwise stretch the column and break the
                  page layout on narrow screens.
                */}
                <span className="mt-0.5 block max-w-full truncate text-xs text-muted-foreground">
                  {t.lastMessage || "��� �����"}
                </span>
              </span>

              {t.unread > 0 ? (
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[0.68rem] font-bold text-primary-foreground">
                  {t.unread > 99 ? "99+" : t.unread}
                </span>
              ) : (
                <UserRound className="size-4 shrink-0 text-muted-foreground/40" />
              )}
            </div>

            {menuOpen ? (
              <div className="animate-pop absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-raise">
                <button
                  type="button"
                  onClick={() => {
                    setMenuId(null);
                    router.push(`/admin/support/${t.id}`);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  <MessageSquare className="size-4 text-muted-foreground" />
                  فتح المحادثة
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuId(null);
                    setError(null);
                    setAction({ kind: "clear", ids: [t.id] });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  <Eraser className="size-4 text-muted-foreground" />
                  مسح المحادثة
                </button>

                <button
                  type="button"
                  onClick={() => enterSelectMode(t.id)}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  <ListChecks className="size-4 text-muted-foreground" />
                  تحديد محادثات
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMenuId(null);
                    setError(null);
                    setAction({ kind: "delete", ids: [t.id] });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                  حذف المحادثة
                </button>
              </div>
            ) : null}
          </div>
        );
      })}

      {selectMode ? (
        <div className="sticky bottom-4 z-30 mt-1">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/95 p-2.5 shadow-raise backdrop-blur-xl">
            <span className="px-1 text-sm font-bold">
              {selectionCount ? `${selectionCount} محدد` : "اختر محادثات"}
            </span>

            <div className="ms-auto flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={leaveSelectMode}
                className="gap-1.5"
              >
                <X className="size-4" />
                إلغاء
              </Button>

              <Button
                type="button"
                size="sm"
                disabled={selectionCount === 0}
                onClick={() => {
                  setError(null);
                  setAction({ kind: "delete", ids: [...selected] });
                }}
                className="gap-1.5 bg-destructive text-white hover:bg-destructive/90"
              >
                <Trash2 className="size-4" />
                حذف المحدد
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {error && !action ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Keyed so opening a different action remounts the dialog with an empty
          password field, rather than resetting it from an effect. */}
      {action ? (
        <ConfirmDialog
          key={`${action.kind}-${action.ids.join(",")}`}
          action={action}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            leaveSelectMode();
            router.refresh();
          }}
          onError={setError}
        />
      ) : null}
    </div>
  );
}/**
 * Confirmation for the two destructive conversation actions. Deliberately no
 * password prompt: clearing and deleting support conversations is routine inbox
 * work, so the admin is asked to confirm rather than to re-authenticate.
 */
function ConfirmDialog({
  action,
  onClose,
  onDone,
  onError
}: {
  action: PendingAction;
  onClose: () => void;
  onDone: () => void;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  const isClear = action.kind === "clear";
  const count = action.ids.length;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isClear ? "مسح المحادثة" : "حذف المحادثات"}</DialogTitle>
          <DialogDescription>
            {isClear
              ? "الرسايل والملفات هتتشال، بس المحادثة نفسها هتفضل موجودة في القائمة."
              : count === 1
                ? "المحادثة والرسايل والملفات هتتشال نهائيًا. مفيش طريقة ترجّعها."
                : `${count} محادثات وكل رسائلها وملفاتها هتتشال نهائيًا. مفيش طريقة ترجّعها.`}
          </DialogDescription>
        </DialogHeader>

        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onError(null);
            startTransition(async () => {
              try {
                const formData = new FormData();
                for (const id of action.ids) formData.append("threadId", id);
                const result = isClear
                  ? await clearSupportThreadAction({ ok: false, message: "" }, formData)
                  : await deleteSupportThreadsBulkAction({ ok: false, message: "" }, formData);
                if (result.ok) {
                  onDone();
                  return;
                }
                onError(result.message || "فشل العملية");
              } catch {
                onError("فشلت العملية. حاول تاني.");
              }
            });
          }}
        >
          <DialogFooter>
            <Button
              type="submit"
              disabled={pending}
              className={cn("gap-2", !isClear && "bg-destructive text-white hover:bg-destructive/90")}
            >
              {pending ? (
                <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isClear ? (
                <Eraser className="size-4" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {pending ? "جارِ التنفيذ..." : isClear ? "امسح" : "احذف نهائيًا"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              إلغاء
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
