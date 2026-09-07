"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search, User } from "lucide-react";

type UserRow = { id: string; full_name: string; code: string; role: string };

interface AdminUserSelectorProps {
  users: UserRow[];
  defaultValue?: string;
}

export function AdminUserSelector({ users, defaultValue }: AdminUserSelectorProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");

  const filteredUsers = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.code.toLowerCase().includes(q)
    );
  }, [users, query]);

  const selectedUser = users.find((u) => u.id === selectedId);

  return (
    <div className="relative w-full">
      {/* Hidden input to maintain compatibility with ActionForm / FormData */}
      <input type="hidden" name="userId" value={selectedId} required />

      <div className="relative">
        <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
          <Search className="size-4" />
        </div>
        <Input
          placeholder="بحث بالاسم أو الكود..."
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filteredUsers.length === 0 && query && (
        <div className="absolute z-10 w-full rounded-md border bg-popover p-2 text-center text-xs text-muted-foreground shadow-md">
          لا توجد نتائج مطابقة
        </div>
      )}

      {filteredUsers.length > 0 && (
        <div className="absolute z-10 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md animate-in fade-in zoom-in-95">
          <div className="p-1">
            {filteredUsers.map((u) => (
              <button
                key={u.id}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-start transition-colors hover:bg-accent hover:text-accent-foreground",
                  selectedId === u.id && "bg-accent text-accent-foreground font-medium"
                )}
                onClick={() => {
                  setSelectedId(u.id);
                  setQuery("");
                }}
              >
                <User className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate flex-1">{u.full_name}</span>
                <span className="shrink-0 text-xs opacity-60">{u.code}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedUser && !query && (
        <div className="mt-1 text-[10px] text-muted-foreground px-1">
          المحدد: {selectedUser.full_name} ({selectedUser.code})
        </div>
      )}
    </div>
  );
}
