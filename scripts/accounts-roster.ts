import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { formatAppDate } from "../lib/dates.ts";
import { mkdirSync } from "node:fs";

const OUT_DIR = "C:/Users/Steven Ayman/Desktop";
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Profile = {
  id: string;
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
const ROLE_ORDER: Record<string, number> = { student: 0, teacher: 1, admin: 2 };

const { data: profilesRaw, error } = await admin
  .from("profiles")
  .select("id, full_name, email, code, role, is_active, must_change_password, last_login_at, created_at")
  .order("full_name");
if (error) throw new Error(`profiles: ${error.message}`);
const profiles = profilesRaw as unknown as Profile[];

// auth.users sign-in history — the authoritative "has this person ever logged in".
const signInByEmail = new Map<string, string | null>();
for (let page = 1; ; page++) {
  const { data, error: aErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
  if (aErr) throw new Error(`auth: ${aErr.message}`);
  for (const u of data.users) if (u.email) signInByEmail.set(u.email.toLowerCase(), u.last_sign_in_at ?? null);
  if (data.users.length < 1000) break;
}

// Classes: students via class_students, teachers via class_teachers.
const [{ data: enrolments }, { data: teachings }] = await Promise.all([
  admin.from("class_students").select("student_id, classes(name)"),
  admin.from("class_teachers").select("teacher_id, classes(name)")
]);
const classesById = new Map<string, string[]>();
function addClass(id: string, name?: string | null) {
  if (!id || !name) return;
  const list = classesById.get(id) ?? [];
  if (!list.includes(name)) list.push(name);
  classesById.set(id, list);
}
for (const e of enrolments ?? []) addClass(e.student_id, (e.classes as unknown as { name?: string } | null)?.name);
for (const t of teachings ?? []) addClass(t.teacher_id, (t.classes as unknown as { name?: string } | null)?.name);

type Rec = Profile & {
  classes: string;
  classesKey: string;
  entered: boolean;
  everAt: string | null;
  roleAr: string;
  roleRank: number;
  pwAr: string;
  enteredAr: string;
};

const all: Rec[] = profiles.map((p) => {
  const authSignIn = signInByEmail.get((p.email ?? "").toLowerCase()) ?? null;
  const entered = Boolean(authSignIn) || Boolean(p.last_login_at);
  const names = (classesById.get(p.id) ?? []).slice().sort(AR.compare);
  return {
    ...p,
    classes: names.join("، "),
    classesKey: names.join("، ") || "—",
    entered,
    everAt: authSignIn ?? p.last_login_at,
    roleAr: ROLE_AR[p.role] ?? p.role,
    roleRank: ROLE_ORDER[p.role] ?? 9,
    pwAr: p.must_change_password ? "لم يغيّر كلمة المرور" : "غيّر كلمة المرور",
    enteredAr: entered ? "نعم" : "لا"
  };
});

type Col = { key: keyof Rec; label: string; width: number };

function render(wb: ExcelJS.Workbook, name: string, subtitle: string, cols: Col[], rows: Rec[]) {
  const ws = wb.addWorksheet(name, {
    views: [{ rightToLeft: true, showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }
  });
  const lastLetter = ws.getColumn(cols.length).letter;

  ws.mergeCells(`A1:${lastLetter}1`);
  const t = ws.getCell("A1");
  t.value = subtitle;
  t.font = { name: "Cairo", size: 14, bold: true, color: { argb: "FF7F7F7F" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells(`A2:${lastLetter}2`);
  const info = ws.getCell("A2");
  info.value = `عدد الحسابات: ${rows.length} — ${formatAppDate(new Date())}`;
  info.font = { name: "Cairo", size: 10, color: { argb: "FF7F7F7F" } };
  info.alignment = { horizontal: "center", vertical: "middle" };

  cols.forEach((c, i) => {
    const cell = ws.getRow(3).getCell(i + 1);
    cell.value = c.label;
    cell.font = { name: "Cairo", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(i + 1).width = c.width;
  });
  ws.getRow(3).height = 24;

  rows.forEach((r, i) => {
    const row = ws.getRow(4 + i);
    row.height = 20;
    if (i % 2 === 1) {
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      });
    }
    cols.forEach((c, ci) => {
      const cell = row.getCell(ci + 1);
      const raw = r[c.key];
      let v: ExcelJS.CellValue;
      switch (c.key) {
        case "is_active":
          v = raw ? "نعم" : "لا";
          break;
        case "everAt":
        case "last_login_at":
        case "created_at":
          v = raw ? formatAppDate(String(raw)) : "—";
          break;
        default:
          v = (raw as string) || "—";
      }
      cell.value = v;
      cell.font = { name: "Cairo", size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      if (c.key === "entered" && !r.entered) {
        cell.font = { name: "Cairo", size: 10, bold: true, color: { argb: "FFB91C1C" } };
      }
    });
  });

  ws.autoFilter = { from: "A3", to: `${lastLetter}${3 + rows.length}` };
  return ws;
}

const ROSTER_COLS: Col[] = [
  { key: "full_name", label: "الاسم", width: 32 },
  { key: "code", label: "الكود", width: 12 },
  { key: "roleAr", label: "الدور", width: 10 },
  { key: "classes", label: "الصفوف", width: 26 },
  { key: "is_active", label: "مُفعّل", width: 9 },
  { key: "enteredAr", label: "هل دخل التطبيق؟", width: 15 },
  { key: "pwAr", label: "كلمة المرور", width: 20 },
  { key: "everAt", label: "آخر دخول", width: 20 },
  { key: "created_at", label: "تاريخ الإنشاء", width: 18 }
];

const sortRoster = (a: Rec, b: Rec) =>
  a.roleRank - b.roleRank ||
  AR.compare(a.classesKey, b.classesKey) ||
  AR.compare(a.full_name ?? "", b.full_name ?? "") ||
  AR.compare(a.code ?? "", b.code ?? "");

const roster = all.slice().sort(sortRoster);
const neverEntered = all.filter((r) => !r.entered && r.must_change_password).slice().sort(sortRoster);
const pending = all.filter((r) => r.must_change_password).slice().sort(sortRoster);

const wb = new ExcelJS.Workbook();
wb.creator = "Wagbati";
wb.created = new Date();

render(wb, "كل الحسابات", "كل الحسابات — الصفوف والدور وهل دخل التطبيق", ROSTER_COLS, roster);
render(wb, "لم يدخل التطبيق", "حسابات لم تدخل التطبيق إطلاقًا (لم تسجّل دخولًا ولا مرة)", ROSTER_COLS, neverEntered);
render(wb, "بانتظار كلمة المرور", "كل الحسابات التي ما زالت على كلمة المرور الأولية", ROSTER_COLS, pending);

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z");
mkdirSync(OUT_DIR, { recursive: true });
const out = `${OUT_DIR}/كشف-الحسابات-كامل-${stamp}.xlsx`;
await wb.xlsx.writeFile(out);

const byRole = (rows: Rec[]) => {
  const m: Record<string, number> = {};
  rows.forEach((r) => (m[r.roleAr] = (m[r.roleAr] || 0) + 1));
  return m;
};
const enrolled = (rows: Rec[]) => rows.filter((r) => r.classes).length;

console.log(`total accounts      : ${all.length}`);
console.log(`  by role           : ${JSON.stringify(byRole(all))}`);
console.log(`  with a class      : ${enrolled(all)}   without: ${all.length - enrolled(all)}`);
console.log(`never entered (all) : ${all.filter((r) => !r.entered).length}  ${JSON.stringify(byRole(all.filter((r) => !r.entered)))}`);
console.log(`entered at least once: ${all.filter((r) => r.entered).length}`);
console.log(`still on initial pw : ${pending.length}`);
console.log(`teachers w/ classes : ${all.filter((r) => r.role === "teacher" && r.classes).length}/${all.filter((r) => r.role === "teacher").length}`);
console.log(`\nwritten: ${out}`);
console.log(`\nsample:`);
roster.slice(0, 6).forEach((r) =>
  console.log(
    `  ${r.full_name.padEnd(28)} ${String(r.code).padEnd(10)} ${r.roleAr.padEnd(6)} ${(r.classes || "—").padEnd(20)} entered=${r.enteredAr}`
  )
);
