import { z } from "zod";

export const accountSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "teacher", "student"]),
  code: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === "" ? undefined : v))
    .pipe(z.string().regex(/^[a-z0-9]{4,24}$/).optional())
});

export const classSchema = z.object({
  name: z.string().trim().min(2).max(80),
  gradeLabel: z
    .preprocess((v) => (v === null || v === undefined ? "" : v), z.string().trim().max(80))
    .default("")
});

export const assignmentSchema = z.object({
  classId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  instructions: z.string().trim().max(5000).default(""),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "موعد التسليم مطلوب"),
  dueTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "وقت التسليم مطلوب"),
  maxGrade: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? "20" : v),
    z.coerce.number().min(0.5).max(1000)
  )
});

export const assignmentUpdateSchema = z.object({
  assignmentId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  instructions: z.string().trim().max(5000).default(""),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "موعد التسليم مطلوب"),
  dueTime: z.string().trim().regex(/^\d{2}:\d{2}$/, "وقت التسليم مطلوب"),
  maxGrade: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? "20" : v),
    z.coerce.number().min(0.5).max(1000)
  )
});

export const uuidFormSchema = z.object({
  id: z.string().uuid()
});

export const attachmentSchema = z.object({
  assignmentId: z.string().uuid(),
  storagePath: z.string().trim().min(1).max(600),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  fileSize: z.coerce.number().int().positive().max(10485760)
});

export const messageSchema = z.object({
  conversationId: z.string().uuid(),
  kind: z.enum(["text", "voice", "video", "image"]),
  body: z.string().trim().max(5000).default(""),
  storagePath: z.string().trim().max(600).optional(),
  fileName: z.string().trim().max(255).optional(),
  mimeType: z.string().trim().max(120).optional(),
  fileSize: z.coerce.number().int().positive().max(262144000).optional(),
  durationSeconds: z.coerce.number().int().min(1).max(3600).optional(),
  replyToMessageId: z.string().uuid().optional().nullable()
});

export const gradeSchema = z
  .object({
    conversationId: z.string().uuid(),
    grade: z.coerce.number().min(0).max(1000),
    note: z.string().trim().max(5000).default(""),
    maxGrade: z.coerce.number().min(0.5).max(1000).optional()
  })
  .refine((v) => v.maxGrade === undefined || v.grade <= v.maxGrade, {
    message: "الدرجة يجب ألا تتجاوز الدرجة العظمى",
    path: ["grade"]
  });

const submittedMediaSchema = z.object({
  path: z.string().trim().min(1).max(600),
  name: z.string().trim().min(1).max(255),
  mime: z.string().trim().min(1).max(120),
  size: z.coerce.number().int().positive()
});

export const videoMediaSchema = submittedMediaSchema.refine(
  (v) => (v.mime === "video/mp4" || v.mime === "video/quicktime") && v.size <= 262144000,
  { message: "الفيديو يجب أن يكون MP4/MOV بحجم حتى 250MB" }
);

export const voiceMediaSchema = submittedMediaSchema.refine(
  (v) => v.mime === "audio/mpeg" && v.size <= 10485760,
  { message: "التسجيل الصوتي يجب أن يكون MP3 بحجم حتى 10MB" }
);

export const imageMediaSchema = submittedMediaSchema.refine(
  (v) =>
    (v.mime === "image/jpeg" || v.mime === "image/png" || v.mime === "image/webp") &&
    v.size <= 10485760,
  { message: "الصور يجب أن تكون JPG/PNG/WebP بحجم حتى 10MB" }
);

export const submissionSchema = z.object({
  conversationId: z.string().uuid(),
  attempt: z.coerce.number().int().min(1),
  video: videoMediaSchema.optional().nullable(),
  voice: voiceMediaSchema.optional().nullable(),
  imagesJson: z.string().default("[]")
});

export const submissionImagesSchema = z.array(imageMediaSchema).max(10);

export const uuidSchema = z.string().uuid();
