import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shapeReorder, disableArabicProcessing } from "@/lib/pdf-arabic";

const doc = new jsPDF() as unknown as { processArabic: (s: string) => string };

function reorder(text: string): string {
  return shapeReorder(doc, text);
}

describe("shapeReorder", () => {
  it("keeps pure-Arabic logical order intact (visual right-to-left)", () => {
    expect(reorder("الكود: 4821")).toBe("4821 :ﺩﻮﻜﻟﺍ");
  });

  it("keeps percent glued to its number (regression: was %90 separated)", () => {
    expect(reorder("النسبة المئوية: 90%")).toBe("%90 :ﺔﻳﻮﺌﻤﻟﺍ ﺔﺒﺴﻨﻟﺍ");
  });

  it("mixes Latin digit into Arabic class name on the left side", () => {
    expect(reorder("الصف: 5أ")).toBe("ﺃ5 :ﻒﺼﻟﺍ");
  });

  it("keeps date/time as one LTR block before the Arabic time unit", () => {
    expect(reorder("تاريخ التصدير: 09/09/2026 02:30 م")).toBe("ﻡ 02:30 09/09/2026 :ﺮﻳﺪﺼﺘﻟﺍ ﺦﻳﺭﺎﺗ");
  });

  it("orders RTL number phrases correctly across spaces", () => {
    expect(reorder("مجموع درجات الطالب: 45 من 50")).toBe("50 ﻦﻣ 45 :ﺐﻟﺎﻄﻟﺍ ﺕﺎﺟﺭﺩ ﻉﻮﻤﺠﻣ");
  });

  it("shapes names with ligatures while keeping reading order", () => {
    expect(reorder("الاسم: أحمد محمد علي")).toBe("ﻲﻠﻋ ﺪﻤﺤﻣ ﺪﻤﺣﺃ :ﻢﺳﻻﺍ");
  });

  it("strips LTR override marks instead of emitting them", () => {
    expect(reorder("تاريخ التصدير: \u202D09/09/2026 02:30\u202C م")).toBe(
      "ﻡ 02:30 09/09/2026 :ﺮﻳﺪﺼﺘﻟﺍ ﺦﻳﺭﺎﺗ"
    );
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyJsPdf = any;

describe("disableArabicProcessing", () => {
  it("removes only the preProcessText shaper, keeping the postProcessText (bidi + utf8 escaper) handlers", () => {
    const d = new jsPDF() as AnyJsPdf;
    const topics = d.internal.events.getTopics();
    expect(Object.keys(topics.preProcessText || {})).toHaveLength(1);
    expect(Object.keys(topics.postProcessText || {}).length).toBeGreaterThan(0);
    disableArabicProcessing(d);
    expect(Object.keys(topics.preProcessText || {})).toHaveLength(0);
    // kept: removing these corrupts the text encoding (raw 8-bit bytes + broken cMap)
    expect(Object.keys(topics.postProcessText || {}).length).toBeGreaterThan(0);
  });

  // Decodes the <XXXX> hex text runs of a generated PDF back to unicode using the
  // embedded ToUnicode CMaps, so we can assert what text the viewer will actually
  // receive.
  function decodedText(rawPdf: Buffer): string {
    const s = Buffer.from(rawPdf).toString("latin1");
    const toUni = new Map<number, number>();
    for (const block of s.match(/beginbfchar[\s\S]*?endbfchar/g) ?? []) {
      for (const m of block.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        toUni.set(parseInt(m[1], 16), parseInt(m[2], 16));
      }
    }
    let out = "";
    for (const m of s.matchAll(/<([0-9A-Fa-f]{8,})>\s*Tj/g)) {
      const codes = m[1];
      for (let i = 0; i + 4 <= codes.length; i += 4) {
        const code = parseInt(codes.slice(i, i + 4), 16);
        out += String.fromCodePoint(toUni.get(code) ?? code);
      }
      for (let i = Math.floor(codes.length / 4) * 4; i + 2 <= codes.length; i += 2) {
        const code = parseInt(codes.slice(i, i + 2), 16);
        out += String.fromCodePoint(toUni.get(code) ?? code);
      }
    }
    return out;
  }

  it("renders «الطالب» correctly (no lam-alef ligature) inside the visual-order title", () => {
    const amiri = readFileSync(join(process.cwd(), "public/fonts/Amiri-Bold.ttf")).toString(
      "base64"
    );

    const make = (): AnyJsPdf => {
      const doc2 = new jsPDF() as AnyJsPdf;
      doc2.addFileToVFS("Amiri-Bold.ttf", amiri);
      doc2.addFont("Amiri-Bold.ttf", "Amiri", "bold");
      doc2.setFont("Amiri", "bold");
      doc2.setFontSize(12);
      return doc2;
    };

    const d = make();
    disableArabicProcessing(d);
    const input = "ملف واجبات الطالب";
    d.text(shapeReorder(d, input), 100, 100);
    const decoded = decodedText(Buffer.from(d.output("arraybuffer")));

    // the viewer rebuilds the LOGICAL text from the ToUnicode cmaps: it must
    // equal the shaped logical input. Any double-shaping (lam-alef merge that
    // turns «الطالب» into «الطلاب») or the corrupted raw-byte encoding of the
    // removed utf8 escaper both change what decodes out of the content stream.
    expect(decoded).toBe(d.processArabic(input));
    expect(decoded.includes("\uFEFB") || decoded.includes("\uFEFC")).toBe(false);
  });
});