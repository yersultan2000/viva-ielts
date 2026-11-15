import { api } from './api';
import { aggregate, demoReport, normalizeReport } from './scoring';
import type { CueCard, Report, TargetBand, Turn } from './types';

/** Send a session to the AI assessor. Throws with a readable message if it fails. */
export async function assessWithAI(url: string, turns: Turn[], target: TargetBand): Promise<Report> {
  const answers = turns
    .filter((t) => t.role === 'candidate')
    .map((t) => ({ part: t.part || 1, question: t.question || '', answer: t.text, longTurn: !!t.longTurn, typed: !!t.typed, metrics: t.metrics }));
  const { text: _text, ...measurements } = aggregate(turns);
  const raw = await api.assess(url, { target, answers, measurements });
  return normalizeReport(raw, turns, target);
}

/** AI assessment when available, otherwise (or on failure) the labelled rule-based estimate. */
export async function assess(mode: 'ai' | 'demo', url: string, turns: Turn[], target: TargetBand, cueCard?: CueCard): Promise<{ report: Report; aiError?: string }> {
  if (mode === 'ai') {
    try {
      return { report: await assessWithAI(url, turns, target) };
    } catch (e) {
      const aiError = e instanceof Error ? e.message : 'The AI assessment failed.';
      const report = demoReport(turns, target, cueCard);
      report.examinerNote = `The AI assessment did not complete (${aiError}) Showing the rule-based estimate instead; you can retry the AI assessment from this page. ${report.examinerNote}`;
      return { report, aiError };
    }
  }
  return { report: demoReport(turns, target, cueCard) };
}
