export const APP_TIME_ZONE = "Etc/GMT-3";

export function formatAppDate(value: string | Date | null | undefined): string {
  if (!value) return "بدون موعد";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "بدون موعد";
  return d.toLocaleString("ar", { timeZone: APP_TIME_ZONE, dateStyle: "medium", timeStyle: "short" });
}

export function formatAppTime(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ar", { timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit", hour12: true });
}

export function schoolOffsetMs(epochMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = dtf.formatToParts(epochMs);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - epochMs;
}

export function schoolLocalToISO(date: string, time: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  return new Date(wall - schoolOffsetMs(wall)).toISOString();
}