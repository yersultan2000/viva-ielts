import { CUE_CARDS, PART1, PART3_MODELS } from './bank';
import {
  connectivesUsed, countFillers, grammarHits, lessCommonWords, mattr, overusedWords, repetitions,
  structuresUsed, subordinatorCount, tokens,
} from './metrics';
import { CRITERIA } from './types';
import type { Criterion, CriterionResult, CueCard, ImprovedAnswer, PlanItem, Report, TargetBand, Turn } from './types';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/**
 * IELTS publishes that the four criteria are weighted equally and averaged.
 * It does not publish how a quarter-band average is rounded for Speaking, so
 * Viva rounds down to the nearest half band rather than risk overstating.
 */
export function overallFrom(criteria: Record<Criterion, { band: number }>): number {
  const mean = CRITERIA.reduce((s, c) => s + criteria[c].band, 0) / 4;
  return Math.floor(mean * 2) / 2;
}

export interface Aggregate {
  words: number;
  answers: number;
  timedMs: number;
  timedWords: number;
  wpm: number | null;
  pauses: number | null;
  longPauses: number | null;
  longestPauseMs: number | null;
  pausesPerMin: number | null;
  fillers: number;
  fillersPer100: number;
  confidence: number | null;
  pitchSdSt: number | null;
  pitchRangeSt: number | null;
  text: string;
}

export function aggregate(turns: Turn[]): Aggregate {
  const cand = turns.filter((t) => t.role === 'candidate' && t.text.trim());
  const text = cand.map((t) => t.text).join(' . ');
  const words = tokens(text).length;
  let timedMs = 0, timedWords = 0, pauses = 0, longPauses = 0, longest = 0, hasPause = false;
  let confSum = 0, confW = 0, pitchSum = 0, rangeSum = 0, pitchN = 0;
  for (const t of cand) {
    const m = t.metrics;
    if (!m) continue;
    if (m.durationMs) { timedMs += m.durationMs; timedWords += m.words; }
    if (m.pauses != null) { hasPause = true; pauses += m.pauses; longPauses += m.longPauses || 0; longest = Math.max(longest, m.longestPauseMs || 0); }
    if (m.confidence != null && m.words) { confSum += m.confidence * m.words; confW += m.words; }
    if (m.pitchSdSt != null) { pitchSum += m.pitchSdSt; rangeSum += m.pitchRangeSt || 0; pitchN++; }
  }
  const fillers = countFillers(text).count;
  const mins = timedMs / 60000;
  return {
    words, answers: cand.length, timedMs, timedWords,
    wpm: timedMs > 5000 ? Math.round(timedWords / mins) : null,
    pauses: hasPause ? pauses : null,
    longPauses: hasPause ? longPauses : null,
    longestPauseMs: hasPause ? longest : null,
    pausesPerMin: hasPause && mins > 0.1 ? +(pauses / mins).toFixed(1) : null,
    fillers,
    fillersPer100: words ? +((fillers / words) * 100).toFixed(1) : 0,
    confidence: confW ? confSum / confW : null,
    pitchSdSt: pitchN ? +(pitchSum / pitchN).toFixed(1) : null,
    pitchRangeSt: pitchN ? +(rangeSum / pitchN).toFixed(1) : null,
    text,
  };
}

const quote = (s: string, n = 14) => {
  const w = s.trim().split(/\s+/);
  return `“${w.slice(0, n).join(' ')}${w.length > n ? '…' : ''}”`;
};

/**
 * Demo-mode estimate. This is a transparent rule set over measurable features
 * (speech rate, pauses, lexical variety, structures used). It cannot judge
 * meaning, accuracy in context or the sounds of speech the way an examiner or
 * a language model can, so its bands are capped between 4 and 8 and labelled
 * as rough wherever they are shown.
 */
