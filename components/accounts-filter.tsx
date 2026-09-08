"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { deleteAccountAction, toggleActiveAction, bulkDeleteAccountsAction } from "@/app/actions/admin";
import { verifyAdminPasswordAction } from "@/app/actions/auth";
import { Label } from "@/components/ui/label";
import { Search, Download, Trash2, School, KeyRound, Eye, EyeOff, Copy, Check, CheckSquare, Square, Loader2, AlertCircle } from "lucide-react";

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
  initial_password: string | null;
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [toDelete, setToDelete] = useState<AccountRow | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [copiedPasswords, setCopiedPasswords] = useState<Record<string, boolean>>({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeletePending, setBulkDeletePending] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [singleDeletePassword, setSingleDeletePassword] = useState("");
  const [singleDeletePhase, setSingleDeletePhase] = useState<"password" | "confirm">("password");
  const [singleDeleteVerifying, setSingleDeleteVerifying] = useState(false);
  const [singleShowPassword, setSingleShowPassword] = useState(false);
  const [singleDeletePending, setSingleDeletePending] = useState(false);
  const [singleDeleteError, setSingleDeleteError] = useState<string | null>(null);
  const [bulkDeletePassword, setBulkDeletePassword] = useState("");
  const [bulkDeletePhase, setBulkDeletePhase] = useState<"password" | "confirm">("password");
  const [bulkDeleteVerifying, setBulkDeleteVerifying] = useState(false);
  const [bulkShowPassword, setBulkShowPassword] = useState(false);

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

  const handleSelectionToggle = useCallback((id: string, e?: React.MouseEvent | React.TouchEvent) => {
    if (e) {
      const isCtrl = (e as React.MouseEvent).ctrlKey || (e as React.MouseEvent).metaKey;
      const isLongPress = (e as React.TouchEvent).type === "touchstart";
      
      if (!selectionMode) {
        // Only enter selection mode on Ctrl+Click or long press
        if (!isCtrl && !isLongPress) return;
        e.preventDefault();
        setSelectionMode(true);
      }
    }
    // In selection mode, normal click toggles
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [selectionMode]);

  const handleLongPress = useCallback((id: string, e: React.TouchEvent) => {
    const timer = setTimeout(() => {
      e.preventDefault();
      handleSelectionToggle(id, e);
    }, 400);
    return () => clearTimeout(timer);
  }, [handleSelectionToggle]);

  const handleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  const handleBulkVerify = async () => {
    if (selectedIds.size === 0) return;
    if (!bulkDeletePassword) {
      setBulkDeleteError("يرجى إدخال كلمة مرور الأدمن للتأكيد");
      return;
    }
    setBulkDeleteVerifying(true);
    setBulkDeleteError(null);
    const formData = new FormData();
    formData.append("password", bulkDeletePassword);
    const result = await verifyAdminPasswordAction(formData);
    setBulkDeleteVerifying(false);
    if (result.ok) {
      setBulkDeletePhase("confirm");
    } else {
      setBulkDeleteError(result.message ?? "كلمة مرور الأدمن غير صحيحة");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeletePending(true);
    setBulkDeleteError(null);
    const formData = new FormData();
    selectedIds.forEach((id) => formData.append("userIds", id));
    formData.append("adminPassword", bulkDeletePassword);
    const result = await bulkDeleteAccountsAction({ ok: false, message: "" }, formData);
    setBulkDeletePending(false);
    if (result.ok) {
      setSelectedIds(new Set());
      setSelectionMode(false);
      setShowBulkDeleteDialog(false);
      setBulkDeletePassword("");
      setBulkDeletePhase("password");
      setBulkShowPassword(false);
      setBulkDeleteVerifying(false);
      router.refresh();
    } else {
      setBulkDeletePhase("password");
      setBulkDeleteError(result.message ?? "فشل الحذف");
    }
  };

  const handleSingleVerify = async () => {
    if (!toDelete) return;
    if (!singleDeletePassword) {
      setSingleDeleteError("يرجى إدخال كلمة مرور الأدمن للتأكيد");
      return;
    }
    setSingleDeleteVerifying(true);
    setSingleDeleteError(null);
    const formData = new FormData();
    formData.append("password", singleDeletePassword);
    const result = await verifyAdminPasswordAction(formData);
    setSingleDeleteVerifying(false);
    if (result.ok) {
      setSingleDeletePhase("confirm");
    } else {
      setSingleDeleteError(result.message ?? "كلمة مرور الأدمن غير صحيحة");
    }
  };

  const handleSingleDelete = async () => {
    if (!toDelete) return;
    setSingleDeletePending(true);
    setSingleDeleteError(null);
    const formData = new FormData();
    formData.append("userId", toDelete.id);
    formData.append("adminPassword", singleDeletePassword);
    const result = await deleteAccountAction({ ok: false, message: "" }, formData);
    setSingleDeletePending(false);
    if (result.ok) {
      setToDelete(null);
      setSingleDeletePassword("");
      setSingleDeletePhase("password");
      setSingleShowPassword(false);
      setSingleDeleteVerifying(false);
      router.refresh();
    } else {
      setSingleDeletePhase("password");
      setSingleDeleteError(result.message ?? "فشل الحذف");
    }
  };

  const getSelectedAccounts = () => filtered.filter((u) => selectedIds.has(u.id));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectionMode(false);
        setSelectedIds(new Set());
        setShowBulkDeleteDialog(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const renderAccountCard = (u: AccountRow) => {
    const isSelected = selectedIds.has(u.id);
    const cardClassName = `rounded-xl border border-border/70 p-3 transition-all duration-200 ${
      selectionMode
        ? isSelected
          ? "ring-2 ring-blue-500 bg-blue-50/50 shadow-lg"
          : "opacity-60 hover:opacity-100"
        : ""
    }`;

    return (
      <div
        key={u.id}
        className={cardClassName}
        onClick={(e) => handleSelectionToggle(u.id, e)}
        onTouchStart={(e) => handleLongPress(u.id, e)}
        style={{ cursor: "pointer" }}
      >
        {selectionMode && (
          <div className="mb-2 flex justify-end">
            <span
              className="flex size-6 items-center justify-center rounded-full border-2 bg-background transition-colors"
              style={{
                borderColor: isSelected ? "transparent" : "currentColor",
                backgroundColor: isSelected ? "var(--blue-500)" : "transparent",
              }}
            >
              {isSelected && <Check className="size-4 text-white" />}
            </span>
          </div>
        )}
        
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

        {u.must_change_password && u.initial_password ? (
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <KeyRound className="size-3.5" />
              <span className="font-medium text-foreground">كلمة مرور أولية</span>
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono text-sm">
              {showPasswords[u.id] ? (
                <span className="text-foreground" dir="ltr">{u.initial_password}</span>
              ) : (
                <span className="text-muted-foreground">{"●".repeat(u.initial_password.length)}</span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0"
                onClick={() => setShowPasswords((prev) => ({ ...prev, [u.id]: !prev[u.id] }))}
                aria-label={showPasswords[u.id] ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPasswords[u.id] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 p-0"
                onClick={async () => {
                  await navigator.clipboard.writeText(u.initial_password!);
                  setCopiedPasswords((prev) => ({ ...prev, [u.id]: true }));
                  setTimeout(() => setCopiedPasswords((prev) => ({ ...prev, [u.id]: false })), 2000);
                }}
                aria-label="نسخ كلمة المرور"
                disabled={copiedPasswords[u.id]}
              >
                {copiedPasswords[u.id] ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
              </Button>
            </span>
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {!selectionMode && (
            <form action={toggleActiveAction}>
              <input type="hidden" name="userId" value={u.id} />
              <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
              <Button type="submit" variant={u.is_active ? "outline" : "default"} size="sm">
                {u.is_active ? "إيقاف" : "تفعيل"}
              </Button>
            </form>
          )}
          {!selectionMode && u.role === "student" ? (
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
          {!selectionMode && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => { setSingleDeletePhase("password"); setSingleShowPassword(false); setSingleDeleteVerifying(false); setToDelete(u); }}>
              <Trash2 className="size-3.5" /> حذف
            </Button>
          )}
        </div>
      </div>
    );
  };

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
          disabled={selectionMode}
        />
      </div>

      {errorText ? (
        <p className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorText}</p>
      ) : null}

      {selectionMode && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-blue-50 p-3 border border-blue-200">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="gap-1.5"
            >
              {selectedIds.size === filtered.length ? <CheckSquare className="size-3.5" /> : <Square className="size-3.5" />}
              {selectedIds.size === filtered.length ? "إلغاء تحديد الكل" : "تحديد الكل"}
            </Button>
            <span className="text-sm font-medium text-blue-700">
              {selectedIds.size} من {filtered.length} حساب محدد
            </span>
          </div>
          <div className="flex items-center gap-2">
            {bulkDeleteError && (
              <span className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="size-3.5" />
                {bulkDeleteError}
              </span>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { setBulkDeletePhase("password"); setBulkShowPassword(false); setBulkDeleteVerifying(false); setShowBulkDeleteDialog(true); }}
              disabled={selectedIds.size === 0 || bulkDeletePending}
              className="gap-1.5"
            >
              {bulkDeletePending ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  جارِ الحذف...
                </>
              ) : (
                <>
                  <Trash2 className="size-3.5" />
                  حذف المحدد ({selectedIds.size})
                </>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleClearSelection}>
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? "لا توجد حسابات بعد." : "لا توجد نتائج مطابقة لبحثك."}
        </p>
      ) : (
        <div className="grid gap-2.5">
          {filtered.map(renderAccountCard)}
        </div>
      )}

      <Dialog open={toDelete !== null} onOpenChange={(open) => { if (!open) { setToDelete(null); setSingleDeletePassword(""); setSingleDeleteError(null); setSingleDeletePhase("password"); setSingleShowPassword(false); setSingleDeleteVerifying(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="size-5" />
              حذف الحساب نهائيًا
            </DialogTitle>
            <DialogDescription>
              أنت على وشك حذف حساب «{toDelete?.full_name}» ({roleLabel(toDelete?.role ?? "")}) بالكامل.
              سيتم حذف جميع بياناته (صفوفه، درجاته، رسائله) نهائيًا، ولا يمكن التراجع عن هذه الخطوة.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {singleDeletePhase === "confirm" ? (
              <div className="grid gap-1.5">
                <p className="text-sm text-muted-foreground">
                  تم التحقق من كلمة مرور الأدمن بنجاح. اضغط «حذف نهائي» لإتمام العملية نهائيًا.
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="adminPasswordSingle">كلمة مرور الأدمن للتأكيد</Label>
                <div className="relative">
                  <input
                    id="adminPasswordSingle"
                    type={singleShowPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={singleDeletePassword}
                    onChange={(e) => { setSingleDeletePassword(e.target.value); if (singleDeleteError) setSingleDeleteError(null); }}
                    disabled={singleDeleteVerifying}
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-9 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
                    placeholder="أدخل كلمة مرور الأدمن"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setSingleShowPassword((v) => !v)}
                    aria-label={singleShowPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    disabled={singleDeleteVerifying}
                  >
                    {singleShowPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
                {singleDeleteError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3.5" />
                    {singleDeleteError}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setToDelete(null); setSingleDeletePassword(""); setSingleDeleteError(null); setSingleDeletePhase("password"); setSingleShowPassword(false); setSingleDeleteVerifying(false); }} disabled={singleDeleteVerifying || singleDeletePending}>
              إلغاء
            </Button>
            {toDelete ? (
              singleDeletePhase === "password" ? (
                <Button
                  variant="destructive"
                  onClick={handleSingleVerify}
                  disabled={singleDeleteVerifying}
                >
                  {singleDeleteVerifying ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      جارِ التحقق من كلمة المرور...
                    </>
                  ) : (
                    "متابعة"
                  )}
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  onClick={handleSingleDelete}
                  disabled={singleDeletePending}
                >
                  {singleDeletePending ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      جارِ الحذف... قد تستغرق العملية بضع ثوانٍ
                    </>
                  ) : (
                    "حذف نهائي"
                  )}
                </Button>
              )
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkDeleteDialog} onOpenChange={(open) => { if (!open) { setShowBulkDeleteDialog(false); setBulkDeletePassword(""); setBulkDeleteError(null); setBulkDeletePhase("password"); setBulkShowPassword(false); setBulkDeleteVerifying(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="size-5" />
              تأكيد الحذف الجماعي
            </DialogTitle>
            {bulkDeletePhase === "password" ? (
              <DialogDescription>
                أنت على وشك حذف <strong>{selectedIds.size} حسابات</strong> نهائيًا.
                {getSelectedAccounts().length > 0 && (
                  <>
                    <div className="mt-2 text-sm">
                      الحسابات المحددة:
                      <ul className="mt-1 list-disc list-inside space-y-1 max-h-40 overflow-auto">
                        {getSelectedAccounts().slice(0, 5).map((u) => (
                          <li key={u.id} className="font-medium">{u.full_name} ({u.code})</li>
                        ))}
                        {getSelectedAccounts().length > 5 && (
                          <li className="text-muted-foreground">... و {getSelectedAccounts().length - 5} حسابات أخرى</li>
                        )}
                      </ul>
                    </div>
                  </>
                )}
                <p className="mt-2 text-destructive">سيتم حذف جميع بياناتهم (صفوف، درجات، رسائل) ولا يمكن التراجع.</p>
              </DialogDescription>
            ) : (
              <DialogDescription>
                تم التحقق من كلمة مرور الأدمن بنجاح. اضغط «حذف نهائي» لحذف <strong>{selectedIds.size} حسابات</strong> نهائيًا.
                <p className="mt-2 text-destructive">سيتم حذف جميع بياناتهم ولا يمكن التراجع.</p>
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {bulkDeletePhase === "confirm" ? (
              <p className="text-sm text-muted-foreground">
                {bulkDeletePending ? "جارِ حذف الحسابات... قد تستغرق العملية بضع ثوانٍ حسب عدد الحسابات وحجم بياناتها." : `سيتم حذف ${selectedIds.size} حساب مع كل بياناتهم.`}
              </p>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="adminPasswordBulk">كلمة مرور الأدمن للتأكيد</Label>
                <div className="relative">
                  <input
                    id="adminPasswordBulk"
                    type={bulkShowPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={bulkDeletePassword}
                    onChange={(e) => { setBulkDeletePassword(e.target.value); if (bulkDeleteError) setBulkDeleteError(null); }}
                    disabled={bulkDeleteVerifying}
                    className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-9 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50"
                    placeholder="أدخل كلمة مرور الأدمن"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
                    onClick={() => setBulkShowPassword((v) => !v)}
                    aria-label={bulkShowPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                    disabled={bulkDeleteVerifying}
                  >
                    {bulkShowPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
                {bulkDeleteError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="size-3.5" />
                    {bulkDeleteError}
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkDeleteDialog(false); setBulkDeletePassword(""); setBulkDeleteError(null); setBulkDeletePhase("password"); setBulkShowPassword(false); setBulkDeleteVerifying(false); }} disabled={bulkDeleteVerifying || bulkDeletePending}>
              إلغاء
            </Button>
            {bulkDeletePhase === "password" ? (
              <Button
                variant="destructive"
                onClick={handleBulkVerify}
                disabled={bulkDeleteVerifying}
              >
                {bulkDeleteVerifying ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    جارِ التحقق من كلمة المرور...
                  </>
                ) : (
                  "متابعة"
                )}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={bulkDeletePending}
              >
                {bulkDeletePending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    جارِ حذف {selectedIds.size} حسابات...
                  </>
                ) : (
                  "حذف نهائي"
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
