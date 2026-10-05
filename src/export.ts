import type { AppState, WordEntry } from './types';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJson(state: AppState) {
  download(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }), `lexifilter-backup-${Date.now()}.json`);
}

export function exportCsv(state: AppState, words: WordEntry[]) {
  const rows = [['term', 'meaning', 'rating', 'wrong']];
  for (const w of words) {
    const p = state.progress[w.id];
    rows.push([w.term, w.meaning, p?.rating ?? '', String(p?.wrong ?? 0)]);
  }
  const csv = '\ufeff' + rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `lexifilter-words-${Date.now()}.csv`);
}
