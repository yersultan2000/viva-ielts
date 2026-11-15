export type Criterion = 'fc' | 'lr' | 'gra' | 'pron';
export const CRITERIA: Criterion[] = ['fc', 'lr', 'gra', 'pron'];
export const CRITERION_NAME: Record<Criterion, string> = {
  fc: 'Fluency and Coherence',
  lr: 'Lexical Resource',
  gra: 'Grammatical Range and Accuracy',
  pron: 'Pronunciation',
};
export const CRITERION_SHORT: Record<Criterion, string> = {
  fc: 'Fluency',
  lr: 'Vocabulary',
  gra: 'Grammar',
  pron: 'Pronunciation',
};

export type Part = 0 | 1 | 2 | 3;
export type TargetBand = 7 | 7.5 | 8 | 8.5 | 9;
export const TARGETS: TargetBand[] = [7, 7.5, 8, 8.5, 9];

export interface CueCard {
  id: string;
  topic: string;
  prompt: string; // "Describe a person who ..."
  points: string[]; // "who this person is"
  closing: string; // "and explain why ..."
  roundOff: string;
  part3Theme: string;
  part3: string[];
  model?: string;
  generated?: boolean;
}

export interface Part1Topic {
  id: string;
  topic: string;
  questions: string[];
  model?: string; // model answer to the first question
}

/** Measurements taken from the microphone signal and the transcript of one answer. */
export interface AnswerMetrics {
  words: number;
  durationMs: number | null; // null when the answer was typed
  speakingMs: number | null;
  wpm: number | null;
  pauses: number | null; // silences of 1s or more inside the answer
  longPauses: number | null; // silences of 2.5s or more
  longestPauseMs: number | null;
  pitchRangeSt: number | null; // 5th–95th percentile pitch range, semitones
  pitchSdSt: number | null;
  confidence: number | null; // mean speech-recognition confidence, 0–1
  fillers: number;
}

export interface Turn {
  id: string;
  role: 'examiner' | 'candidate';
  part: Part;
  text: string;
  at: number;
  question?: string; // for candidate turns: the question being answered
  metrics?: AnswerMetrics;
  hasAudio?: boolean;
  typed?: boolean;
  longTurn?: boolean;
}

export interface CriterionResult {
  band: number;
  summary: string;
  evidence: string[];
  toImprove: string[];
}

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface ImprovedAnswer {
  question: string;
  original: string;
  improved: string;
  why: string;
  isModel?: boolean; // a stock model answer rather than a rewrite of the candidate's answer
}

export interface PlanItem {
  title: string;
  detail: string;
  link?: string;
}

export interface Report {
  source: 'ai' | 'demo';
  overall: number;
  criteria: Record<Criterion, CriterionResult>;
  examinerNote: string;
  corrections: Correction[];
  vocabulary: {
    strong: string[];
    overused: { word: string; count: number }[];
    upgrades: { from: string; to: string; note: string }[];
  };
  fluencyNote: string;
  pronunciationNote: string;
  improved: ImprovedAnswer[];
  plan: PlanItem[];
  limitedEvidence?: boolean;
}

export interface ExamConfig {
  preset: 'full' | 'short' | 'custom';
  parts: { p1: boolean; p2: boolean; p3: boolean };
  p1Sec: number;
  prepSec: number;
  talkSec: number;
  p3Sec: number;
  topicIds?: string[];
  cueCardId?: string;
}

export interface ExamRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  config: ExamConfig;
  target: TargetBand;
  mode: 'ai' | 'demo';
  turns: Turn[];
  cueCard?: CueCard;
  notes?: string;
  report: Report;
}

export interface VocabItem {
  id: string;
  term: string;
  meaning: string;
  example: string;
  topic?: string;
  addedAt: number;
  known?: boolean;
}

export interface SavedQuestion {
  id: string;
  text: string;
  part: 1 | 2 | 3;
  addedAt: number;
}

export interface PracticeLog {
  id: string;
  at: number;
  kind: string; // 'part1' | 'part2' | 'part3' | 'fluency' | 'vocab' | 'challenge' | 'exam'
  seconds: number;
  wpm?: number | null;
  label?: string;
}

export interface Settings {
  name: string;
  target: TargetBand;
  theme: 'system' | 'light' | 'dark';
  backendUrl: string;
  voiceURI: string;
  rate: number;
  analyseAudio: boolean;
  autoAdvance: boolean;
}

export interface AppState {
  settings: Settings;
  exams: ExamRecord[];
  vocab: VocabItem[];
  saved: SavedQuestion[];
  bookmarks: CueCard[];
  practice: PracticeLog[];
  challenges: Record<string, boolean>;
}
