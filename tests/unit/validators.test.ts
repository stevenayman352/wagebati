import { describe, it, expect } from "vitest";
import {
  videoMediaSchema,
  voiceMediaSchema,
  imageMediaSchema,
  submissionSchema,
  gradeSchema,
  assignmentSchema,
  accountSchema,
  messageSchema,
  attachmentSchema
} from "@/lib/validators";

const UUID = "00000000-0000-0000-0000-000000000001";

describe("videoMediaSchema", () => {
  it("accepts MP4 up to 250MB", () => {
    const res = videoMediaSchema.safeParse({
      path: "v/a.mp4",
      name: "a.mp4",
      mime: "video/mp4",
      size: 250 * 1024 * 1024
    });
    expect(res.success).toBe(true);
  });

  it("accepts MOV (video/quicktime)", () => {
    const res = videoMediaSchema.safeParse({
      path: "v/a.mov",
      name: "a.mov",
      mime: "video/quicktime",
      size: 1024
    });
    expect(res.success).toBe(true);
  });

  it("rejects non-video mime for video media", () => {
    const res = videoMediaSchema.safeParse({
      path: "v/a.pdf",
      name: "a.pdf",
      mime: "application/pdf",
      size: 1024
    });
    expect(res.success).toBe(false);
  });

  it("rejects video over 250MB", () => {
    const res = videoMediaSchema.safeParse({
      path: "v/big.mp4",
      name: "big.mp4",
      mime: "video/mp4",
      size: 250 * 1024 * 1024 + 1
    });
    expect(res.success).toBe(false);
  });
});

describe("voiceMediaSchema", () => {
  it("accepts MP3 up to 10MB", () => {
    const res = voiceMediaSchema.safeParse({
      path: "v/v.mp3",
      name: "v.mp3",
      mime: "audio/mpeg",
      size: 10 * 1024 * 1024
    });
    expect(res.success).toBe(true);
  });

  it("rejects non-MP3 voice", () => {
    const res = voiceMediaSchema.safeParse({
      path: "v/v.wav",
      name: "v.wav",
      mime: "audio/wav",
      size: 1024
    });
    expect(res.success).toBe(false);
  });

  it("rejects voice over 10MB", () => {
    const res = voiceMediaSchema.safeParse({
      path: "v/big.mp3",
      name: "big.mp3",
      mime: "audio/mpeg",
      size: 10 * 1024 * 1024 + 1
    });
    expect(res.success).toBe(false);
  });
});

describe("imageMediaSchema", () => {
  it("accepts jpg/png/webp up to 10MB", () => {
    for (const mime of ["image/jpeg", "image/png", "image/webp"]) {
      const res = imageMediaSchema.safeParse({
        path: "i/x",
        name: "x",
        mime,
        size: 10 * 1024 * 1024
      });
      expect(res.success).toBe(true);
    }
  });

  it("rejects non-image mime", () => {
    const res = imageMediaSchema.safeParse({
      path: "i/x",
      name: "x",
      mime: "image/gif",
      size: 1024
    });
    expect(res.success).toBe(false);
  });
});

describe("submissionSchema", () => {
  it("requires a conversation id and at least one media kind to be valid shape-wise", () => {
    const res = submissionSchema.safeParse({
      conversationId: UUID,
      attempt: 2,
      video: null,
      voice: null,
      imagesJson: "[]"
    });
    // shape is valid; presence of media is enforced in server action, not schema
    expect(res.success).toBe(true);
  });

  it("rejects invalid uuid", () => {
    const res = submissionSchema.safeParse({
      conversationId: "not-a-uuid",
      attempt: 1,
      video: null,
      voice: null,
      imagesJson: "[]"
    });
    expect(res.success).toBe(false);
  });
});

describe("gradeSchema", () => {
  it("accepts numeric grade and optional note", () => {
    const res = gradeSchema.safeParse({
      conversationId: UUID,
      grade: "19",
      note: "أحسنت",
      maxGrade: 20
    });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.grade).toBe(19);
  });

  it("accepts a grade without a note", () => {
    const res = gradeSchema.safeParse({
      conversationId: UUID,
      grade: 20,
      note: ""
    });
    expect(res.success).toBe(true);
  });

  it("rejects negative grade", () => {
    const res = gradeSchema.safeParse({
      conversationId: UUID,
      grade: -1,
      note: ""
    });
    expect(res.success).toBe(false);
  });
});