export function demoReport(turns: Turn[], target: TargetBand, cueCard?: CueCard): Report {
  const a = aggregate(turns);
  const toks = tokens(a.text);
  const cand = turns.filter((t) => t.role === 'candidate' && t.text.trim());
  const limited = a.words < 80;

  // Fluency and Coherence
  const conn = connectivesUsed(a.text);
  const reps = repetitions(toks);
  const shortAnswers = cand.filter((t) => !t.longTurn && tokens(t.text).length < 12).length;
  let fc = 6;
  const fcEv: string[] = [];
  if (a.wpm != null) {
    fc = a.wpm < 80 ? 4 : a.wpm < 100 ? 5 : a.wpm < 120 ? 6 : a.wpm <= 175 ? 7 : 6;
    fcEv.push(`Speech rate: ${a.wpm} words per minute across ${Math.round(a.timedMs / 1000)}s of answers (fluent conversational English is typically 120–170).`);
  } else {
    fc = 5;
    fcEv.push('No timing data: answers were typed or audio analysis was off, so speech rate and pausing could not be measured.');
  }
  if (a.pausesPerMin != null) {
    fcEv.push(`Pauses of a second or more: ${a.pauses} (${a.pausesPerMin} per minute); ${a.longPauses} lasted 2.5s or longer${a.longestPauseMs ? `, the longest ${(a.longestPauseMs / 1000).toFixed(1)}s` : ''}.`);
    if (a.pausesPerMin > 6) fc -= 1;
    if (a.timedMs && (a.longPauses || 0) / (a.timedMs / 60000) > 2) fc -= 1;
  }
  fcEv.push(`Fillers recognised: ${a.fillers} (${a.fillersPer100} per 100 words). Speech recognition drops many "um" sounds, so treat this as a minimum.`);
  if (a.fillersPer100 > 6) fc -= 1;
  fcEv.push(conn.length ? `Linking expressions used (${conn.length}): ${conn.slice(0, 8).join(', ')}.` : 'No linking expressions were recognised.');
  if (conn.length >= 7) fc += 1;
  if (conn.length <= 2) fc -= 1;
  if (shortAnswers >= Math.max(2, cand.length / 2)) {
    fc -= 1;
    fcEv.push(`${shortAnswers} of ${cand.length} answers were under 12 words, which limits evidence of extended speech.`);
  }
  if (reps > 3) fcEv.push(`Immediate word repetitions: ${reps}.`);
  fc = clamp(fc, 4, 8);

  // Lexical Resource
  const variety = mattr(toks);
  const rare = lessCommonWords(toks);
  const over = overusedWords(toks);
  let lr = variety == null ? 5 : variety < 0.55 ? 5 : variety < 0.65 ? 6 : 7;
  const lrEv: string[] = [
    variety == null
      ? 'Too few words to measure lexical variety reliably.'
      : `Lexical variety (moving type–token ratio): ${variety.toFixed(2)}. Below 0.55 suggests heavy repetition; above 0.65 a flexible range.`,
  ];
  const rareShare = toks.length ? rare.length / toks.length : 0;
  lrEv.push(rare.length ? `Longer, less common words (${rare.length}): ${rare.slice(0, 10).join(', ')}.` : 'No longer, less common words were recognised.');
  if (rareShare >= 0.05) lr += 1;
  if (rareShare < 0.015) lr -= 1;
  if (over.length >= 3) {
    lr -= 1;
    lrEv.push(`Repeated content words: ${over.map((o) => `${o.word} ×${o.count}`).join(', ')}.`);
  }
  if (a.words < 120) lr = Math.min(lr, 6);
  lr = clamp(lr, 4, 8);

  // Grammatical Range and Accuracy
  const structs = structuresUsed(a.text);
  const subs = subordinatorCount(toks);
  const subRate = toks.length ? (subs / toks.length) * 100 : 0;
  const hits = grammarHits(a.text);
  const errRate = toks.length ? (hits.length / toks.length) * 100 : 0;
  let gra = subRate < 1.5 ? 5 : subRate < 3 ? 6 : 7;
  const graEv: string[] = [
    `Subordinating words (because, which, although…): ${subs}, or ${subRate.toFixed(1)} per 100 words — a rough indicator of complex sentences.`,
    structs.length ? `Structures detected: ${structs.join(', ')}.` : 'Only simple present and past structures were detected.',
  ];
  if (structs.length >= 5) gra += 1;
  if (structs.length <= 1) gra -= 1;
  if (hits.length) {
    graEv.push(`Rule-based check found ${hits.length} likely error${hits.length > 1 ? 's' : ''}, e.g. ${quote(hits[0].original, 10)}.`);
    gra -= errRate > 3 ? 2 : errRate > 1.2 ? 1 : 0;
  } else {
    graEv.push('The rule-based check found none of the common errors it looks for. It covers a limited set, so this is not proof of accuracy.');
  }
  gra = clamp(gra, 4, 8);

  // Pronunciation (always provisional)
  let pron: number;
  const prEv: string[] = [];
  let pronNote: string;
  if (a.confidence == null && a.pitchSdSt == null) {
    pron = Math.floor((fc + lr + gra) / 3);
    prEv.push('No audio evidence was available for this session.');
    pronNote = 'Pronunciation was not assessed: there was no audio signal or recognition confidence to work from. The figure shown is only the rounded-down mean of the other three criteria, used as a placeholder so an overall estimate can be calculated.';
  } else {
    pron = 6;
    if (a.confidence != null) {
      const c = a.confidence;
      pron = c >= 0.92 ? 7 : c >= 0.85 ? 6 : c >= 0.75 ? 5 : 4;
      prEv.push(`Mean speech-recognition confidence: ${(c * 100).toFixed(0)}%. This reflects how easily a recogniser trained mostly on standard accents understood you, which is related to intelligibility but is not the same thing.`);
    }
    if (a.pitchSdSt != null) {
      prEv.push(`Pitch movement: standard deviation ${a.pitchSdSt} semitones, typical range ${a.pitchRangeSt} semitones. Under about 1.5 sounds flat; 2–4 is usual for expressive speech.`);
      if (a.pitchSdSt < 1.5) pron -= 1;
      if (a.pitchSdSt >= 3 && a.confidence != null && a.confidence >= 0.85) pron += 1;
    }
    pron = clamp(pron, 4, 8);
    pronNote = 'Provisional. Viva measures pitch movement and pausing from your microphone signal and uses recognition confidence as a proxy for intelligibility. It does not analyse individual sounds, word stress or connected speech, which a trained examiner listens for.';
  }

  const mk = (band: number, summary: string, evidence: string[], toImprove: string[]): CriterionResult => ({ band, summary, evidence, toImprove });
  const criteria: Record<Criterion, CriterionResult> = {
    fc: mk(fc, fcSummary(fc), fcEv, [
      a.wpm != null && a.wpm < 110 ? 'Build speed with the 4-3-2 exercise: the same talk in less time, three times.' : 'Keep your pace steady; do not speed up when unsure.',
      conn.length < 5 ? 'Widen your linking language beyond "and", "but" and "because".' : 'Use linking language to signal contrast and consequence, not only sequence.',
      'Extend answers with a reason and a specific example before the examiner has to ask.',
    ]),
    lr: mk(lr, lrSummary(lr), lrEv, [
      over.length ? `Find alternatives for ${over.slice(0, 3).map((o) => `"${o.word}"`).join(', ')}.` : 'Paraphrase the question instead of repeating its key words.',
      'Learn vocabulary as collocations (verb + noun, adjective + noun) and use each one aloud the same day.',
    ]),
    gra: mk(gra, graSummary(gra), graEv, [
      structs.length < 4 ? 'Bring in conditionals, relative clauses and perfect forms where they fit naturally.' : 'Keep the range you have and aim for more error-free complex sentences.',
      hits.length ? 'Review the corrections below and re-record those answers.' : 'Record yourself and check verb endings and articles, which recognition often hides.',
    ]),
    pron: mk(pron, a.confidence == null && a.pitchSdSt == null ? 'Not assessed in this session.' : 'Provisional estimate from signal measurements only.', prEv, [
      a.pitchSdSt != null && a.pitchSdSt < 2 ? 'Practise stressing the key word in each phrase so your pitch moves more.' : 'Listen back to your recordings and mark where your voice rises and falls.',
      'Shadow short clips of clear speakers: play a sentence, then repeat it matching rhythm and stress.',
    ]),
  };

  const overall = overallFrom(criteria);
  const improved = stockModels(turns, cueCard);

  return {
    source: 'demo',
    overall,
    criteria,
    examinerNote: limited
      ? 'There were too few words in this session for a dependable estimate. Treat every figure below as indicative only.'
      : `This is a rule-based estimate from measurable features of your speech, not an examiner’s judgement. Against a target of ${target}, the largest measured gap is in ${lowest(criteria)}.`,
    corrections: hits,
    vocabulary: { strong: rare.slice(0, 12), overused: over, upgrades: [] },
    fluencyNote:
      a.wpm != null
        ? `You spoke for ${Math.round(a.timedMs / 1000)} seconds in total at ${a.wpm} words per minute${a.pauses != null ? `, with ${a.pauses} pauses of a second or more` : ''}.`
        : 'Timing data was not available for this session.',
    pronunciationNote: pronNote,
    improved,
    plan: buildPlan(criteria, target, overall),
    limitedEvidence: limited,
  };
}

