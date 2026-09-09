"use client";

import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Loader2 } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfViewer({
  fileUrl,
  scale,
  onTotalPages
}: {
  fileUrl: string;
  scale: number;
  onTotalPages?: (n: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setLoading(false);
      onTotalPages?.(numPages);
    },
    [onTotalPages]
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    setLoading(false);
    setError(err.message || "فشل تحميل الملف");
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {loading && (
        <div className="flex items-center gap-2 py-20 text-white/70">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">جارِ التحميل...</span>
        </div>
      )}
      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={null}
        error={null}
      >
        <Page
          pageNumber={1}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="shadow-2xl"
        />
      </Document>
    </div>
  );
}

export function PdfViewerMultiPage({
  fileUrl,
  scale,
  onTotalPages
}: {
  fileUrl: string;
  scale: number;
  onTotalPages?: (n: number) => void;
}) {
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
      setLoading(false);
      onTotalPages?.(n);
    },
    [onTotalPages]
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    setLoading(false);
    setError(err.message || "فشل تحميل الملف");
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-white">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {loading && (
        <div className="flex items-center gap-2 py-20 text-white/70">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">جارِ التحميل...</span>
        </div>
      )}
      <Document
        file={fileUrl}
        onLoadSuccess={onDocumentLoadSuccess}
        onLoadError={onDocumentLoadError}
        loading={null}
        error={null}
      >
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={`page_${i + 1}`}
            pageNumber={i + 1}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-2xl"
          />
        ))}
      </Document>
    </div>
  );
}