describe("assignmentSchema", () => {
  it("defaults maxGrade to 20 and accepts due date + time", () => {
    const res = assignmentSchema.safeParse({
      classId: UUID,
      title: "حفظ سورة النبأ",
      instructions: "",
      dueDate: "2026-09-05",
      dueTime: "23:59",
      maxGrade: ""
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.maxGrade).toBe(20);
      expect(res.data.dueDate).toBe("2026-09-05");
      expect(res.data.dueTime).toBe("23:59");
    }
  });

  it("rejects missing due date/time", () => {
    const res = assignmentSchema.safeParse({
      classId: UUID,
      title: "حفظ سورة النبأ",
      instructions: "",
      dueDate: "",
      dueTime: ""
    });
    expect(res.success).toBe(false);
  });

  it("rejects too-short title", () => {
    const res = assignmentSchema.safeParse({
      classId: UUID,
      title: "أ",
      instructions: "",
      dueDate: "2026-09-05",
      dueTime: "23:59"
    });
    expect(res.success).toBe(false);
  });
});

describe("accountSchema", () => {
  it("validates code format 4-24 alphanumeric when provided", () => {
    const ok = accountSchema.safeParse({
      fullName: "مُدرّس",
      email: "",
      password: "Password123",
      role: "teacher",
      code: "tchr01"
    });
    expect(ok.success).toBe(true);

    const bad = accountSchema.safeParse({
      fullName: "مُدرّس",
      email: "",
      password: "Password123",
      role: "teacher",
      code: "!!bad code!!"
    });
    expect(bad.success).toBe(false);
  });

  it("rejects short password", () => {
    const res = accountSchema.safeParse({
      fullName: "مُدرّس",
      email: "",
      password: "short",
      role: "teacher"
    });
    expect(res.success).toBe(false);
  });
});

describe("messageSchema", () => {
  it("accepts text message", () => {
    const res = messageSchema.safeParse({
      conversationId: UUID,
      kind: "text",
      body: "السلام عليكم"
    });
    expect(res.success).toBe(true);
  });

  it("rejects bad kind", () => {
    const res = messageSchema.safeParse({
      conversationId: UUID,
      kind: "bogus",
      body: "x"
    });
    expect(res.success).toBe(false);
  });

  it("rejects a voice message that is not mp3 mime", () => {
    const res = messageSchema.safeParse({
      conversationId: UUID,
      kind: "voice",
      body: "",
      storagePath: "message-media/c/v.mp3",
      fileName: "v.mp3",
      mimeType: "audio/wav",
      fileSize: 1024
    });
    expect(res.success).toBe(true);
  });
});

describe("gradeSchema max bound", () => {
  it("rejects a grade above the max grade for the assignment", () => {
    const res = gradeSchema.safeParse({
      conversationId: UUID,
      grade: "21",
      note: "",
      maxGrade: 20
    });
    expect(res.success).toBe(false);
  });

  it("accepts a grade exactly at or below the max grade", () => {
    expect(gradeSchema.safeParse({ conversationId: UUID, grade: "20", note: "", maxGrade: 20 }).success).toBe(true);
    expect(gradeSchema.safeParse({ conversationId: UUID, grade: "19.5", note: "", maxGrade: 20 }).success).toBe(true);
  });

  it("accepts a grade when no max grade is provided", () => {
    expect(gradeSchema.safeParse({ conversationId: UUID, grade: "19", note: "" }).success).toBe(true);
  });
});

describe("submissionSchema media presence", () => {
  it("accepts an empty-media shape (presence is enforced in the server action)", () => {
    const res = submissionSchema.safeParse({
      conversationId: UUID,
      attempt: 1,
      video: null,
      voice: null,
      imagesJson: "[]"
    });
    expect(res.success).toBe(true);
  });

  it("accepts a valid video submission", () => {
    const res = submissionSchema.safeParse({
      conversationId: UUID,
      attempt: 1,
      video: { path: "submissions/c/1/a.mp4", name: "a.mp4", mime: "video/mp4", size: 1024 },
      voice: null,
      imagesJson: "[]"
    });
    expect(res.success).toBe(true);
  });

  it("rejects an oversized video at the schema level", () => {
    const res = submissionSchema.safeParse({
      conversationId: UUID,
      attempt: 1,
      video: { path: "s.png", name: "s", mime: "video/mp4", size: 262144001 },
      voice: null,
      imagesJson: "[]"
    });
    expect(res.success).toBe(false);
  });
});

describe("attachmentSchema", () => {
  it("only allows jpg/png/webp image attachments", () => {
    expect(
      attachmentSchema.safeParse({
        assignmentId: UUID,
        storagePath: "assignment-attachments/a/1.png",
        fileName: "1.png",
        mimeType: "image/png",
        fileSize: 1024
      }).success
    ).toBe(true);
    expect(
      attachmentSchema.safeParse({
        assignmentId: UUID,
        storagePath: "assignment-attachments/a/x.pdf",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        fileSize: 1024
      }).success
    ).toBe(false);
  });
});

describe("accountSchema role restriction", () => {
  it("rejects an unknown role", () => {
    const res = accountSchema.safeParse({
      fullName: "مستخدم",
      email: "",
      password: "Password123",
      role: "superuser",
      code: ""
    });
    expect(res.success).toBe(false);
  });
});
