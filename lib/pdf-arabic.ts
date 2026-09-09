import bidiFactory from "bidi-js";

export type BidiDoc = { processArabic: (text: string) => string };

type PubSub = {
  getTopics: () => Record<string, Record<string, unknown>>;
  unsubscribe: (token: string) => boolean;
};

export type ArabicPdf = BidiDoc & {
  internal: { events: PubSub };
  events?: unknown;
};

const bidi = bidiFactory();

// bidi-js keeps directional format characters (LRE/RLE/LRO/RLO/PDF/isolates) in
// the reordered string; they would render as stray glyphs in the PDF, so strip them.
const BIDI_CONTROLS = /[\u200E-\u2069]/g;

/**
 * Shape the text with jsPDF's own Arabic shaper (works on the logical order so
 * letter joins/ligatures are correct), then reorder to the visual order with
 * bidi-js. The result must be drawn with BIDI_PASSTHROUGH so jsPDF's built-in
 * bidi engine (a postProcessText handler) does not reorder it a second time.
 */
export function shapeReorder(doc: BidiDoc, text: string): string {
  const cleaned = String(text).replace(BIDI_CONTROLS, "");
  const shaped = doc.processArabic(cleaned);
  return bidi.getReorderedString(shaped, bidi.getEmbeddingLevels(shaped, "rtl"));
}

/**
 * Remove jsPDF's built-in Arabic SHAPER from a document instance.
 *
 * jsPDF registers several text handlers on every document:
 *  - "preProcessText"  -> `processArabic` (repairs/ligates Arabic on EVERY text()
 *                         call, merging adjacent lam+alef into a "lam-alef"
 *                         ligature). Because we pre-shape AND pre-reorder to
 *                         visual order ourselves, the visual lam+alef pairs
 *                         that are adjacent get wrongly ligated again, which
 *                         turns e.g. «الطالب» into what reads like «الطلاب».
 *    ->   MUST be removed.
 *
 *  - "postProcessText" -> the built-in bidi reorderer AND the utf8 escaper.
 *      MUST BE KEPT: the bidi engine is a no-op on our strings (we pass
 *      BIDI_PASSTHROUGH, input is already visual), but the utf8 escaper is
 *      what produces the <XXXX> hex-encoded text runs and the correct
 *      ToUnicode/font subset. Removing it corrupts the text encoding
 *      (raw 8-bit bytes + broken cMap -> invisible/garbled Arabic).
 *
 * Call this right after `new jsPDF(...)` before drawing anything.
 */
export function disableArabicProcessing(doc: ArabicPdf): void {
  const topics = doc.internal.events.getTopics();
  for (const topic of ["preProcessText"]) {
    const subs = topics[topic];
    if (!subs) continue;
    for (const token of Object.keys(subs)) {
      doc.internal.events.unsubscribe(token);
    }
  }
}

/**
 * Options that make jsPDF's built-in bidi engine treat input/output as already
 * visual with matching directionality, i.e. it performs a no-op reorder
 * (pass-through) instead of reversing our visual-order text a second time.
 */
export const BIDI_PASSTHROUGH = {
  isInputVisual: true,
  isOutputVisual: true,
  isInputRtl: true,
  isOutputRtl: true
} as const;