const fcSummary = (b: number) =>
  b >= 7 ? 'Measured pace and pausing are consistent with speaking at length without noticeable effort.'
  : b === 6 ? 'You keep going, but pace, pausing or linking suggest some loss of flow.'
  : 'Pace and pausing suggest frequent hesitation or short, simple answers.';
const lrSummary = (b: number) =>
  b >= 7 ? 'Measured variety suggests a flexible vocabulary with some less common items.'
  : b === 6 ? 'Enough range to discuss topics, with noticeable repetition.'
  : 'Vocabulary appears limited or repetitive on these measures.';
const graSummary = (b: number) =>
  b >= 7 ? 'A range of complex structures was detected with few rule-based errors.'
  : b === 6 ? 'A mix of simple and complex structures was detected.'
  : 'Mostly simple structures were detected, or errors were frequent.';

function lowest(c: Record<Criterion, CriterionResult>): string {
  const names: Record<Criterion, string> = { fc: 'fluency and coherence', lr: 'vocabulary', gra: 'grammar', pron: 'pronunciation' };
  return names[[...CRITERIA].sort((x, y) => c[x].band - c[y].band)[0]];
}

function stockModels(turns: Turn[], cueCard?: CueCard): ImprovedAnswer[] {
  const out: ImprovedAnswer[] = [];
  const cand = turns.filter((t) => t.role === 'candidate' && t.question);
  const why = 'A stock Band 8+ model for this question, not a rewrite of your answer. Connect the AI examiner for personalised rewrites.';
  for (const t of cand) {
    if (out.length >= 3) break;
    const p1 = PART1.find((p) => p.questions[0] === t.question);
    if (p1?.model) out.push({ question: t.question!, original: t.text, improved: p1.model, why, isModel: true });
    else if (t.longTurn && cueCard?.model) out.push({ question: cueCard.prompt, original: t.text, improved: cueCard.model, why, isModel: true });
    else if (cueCard && cueCard.part3[0] === t.question && PART3_MODELS[cueCard.id])
      out.push({ question: t.question!, original: t.text, improved: PART3_MODELS[cueCard.id], why, isModel: true });
  }
  return out;
}

