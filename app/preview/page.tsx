"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  FileSpreadsheet,
  FileText,
  Loader2
} from "lucide-react";

const PdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((m) => m.PdfViewerMultiPage),
  { ssr: false, loading: () => <PdfLoading /> }
);

const ExcelPreview = dynamic(
  () => import("@/components/excel-preview").then((m) => m.ExcelPreview),
  { ssr: false, loading: () => <PdfLoading /> }
);

function PdfLoading() {
  return (
    <div className="flex items-center gap-2 py-20 text-white/70">
      <Loader2 className="size-5 animate-spin" />
      <span className="text-sm">جارِ التحميل...</span>
    </div>
  );
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

function getInitialTitle(target: string | null, format: string | null): string {
  if (target === "student" && format === "pdf") return "ملف واجبات الطالب";
  if (target === "student" && format === "xlsx") return "درجات الطالب";
  if (target === "class" && format === "pdf") return "تقرير الصف";
  if (target === "class" && format === "xlsx") return "كشف الدرجات";
  return "معاينة الملف";
}

function deriveFileName(
  contentDisposition: string | null,
  target: string | null,
  format: string | null
): string {
  if (contentDisposition) {
    const match = contentDisposition.match(/filename\*?=(?:UTF-8''|")?([^";\n]+)/i);
    if (match) {
      try {
        return decodeURIComponent(match[1].replace(/"/g, ""));
      } catch {
        return match[1].replace(/"/g, "");
      }
    }
  }
  const ext = format === "pdf" ? "pdf" : "xlsx";
  const prefix = target === "student" ? "تقرير-طالب" : "تقرير-صف";
  return `${prefix}.${ext}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PreviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const target = searchParams.get("target");
  const format = searchParams.get("format");
  const id = searchParams.get("id");

  const [scale, setScale] = useState(1);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [fileName, setFileName] = useState("");
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const apiUrl = `/api/export?target=${target}&format=${format}&id=${id}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setFetching(true);
        setFetchError(null);
        const res = await fetch(apiUrl);
        if (!res.ok) {
          if (res.status === 401) throw new Error("غير مصرح לך بالوصول");
          if (res.status === 403) throw new Error("ليس لديك صلاحية تصدير هذا الملف");
          if (res.status === 404) throw new Error("الملف غير موجود");
          throw new Error(`خطأ ${res.status}`);
        }
        const b = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(b);
        setBlobUrl(url);
        setBlob(b);
        setFileName(
          deriveFileName(res.headers.get("content-disposition"), target, format)
        );
      } catch (e) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : "فشل تحميل الملف");
      } finally {
        if (!cancelled) setFetching(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, target, format, id]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }, [router]);

  const handleDownload = useCallback(() => {
    if (blob) downloadBlob(blob, fileName);
  }, [blob, fileName]);

  const handleShare = useCallback(async () => {
    if (blob && navigator.share) {
      try {
        const ext = format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        const file = new File([blob], fileName, { type: ext });
        await navigator.share({ title: fileName, files: [file] });
      } catch {
        /* user cancelled or not supported */
      }
    } else if (blob) {
      downloadBlob(blob, fileName);
    }
  }, [blob, fileName, format]);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + ZOOM_STEP, ZOOM_MAX)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - ZOOM_STEP, ZOOM_MIN)), []);
  const zoomReset = useCallback(() => setScale(1), []);

  const title = getInitialTitle(target, format);
  const isPdf = format === "pdf";
  const isXlsx = format === "xlsx";

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-full flex-col bg-[#0a0a0a]">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#111] px-2 py-2 sm:px-3 sm:py-2.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-9 gap-1 bg-white/10 px-2 text-white hover:bg-white/20 hover:text-white"
            onClick={handleBack}
            aria-label="رجوع"
          >
            <ArrowRight className="size-4 rtl:-scale-x-100" />
            <span className="text-sm font-medium">رجوع</span>
          </Button>
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            {isPdf ? (
              <FileText className="size-4 shrink-0 text-red-400" />
            ) : (
              <FileSpreadsheet className="size-4 shrink-0 text-green-400" />
            )}
            <span className="max-w-[220px] truncate text-sm font-medium text-white">
              {title}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            className="h-9 gap-1 bg-white/10 px-2 text-white hover:bg-white/20 hover:text-white"
            onClick={handleShare}
            aria-label="مشاركة"
          >
            <Share2 className="size-4" />
            <span className="text-sm font-medium max-sm:hidden">مشاركة</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-9 gap-1 bg-white/10 px-2 text-white hover:bg-white/20 hover:text-white"
            onClick={handleDownload}
            aria-label="تحميل"
            disabled={!blob}
          >
            <Download className="size-4" />
            <span className="text-sm font-medium max-sm:hidden">تحميل</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full justify-center">
          {fetching ? (
            <div className="flex flex-col items-center gap-3 py-20">
              <Loader2 className="size-6 animate-spin text-white/60" />
              <span className="text-sm text-white/50">جارِ تحميل الملف...</span>
            </div>
          ) : fetchError ? (
            <div className="flex flex-col items-center gap-4 py-20">
              <p className="text-sm text-red-400">{fetchError}</p>
              <Button variant="outline" size="sm" onClick={handleBack} className="text-white border-white/20 hover:bg-white/10">
                <ArrowRight className="size-4 ml-1.5" />
                رجوع
              </Button>
            </div>
          ) : blobUrl && isPdf ? (
            <PdfViewer fileUrl={blobUrl} scale={scale} />
          ) : blobUrl && isXlsx ? (
            <div className="w-full">
              <ExcelPreview fileUrl={blobUrl} scale={scale} />
            </div>
          ) : null}
        </div>
      </div>

      {/* Zoom Controls */}
      {!fetching && !fetchError && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-white/10 bg-[#111] px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            className="size-8 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={zoomOut}
            disabled={scale <= ZOOM_MIN}
            aria-label="تصغير"
          >
            <ZoomOut className="size-4" />
          </Button>
          <button
            type="button"
            onClick={zoomReset}
            className="min-w-[52px] rounded-md px-2 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white tabular-nums"
            title="إعادة ضبط الحجم"
          >
            {Math.round(scale * 100)}%
          </button>
          <Button
            type="button"
            variant="ghost"
            className="size-8 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            onClick={zoomIn}
            disabled={scale >= ZOOM_MAX}
            aria-label="تكبير"
          >
            <ZoomIn className="size-4" />
          </Button>
          {scale !== 1 && (
            <Button
              type="button"
              variant="ghost"
              className="size-8 bg-white/10 text-white/60 hover:bg-white/20 hover:text-white"
              onClick={zoomReset}
              aria-label="إعادة ضبط"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]">
          <Loader2 className="size-6 animate-spin text-white/60" />
        </div>
      }
    >
      <PreviewContent />
    </Suspense>
  );
}
