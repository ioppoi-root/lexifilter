export type Rating = 'known' | 'vague' | 'unknown';

export interface WordEntry {
  id: string;
  term: string;
  meaning: string;
  source?: string;
  page?: number;
  createdAt: number;
}

export interface WordProgress {
  rating?: Rating;
  wrong: number;
  screenedAt?: string;
  reviewedAt?: string;
}

export interface StudyPlan {
  startDate: string;
  days: number;
  reviewDays: number;
  initialUnseen: number;
  initialScreened: number;
}

export interface AppState {
  version: 1;
  bookName: string;
  words: WordEntry[];
  progress: Record<string, WordProgress>;
  plan: StudyPlan | null;
  updatedAt: number;
}

export interface ParsedCandidate {
  term: string;
  meaning: string;
  page?: number;
  raw: string;
  selected: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedPage {
  page: number;
  text: string;
  method: 'text' | 'ocr';
}