export function buildPlan(criteria: Record<Criterion, CriterionResult>, target: TargetBand, overall: number): PlanItem[] {
  const order = [...CRITERIA].sort((x, y) => criteria[x].band - criteria[y].band);
  const lib: Record<Criterion, PlanItem> = {
    fc: { title: 'Fluency: 10 minutes a day of timed talks', detail: 'Do the 4-3-2 exercise on one prompt, then the no-long-pauses drill. Aim to cut pauses of 2.5 seconds or more to zero.', link: '/practice/fluency' },
    lr: { title: 'Vocabulary: one topic set a day, used aloud', detail: 'Work through a topic set, save the items you did not know, and use each in a spoken sentence before moving on.', link: '/practice/vocab' },
    gra: { title: 'Grammar: re-record your corrected sentences', detail: 'Take each correction from this report, say the corrected version three times, then answer the original question again.', link: '/practice/part3' },
    pron: { title: 'Pronunciation: listen back and shadow', detail: 'Play your long-turn recording, note three places where your voice is flat or unclear, and re-record just those sentences.', link: '/practice/part2' },
  };
  const plan = order.slice(0, 2).map((c) => lib[c]);
  const gap = target - overall;
  plan.push(
    gap <= 0
      ? { title: 'Hold your level under test conditions', detail: 'Your estimate meets your target. Sit one full mock test a week to confirm it is repeatable, and consider raising the target.', link: '/exam' }
      : { title: `Close the ${gap.toFixed(1)}-band gap to ${target}`, detail: `Sit a full mock test every ${gap >= 1.5 ? 'week' : 'five days'} and compare criterion by criterion. Expect roughly half a band of movement to take several weeks of regular practice.`, link: '/exam' },
  );
  return plan;
}

