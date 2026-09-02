import { notFound } from "next/navigation";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/page-shell";
import { AppNav } from "@/components/app-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AttachmentUploader } from "../attachment-uploader";
import {
  deleteAssignmentAction,
  publishAssignmentAction,
  removeAttachmentAction,
  updateAssignmentAction
} from "@/app/actions/teacher";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ArrowLeft, FileText, Paperclip, Rocket, Trash2, Info } from "lucide-react";

type Attachment = {
  id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

export default async function EditAssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole(["teacher", "admin"]);
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: assignmentRow } = await supabase
    .from("assignments")
    .select("id, class_id, title, instructions, due_at, max_grade, status, published_at, classes!inner(name)")
    .eq("id", id)
    .eq("teacher_id", profile.id)
    .single();

  const assignment = assignmentRow as unknown as {
    id: string;
    class_id: string;
    title: string;
    instructions: string | null;
    due_at: string | null;
    max_grade: number;
    status: string;
    published_at: string | null;
    classes: { name: string } | null;
  };

  if (!assignment) notFound();

  const { data: attachments } = await supabase
    .from("assignment_attachments")
    .select("id, file_name, mime_type, file_size, created_at, storage_path")
    .eq("assignment_id", id)
    .order("created_at");

  const rows = (attachments ?? []) as (Attachment & { storage_path: string })[];
  const signed: Record<string, string | null> = {};
  if (rows.length) {
    await Promise.all(
      rows.map(async (a) => {
        const { data } = await supabase.storage.from("assignment-attachments").createSignedUrl(a.storage_path, 600);
        signed[a.id] = data?.signedUrl ?? null;
      })
    );
  }

  const published = assignment.status === "published";
  const dueDate = assignment.due_at ? assignment.due_at.slice(0, 10) : "";
  const dueTime = assignment.due_at ? assignment.due_at.slice(11, 16) : "";

  return (
    <>
      <PageShell>
        <div className="mb-5 flex items-center justify-between gap-3">
          <Button asChild variant="ghost" size="sm" className="-mx-2 text-muted-foreground">
            <Link href="/teacher" className="gap-1.5">
              <ArrowLeft className="size-4" />
              رجوع
            </Link>
          </Button>
        </div>

        <header className="mb-6 flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/12">
            <FileText className="size-6 text-primary" />
          </span>
          <div>
            <h1 className="text-[var(--text-h1)] font-extrabold">{assignment.title}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{assignment.classes?.name}</p>
          </div>
          <div className="ms-auto">
            {published ? <Badge variant="success">منشور</Badge> : <Badge variant="secondary">مسودة</Badge>}
          </div>
        </header>

        {published ? (
          <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-success/25 bg-success/8 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-success" />
            <div className="text-sm">
              <p className="font-semibold">منشور منذ {new Date(assignment.published_at!).toLocaleString("ar")}</p>
              <p className="mt-1 text-muted-foreground">الواجب منشور وقيمته مثبتة، لا يمكن تعديله. لإنهاء الاستلام استخدم متابعة المحادثات.</p>
            </div>
          </div>
        ) : null}

        {!published ? (
          <section className="mb-6 rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
            <h2 className="mb-1 text-[var(--text-h3)] font-bold">تعديل المسودة</h2>
            <p className="mb-4 text-sm text-muted-foreground">التعديلات متاحة قبل النشر فقط، وبعد النشر تُفتح المحادثات للطلاب.</p>
            <ActionForm action={updateAssignmentAction} className="grid gap-4 md:grid-cols-2" submitLabel="حفظ التعديلات">
              <input type="hidden" name="assignmentId" value={id} />
              <div className="grid gap-1.5">
                <Label htmlFor="title">عنوان الواجب</Label>
                <Input id="title" name="title" defaultValue={assignment.title ?? ""} required />
              </div>
              <div className="grid gap-1.5 md:col-span-2">
                <Label htmlFor="instructions">التعليمات</Label>
                <textarea
                  id="instructions"
                  name="instructions"
                  className="min-h-24 rounded-lg border border-border bg-background p-2.5 text-sm"
                  defaultValue={assignment.instructions ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dueDate">تاريخ التسليم</Label>
                <Input id="dueDate" name="dueDate" type="date" defaultValue={dueDate} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dueTime">وقت التسليم</Label>
                <Input id="dueTime" name="dueTime" type="time" defaultValue={dueTime} required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="maxGrade">الدرجة العظمى</Label>
                <Input id="maxGrade" name="maxGrade" type="number" min="0.5" max="1000" step="0.5" defaultValue={assignment.max_grade} required />
              </div>
            </ActionForm>
          </section>
        ) : null}

        <section className="mb-6 rounded-[var(--radius-lg)] border border-border/70 bg-card p-5 shadow-card">
          <h2 className="mb-1 flex items-center gap-2 text-[var(--text-h3)] font-bold">
            <Paperclip className="size-4 text-primary" />
            مرفقات الصور
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">أضف صورًا توضيحية (JPG/PNG/WebP حتى 10MB لكل صورة).</p>
          {rows.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {rows.map((a) => (
                <figure key={a.id} className="grid gap-1.5">
                  {signed[a.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signed[a.id]!} alt={a.file_name} className="aspect-square w-full rounded-lg border border-border/70 object-cover" />
                  ) : (
                    <div className="aspect-square w-full rounded-lg border border-border/70 bg-muted" />
                  )}
                  <figcaption className="truncate text-xs text-muted-foreground">{a.file_name}</figcaption>
                  <form action={removeAttachmentAction}>
                    <input type="hidden" name="attachmentId" value={a.id} />
                    <Button type="submit" variant="outline" size="sm" className="w-full">
                      <Trash2 className="size-3.5" />
                      حذف
                    </Button>
                  </form>
                </figure>
              ))}
            </div>
          ) : null}
          {published ? <p className="text-sm text-muted-foreground">لا يمكن تعديل المرفقات بعد النشر.</p> : <AttachmentUploader assignmentId={id} />}
        </section>

        {!published ? (
          <div className="flex flex-wrap gap-2">
            <form action={publishAssignmentAction}>
              <input type="hidden" name="assignmentId" value={id} />
              <Button type="submit" className="gap-1.5">
                <Rocket className="size-4" />
                نشر للصف
              </Button>
            </form>
            <form action={deleteAssignmentAction}>
              <input type="hidden" name="assignmentId" value={id} />
              <Button type="submit" variant="destructive">
                <Trash2 className="size-4" />
                حذف المسودة
              </Button>
            </form>
          </div>
        ) : null}
      </PageShell>
      <AppNav role="teacher" />
    </>
  );
}
