import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ExtractedPage } from './types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfExtractOptions {
  ocrMode: 'off' | 'auto' | 'all';
  ocrLanguage: string;
  onProgress?: (message: string, percent: number) => void;
}

const CJK = /[\u3400-\u9fff]/g;

/**
 * pdfjs-dist does not automatically know where its packed CMaps / standard
 * fonts live when it is bundled by Vite. CJK PDFs that use CID fonts (for
 * example UniGB-UCS2-H / STSong) can therefore expose English text but lose
 * the Chinese meaning completely. Use the matching pdfjs-dist assets from a
 * version-pinned CDN. This is only needed for PDFs that reference those
 * resources; ordinary PDFs continue to be parsed locally.
 *
 * A future fully-offline build can copy these directories into /public and
 * change this base to a local path.
 */
const PDFJS_ASSET_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/`;

async function pageText(page: any): Promise<string> {
  const content = await page.getTextContent({ disableNormalization: false });
  const rows = new Map<number, { x: number; str: string }[]>();
  for (const item of content.items as any[]) {
    if (!('str' in item) || !String(item.str).trim()) continue;
    const y = Math.round((Number(item.transform?.[5]) || 0) / 2) * 2;
    const row = rows.get(y) ?? [];
    row.push({ x: Number(item.transform?.[4] ?? 0), str: String(item.str) });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts
      .sort((a, b) => a.x - b.x)
      .map(p => p.str)
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n');
}

function shouldAutoOcr(text: string): boolean {
  const compact = text.replace(/\s/g, '');
  if (compact.length < 35) return true;

  // A common failure mode for Chinese vocabulary PDFs is: PDF.js extracts the
  // English terms but cannot decode the CID-font Chinese meanings. In that
  // case the page looks "long enough" to the old heuristic, so OCR never ran.
  // If there are many Latin letters but essentially no CJK characters, OCR is
  // a safer fallback for a Chinese-vocabulary workflow.
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const cjk = (text.match(CJK) ?? []).length;
  if (latin >= 20 && cjk < 2) return true;

  return false;
}

async function ocrPage(page: any, language: string, workerHolder: { worker?: any }): Promise<string> {
  if (!workerHolder.worker) {
    const { createWorker } = await import('tesseract.js');
    const langs = language.includes('+') ? language.split('+').filter(Boolean) : language;
    workerHolder.worker = await createWorker(langs);
  }
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建 Canvas，不能执行 OCR。');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const result = await workerHolder.worker.recognize(canvas);
  return result.data.text ?? '';
}

export async function extractPdf(file: File, options: PdfExtractOptions): Promise<ExtractedPage[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({
    data,
    cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  }).promise;

  const pages: ExtractedPage[] = [];
  const workerHolder: { worker?: any } = {};
  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      options.onProgress?.(`正在读取第 ${i}/${pdf.numPages} 页`, Math.round((i - 1) / pdf.numPages * 100));
      const page = await pdf.getPage(i);
      let text = await pageText(page);
      const needsOcr = options.ocrMode === 'all' || (options.ocrMode === 'auto' && shouldAutoOcr(text));
      let method: 'text' | 'ocr' = 'text';

      if (needsOcr) {
        options.onProgress?.(`第 ${i} 页文本层不完整，正在 OCR`, Math.round((i - 0.5) / pdf.numPages * 100));
        const ocrText = await ocrPage(page, options.ocrLanguage, workerHolder);
        // Never replace useful text with an empty OCR result.
        if (ocrText.trim()) {
          text = ocrText;
          method = 'ocr';
        }
      }
      pages.push({ page: i, text, method });
    }
  } finally {
    if (workerHolder.worker) await workerHolder.worker.terminate();
  }
  options.onProgress?.('解析完成', 100);
  return pages;
}
