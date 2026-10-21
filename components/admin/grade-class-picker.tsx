"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import type { GradeClassOption } from "@/lib/grades";

/**
 * Class picker for the grade sheet. The selected class lives in the URL as
 * `?class=` so the sheet is shareable and survives a refresh, and the server
 * renders the matrix for whichever class is in the query string.
 */
export function GradeClassPicker({
  classes,
  selectedId
}: {
  classes: GradeClassOption[];
  selectedId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function onSelect(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("class", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">الصف:</span>
      <Select value={selectedId} onValueChange={onSelect}>
        <SelectTrigger className="w-full min-w-56" aria-label="اختر الصف">
          <SelectValue placeholder="اختر الصف" />
        </SelectTrigger>
        <SelectContent>
          {classes.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
              {option.gradeLabel ? ` — ${option.gradeLabel}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
