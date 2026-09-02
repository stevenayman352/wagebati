import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type UploadHandle = {
  done: Promise<void>;
  cancel: () => void;
};

function translateUploadError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("mime") || lower.includes("not supported") || lower.includes("content type")) {
    return "نوع الملف غير مدعوم على الخادم (فيديو MP4/MOV، صور JPG/PNG/WebP).";
  }
  if (lower.includes("size") || lower.includes("too large") || lower.includes("exceeds") || lower.includes("limit")) {
    return "حجم الملف أكبر من الحد المسموح.";
  }
  if (lower.includes("permission") || lower.includes("policy") || lower.includes("forbidden") || lower.includes("access")) {
    return "غير مصرح لك برفع هذا الملف.";
  }
  return ["فشل الرفع.", "يبدو أن شيئًا ما لم يعمل.", ""].some((f) => f === raw)
    ? raw
    : `${raw} — تحقق من إعدادات التخزين.`;
}

export function uploadWithProgress(
  file: File,
  path: string,
  opts: { bucket: string; onProgress?: (percent: number) => void }
): UploadHandle {
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const endpoint = `${host}/storage/v1/object/${opts.bucket}/${path}`;

  let resolveDone: () => void = () => {};
  let rejectDone: (reason: Error) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const run = (async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      rejectDone(new Error("غير مسجل الدخول."));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.setRequestHeader("apikey", anon);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.setRequestHeader("x-upsert", "false");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(100);
        resolveDone();
        return;
      }
      let message = "فشل الرفع.";
      try {
        const json = JSON.parse(xhr.responseText);
        message = json.message ?? json.error ?? message;
      } catch {
        /* ignore */
      }
      rejectDone(new Error(translateUploadError(message)));
    };
    xhr.onerror = () => rejectDone(new Error("تعذر الاتصال بالخادم."));
    xhr.onabort = () => rejectDone(new Error("أُلغي الرفع."));

    xhr.send(file);
    return xhr;
  })();

  return {
    done,
    cancel() {
      void run.then((xhr) => {
        if (xhr) xhr.abort();
      });
    }
  };
}