"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_TIME_ZONE, schoolLocalToISO } from "@/lib/dates";

function localDateParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-CA", { timeZone: APP_TIME_ZONE });
  const time = d.toLocaleTimeString("en-GB", { timeZone: APP_TIME_ZONE, hourCycle: "h23", hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

type Props = {
  initialDueAt?: string | null;
};

export function DueDateInputs({ initialDueAt }: Props) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  useEffect(() => {
    if (initialDueAt) {
      const parts = localDateParts(initialDueAt);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDate(parts.date);
      setTime(parts.time);
    }
  }, [initialDueAt]);

  const dueAt = date && time ? schoolLocalToISO(date, time) : "";

  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="dueDate">تاريخ التسليم</Label>
        <Input id="dueDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="dueTime">وقت التسليم</Label>
        <Input id="dueTime" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
      </div>
      <input type="hidden" name="dueAt" value={dueAt} />
    </>
  );
}