/** Validate and tidy whatever the language model returned so the UI never renders junk. */
export function normalizeReport(raw: unknown, turns: Turn[], target: TargetBand): Report {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const str = (v: unknown, max = 900) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (v: unknown, n = 6) => (Array.isArray(v) ? v.map((x) => str(x, 400)).filter(Boolean).slice(0, n) : []);
  const criteria = {} as Record<Criterion, CriterionResult>;
  for (const c of CRITERIA) {
    const src = (r.criteria && r.criteria[c]) || {};
    const band = Number(src.band);
    if (!Number.isFinite(band)) throw new Error('The assessment response was missing a band score.');
    criteria[c] = {
      band: clamp(Math.round(band), 0, 9),
      summary: str(src.summary),
      evidence: list(src.evidence),
      toImprove: list(src.toImprove, 4),
    };
  }
  const overall = overallFrom(criteria);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const plan: PlanItem[] = arr(r.plan).map((p: any) => ({ title: str(p?.title, 120), detail: str(p?.detail, 500) })).filter((p) => p.title).slice(0, 5);
  return {
    source: 'ai',
    overall,
    criteria,
    examinerNote: str(r.examinerNote),
    corrections: arr(r.corrections)
      .map((c: any) => ({ original: str(c?.original, 300), corrected: str(c?.corrected, 300), explanation: str(c?.explanation, 300) }))
      .filter((c) => c.original && c.corrected)
      .slice(0, 12),
    vocabulary: {
      strong: list(r.vocabulary?.strong, 12),
      overused: arr(r.vocabulary?.overused).map((o: any) => ({ word: str(o?.word, 40), count: Number(o?.count) || 0 })).filter((o) => o.word).slice(0, 8),
      upgrades: arr(r.vocabulary?.upgrades).map((u: any) => ({ from: str(u?.from, 80), to: str(u?.to, 80), note: str(u?.note, 240) })).filter((u) => u.from && u.to).slice(0, 8),
    },
    fluencyNote: str(r.fluencyNote),
    pronunciationNote:
      (str(r.pronunciationNote) ? str(r.pronunciationNote) + ' ' : '') +
      'Provisional: the assessor read your transcript and signal measurements (pitch movement, pausing, recognition confidence); it did not listen to individual sounds.',
    improved: arr(r.improved)
      .map((i: any) => ({ question: str(i?.question, 300), original: str(i?.original, 1500), improved: str(i?.improved, 2500), why: str(i?.why, 500) }))
      .filter((i) => i.improved)
      .slice(0, 3),
    plan: plan.length ? plan : buildPlan(criteria, target, overall),
    limitedEvidence: aggregate(turns).words < 80,
  };
}

export const cardById = (id?: string) => CUE_CARDS.find((c) => c.id === id);
