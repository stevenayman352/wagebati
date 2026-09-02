"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { deleteAccountAction, toggleActiveAction } from "@/app/actions/admin";
import { Search, Download, Trash2, School, KeyRound } from "lucide-react";

export function roleLabel(role: string) {
  return role === "admin" ? "ادمن" : role === "teacher" ? "مُدرّس" : "طالب";
}

function roleColor(role: string): "default" | "secondary" | "outline" {
  return role === "admin" ? "secondary" : role === "teacher" ? "outline" : "default";
}

export type AccountRow = {
  id: string;
  full_name: string;
  email: string;
  code: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  classes: string[];
};

export function AccountsFilter({
  rows,
  errorText
}: {
  rows: AccountRow[];
  errorText?: string | null;
}) {
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<AccountRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.full_name?.toLowerCase().includes(q) ||
        u.code?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالاسم أو الكود..."
          className="h-10 pr-9 pl-3"
        />
      </div>

      {errorText ? (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorText}</p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "لا توجد حسابات بعد." : "لا توجد نتائج مطابقة لبحثك."}
        </p>
      ) : null}

      <div className="grid gap-2.5">
        {filtered.map((u) => (
          <div key={u.id} className="rounded-xl border border-border/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {u.full_name?.charAt(0) ?? "؟"}
              </span>
              <span className="font-semibold">{u.full_name}</span>
              <Badge variant={roleColor(u.role)}>{roleLabel(u.role)}</Badge>
              {u.must_change_password ? <Badge variant="warning">يجب تغيير كلمة المرور</Badge> : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <KeyRound className="size-3.5" />
                <span className="font-medium text-foreground" dir="ltr">{u.code}</span>
              </span>
              {u.role !== "admin" ? (
                <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  <School className="size-3.5 shrink-0" />
                  {u.classes.length > 0 ? (
                    <span className="min-w-0 truncate">
                      {u.classes.map((c, i) => (
                        <span key={c}>
                          {i > 0 ? "، " : ""}
                          <span className="font-medium text-foreground">{c}</span>
                        </span>
                      ))}
                    </span>
                  ) : (
                    "بدون صف"
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <School className="size-3.5" />
                  لا يُربط بصف
                </span>
              )}
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <form action={toggleActiveAction}>
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
                <Button type="submit" variant={u.is_active ? "outline" : "default"} size="sm">
                  {u.is_active ? "إيقاف" : "تفعيل"}
                </Button>
              </form>
              {u.role === "student" ? (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/api/export?target=student&format=xlsx&id=${u.id}`} className="gap-1.5" title="تصدير إكسل">
                      <Download className="size-3.5" /> إكسل
                    </a>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <a href={`/api/export?target=student&format=pdf&id=${u.id}`} title="تصدير PDF">PDF</a>
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setToDelete(u)}>
                <Trash2 className="size-3.5" /> حذف
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>حذف الحساب نهائيًا</DialogTitle>
            <DialogDescription>
              أنت على وشك حذف حساب «{toDelete?.full_name}» ({roleLabel(toDelete?.role ?? "")}) بالكامل.
              سيتم حذف جميع بياناته (صفوفه، درجاته، رسائله) نهائيًا، ولا يمكن التراجع عن هذه الخطوة.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>إلغاء</Button>
            {toDelete ? (
              <form action={deleteAccountAction}>
                <input type="hidden" name="userId" value={toDelete.id} />
                <Button type="submit" variant="destructive">حذف نهائي</Button>
              </form>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
