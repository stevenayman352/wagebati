import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { mkdirSync } from "node:fs";
import { formatAppDate } from "../lib/dates.ts";

const OUT_DIR = "C:/Users/Steven Ayman/Desktop";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Row = {
  full_name: string;
  email: string;
  code: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
};

const AR = new Intl.Collator("ar");
const ROLE_AR: Record<string, string> = { student: "طالب", teacher: "مدرس", admin: "مدير" };

const { data: profiles, error } = await admin
  .from("profiles")
  .select("full_name, email, code, role, is_active, must_change_password, last_login_at, created_at")
  .order("full_name");
if (error) throw new Error(`profiles: ${error.message}`);

// auth.users sign-in history — the authoritative "has this person ever logged in".
const signInByEmail = new Map<string, string | null>();
for (let page = 1; ; page++) {
  const { data, error: aErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (aErr) throw new Error(`auth: ${aErr.message}`);
  for (const u of data.users) {
    if (u.email) signInByEmail.set(u.email.toLowerCase(), u.last_sign_in_at ?? null);
  }
  if (data.users.length < 1000) break;
}

// Classes per student.
const { data: enrolments, error: eErr } = await admin
  .from("class_students")
  .select("student_id, classes(name)");
if (eErr) throw new Error(`class_students: ${eErr.message}`);
const classesByStudent = new Map<string, string[]>();
for (const e of enrolments ?? []) {
  const name = (e.classes as unknown as { name?: string } | null)?.name;
  if (!name) continue;
  const list = classesByStudent.get(e.student_id) ?? [];
  if (!list.includes(name)) list.push(name);
  classesByStudent.set(e.student_id, list);
}

type Kind = "لم يدخل التطبيق إطلاقًا" | "دخل ولم يغيّر كلمة المرور" | "غيّر كلمة المرور";

const all: Array<Row & { classes: string; signedInAt: string | null; kind: Kind; never: boolean }> = (
  profiles as unknown as Row[]
).map((p) => {
  const authSignIn = signInByEmail.get((p.email ?? "").toLowerCase()) ?? null;
  const everSignedIn = Boolean(authSignIn) || Boolean(p.last_login_at);
  const kind: Kind = !p.must_change_password
    ? "غيّر كلمة المرور"
    : everSignedIn
      ? "دخل ولم يغيّر كلمة المرور"
      : "لم يدخل التطبيق إطلاقًا";
  return {
    ...p,
    classes: (classesByStudent.get(p.email ? "" : "") ?? []).join("، "),
    signedInAt: authSignIn,
    kind,
    never: !everSignedIn
  };
});

// classes are keyed by profile id, so re-attach them properly.
const { data: idPairs } = await admin.from("profiles").select("id, email");
const idByEmail = new Map<string, string>();
for (const r of idPairs ?? []) if (r.email) idByEmail.set(r.email.toLowerCase(), r.id);
for (const row of all) {
  const pid = idByEmail.get((row.email ?? "").toLowerCase());
  row.classes = (pid ? classesByStudent.get(pid) ?? [] : []).slice().sort(AR.compare).join("، ");
}

const pending = all.filter((r) => r.must_change_password);
const neverEntered = pending.filter((r) => r.never);

const HEADERS: Array<[keyof (typeof all)[number], string, number]> = [
  ["full_name", "الاسم", 30],
  ["code", "الكود", 12],
  ["role", "الدور", 10],
  ["classes", "الصفوف", 24],
  ["is_active", "مُفعّل", 9],
  ["last_login_at", "آخر دخول للتطبيق", 20],
  ["signedInAt", "آخر تسجيل دخول", 20],
  ["created_at", "تاريخ الإنشاء", 20],
  ["kind", "الحالة", 26]
];

async function sheet(wb: ExcelJS.Workbook, name: string, subtitle: string, rows: typeof all) {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  });
  const lastCol = HEADERS.length;
  const lastLetter = ws.getColumn(lastCol).letter;

  ws.mergeCells(`A1:${lastLetter}1`);
  const title = ws.getCell("A1");
  title.value = subtitle;
  title.font = { name: "Cairo", size: 14, bold: true, color: { argb: "FF7F7F7F" } };
  title.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastLetter}2`);
  const info = ws.getCell("A2");
  info.value = `عدد الحسابات: ${rows.length} — بدون كلمات مرور أولية — ${formatAppDate(new Date())}`;
  info.font = { name: "Cairo", size: 10, color: { argb: "FF7F7F7F" } };
  info.alignment = { horizontal: "center", vertical: "middle" };

  HEADERS.forEach(([, label, width], i) => {
    const cell = ws.getRow(3).getCell(i + 1);
    cell.value = label;
    cell.font = { name: "Cairo", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(i + 1).width = width;
  });
  ws.getRow(3).height = 24;

  const ordered = rows.slice().sort(
    (a, b) => AR.compare(a.full_name ?? "", b.full_name ?? "") || AR.compare(a.code ?? "", b.code ?? "")
  );

  ordered.forEach((r, i) => {
    const row = ws.getRow(4 + i);
    row.height = 20;
    if (i % 2 === 1) {
      row.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }
    HEADERS.forEach(([key], ci) => {
      const cell = row.getCell(ci + 1);
      const raw = r[key];
      let v: ExcelJS.CellValue;
      if (key === "role") v = ROLE_AR[String(raw)] ?? String(raw);
      else if (key === "is_active") v = raw ? "نعم" : "لا";
      else if (key === "last_login_at" || key === "signedInAt" || key === "created_at")
        v = raw ? formatAppDate(String(raw)) : "—";
      else v = (raw as string) || "—";
      cell.value = v;
      cell.font = { name: "Cairo", size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (key === "kind" && raw === "لم يدخل التطبيق إطلاقًا") {
        cell.font = { name: "Cairo", size: 10, bold: true, color: { argb: "FFB91C1C" } };
      }
    });
  });

  ws.autoFilter = { from: `A3`, to: `${lastLetter}${3 + ordered.length}` };
  return ordered;
}

const wb = new ExcelJS.Workbook();
wb.creator = "Wagbati";
wb.created = new Date();

const orderedNever = await sheet(
  wb,
  "لم يدخل التطبيق",
  "حسابات لم تدخل التطبيق إطلاقًا (لم تسجّل دخولًا ولا مرة)",
  neverEntered
);
await sheet(wb, "بانتظار تغيير كلمة المرور", "كل الحسابات التي ما زالت على كلمة المرور الأولية", pending);

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
mkdirSync(OUT_DIR, { recursive: true });
const out = `${OUT_DIR}/حسابات-لم-تدخل-التطبيق-${stamp}.xlsx`;
await wb.xlsx.writeFile(out);

console.log(`total profiles      : ${all.length}`);
console.log(`must change password: ${pending.length}`);
console.log(`never entered      : ${neverEntered.length}`);
console.log(`  students         : ${neverEntered.filter((r) => r.role === "student").length}`);
console.log(`  teachers/admins  : ${neverEntered.filter((r) => r.role !== "student").length}`);
console.log(`signed in but pending: ${pending.filter((r) => !r.never).length}`);
console.log(`already changed pw  : ${all.length - pending.length}`);
console.log(`\nwritten: ${out}`);
console.log(`first rows:\n${orderedNever.slice(0, 8).map((r, i) => `  ${i + 1}. ${r.full_name} | ${r.code} | ${r.role} | ${r.classes || "—"} | ${r.kind}`).join("\n")}`);
