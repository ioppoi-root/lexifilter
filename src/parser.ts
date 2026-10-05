import type { ParsedCandidate } from './types';

const CJK = /[\u3400-\u9fff]/;
const LEADING_NUMBER = /^\s*(?:\d{1,4}[.)、．]\s*|[•·▪●]\s*)/;
const HEADER = /^(?:part\s+[ivx\d]+|chapter\s+\d+|page\s+\d+|\d+\s*\/\s*\d+|lexifilter\s+pdf\b)/i;

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/^[\s:：;；,，.。\-—]+|[\s]+$/g, '').trim();
}

function splitByCjk(line: string): [string, string] | null {
  const idx = line.search(CJK);
  if (idx <= 0) return null;
  const left = clean(line.slice(0, idx));
  const right = clean(line.slice(idx));
  return left && right ? [left, right] : null;
}

function splitBySeparator(line: string): [string, string] | null {
  const parts = line.split(/\s*(?:\t+|\s[-—–:：]\s|\s{2,})\s*/).filter(Boolean);
  if (parts.length < 2) return null;
  const left = clean(parts[0] ?? '');
  const right = clean(parts.slice(1).join(' '));
  return left && right ? [left, right] : null;
}

function plausibleTerm(term: string): boolean {
  if (term.length < 1 || term.length > 100) return false;
  if (HEADER.test(term)) return false;
  if (!/[A-Za-zÀ-ž]/.test(term)) return false;
  const letters = (term.match(/[A-Za-zÀ-ž]/g) ?? []).length;
  return letters / term.length > 0.35;
}

export function parseVocabularyText(text: string, page?: number): ParsedCandidate[] {
  const lines = text
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(x => x.replace(LEADING_NUMBER, '').trim())
    .filter(Boolean);

  const out: ParsedCandidate[] = [];
  for (const raw of lines) {
    if (HEADER.test(raw) || raw.length > 260) continue;
    const cjkSplit = splitByCjk(raw);
    const sepSplit = cjkSplit ?? splitBySeparator(raw);
    if (!sepSplit) continue;
    const [term, meaning] = sepSplit;
    if (!plausibleTerm(term) || meaning.length < 1) continue;
    out.push({
      term,
      meaning,
      page,
      raw,
      selected: true,
      confidence: cjkSplit ? 'high' : 'medium'
    });
  }
  return out;
}

export function dedupeCandidates(items: ParsedCandidate[]): ParsedCandidate[] {
  const map = new Map<string, ParsedCandidate>();
  for (const item of items) {
    const key = item.term.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...item });
      continue;
    }
    const meanings = new Set(prev.meaning.split('；').map(x => x.trim()).filter(Boolean));
    if (!meanings.has(item.meaning.trim())) meanings.add(item.meaning.trim());
    prev.meaning = [...meanings].join('；');
    prev.confidence = prev.confidence === 'high' && item.confidence === 'high' ? 'high' : 'medium';
  }
  return [...map.values()];
}
