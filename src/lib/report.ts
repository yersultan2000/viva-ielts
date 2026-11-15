import { aggregate } from './scoring';
import { CRITERIA, CRITERION_NAME } from './types';
import type { ExamRecord } from './types';

/** A plain-text (Markdown) version of a report for sharing with a teacher or keeping offline. */
export function reportMarkdown(e: ExamRecord): string {
  const r = e.report;
  const a = aggregate(e.turns);
  const L: string[] = [];
  L.push(`# IELTS Speaking mock test report`, '');
  L.push(`Date: ${new Date(e.startedAt).toLocaleString()}  `);
  L.push(`Length: ${Math.round(e.durationSec / 60)} min  `);
  L.push(`Assessment: ${r.source === 'ai' ? 'AI examiner' : 'Rule-based estimate (demo mode)'}  `);
  L.push(`Target band: ${e.target.toFixed(1)}`, '');
  L.push(`## Estimated overall band: ${r.overall.toFixed(1)}`, '', r.examinerNote, '');
  L.push('This is a practice estimate, not an official IELTS result. Pronunciation is provisional.', '');
  for (const c of CRITERIA) {
    const cr = r.criteria[c];
    L.push(`## ${CRITERION_NAME[c]}: ${cr.band}${c === 'pron' ? ' (provisional)' : ''}`, '', cr.summary, '', 'Evidence:');
    cr.evidence.forEach((x) => L.push(`- ${x}`));
    L.push('', 'To improve:');
    cr.toImprove.forEach((x) => L.push(`- ${x}`));
    L.push('');
  }
  L.push('## Measurements', '');
  L.push(`- Words spoken: ${a.words}`, `- Speech rate: ${a.wpm ?? 'not measured'} wpm`, `- Pauses of 1s or more: ${a.pauses ?? 'not measured'}`, `- Pauses of 2.5s or more: ${a.longPauses ?? 'not measured'}`, `- Fillers recognised: ${a.fillers}`, `- Pitch variation: ${a.pitchSdSt ?? 'not measured'} semitones (SD)`, '');
  if (r.corrections.length) {
    L.push('## Grammar corrections', '');
    r.corrections.forEach((c) => L.push(`- "${c.original}" -> "${c.corrected}" (${c.explanation})`));
    L.push('');
  }
  if (r.vocabulary.upgrades.length || r.vocabulary.overused.length) {
    L.push('## Vocabulary', '');
    r.vocabulary.overused.forEach((o) => L.push(`- Overused: ${o.word} (x${o.count})`));
    r.vocabulary.upgrades.forEach((u) => L.push(`- Instead of "${u.from}", try "${u.to}". ${u.note}`));
    L.push('');
  }
  if (r.improved.length) {
    L.push('## Improved answers', '');
    r.improved.forEach((i) => L.push(`**${i.question}**`, '', `Your answer: ${i.original || '(none)'}`, '', `${i.isModel ? 'Model answer' : 'Improved'}: ${i.improved}`, '', `_${i.why}_`, ''));
  }
  L.push('## Improvement plan', '');
  r.plan.forEach((p, i) => L.push(`${i + 1}. **${p.title}** ${p.detail}`));
  L.push('', '## Transcript', '');
  e.turns.forEach((t) => L.push(`**${t.role === 'examiner' ? 'Examiner' : 'Candidate'}:** ${t.text || '(no answer recorded)'}`, ''));
  return L.join('\n');
}
