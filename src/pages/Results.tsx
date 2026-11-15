import { useState } from 'react';
import { PageHead } from '../components/Shell';
import { BandRuler } from '../components/charts';
import { Button, Clip, Empty, Notice, download, fmtBand, fmtDate } from '../components/ui';
import { useBackend } from '../lib/api';
import { assessWithAI } from '../lib/assess';
import { reportMarkdown } from '../lib/report';
import { aggregate } from '../lib/scoring';
import { uid, update, useStore } from '../lib/store';
import { CRITERIA, CRITERION_NAME } from '../lib/types';
import type { Criterion, CriterionResult, Report } from '../lib/types';

export function addVocab(term: string, meaning = '', example = '', topic = '') {
  update((s) =>
    s.vocab.some((v) => v.term.toLowerCase() === term.toLowerCase())
      ? s
      : { ...s, vocab: [{ id: uid(), term, meaning, example, topic, addedAt: Date.now() }, ...s.vocab] },
  );
}
export function saveQuestion(text: string, part: 1 | 2 | 3) {
  update((s) => (s.saved.some((q) => q.text === text) ? s : { ...s, saved: [{ id: uid(), text, part, addedAt: Date.now() }, ...s.saved] }));
}

export function CriterionBlock({ c, r, target }: { c: Criterion; r: CriterionResult; target: number }) {
  const gap = target - r.band;
  return (
    <section className="criterion">
      <div className="criterion-head">
        <div>
          <h3 className="h3">{CRITERION_NAME[c]}</h3>
          {c === 'pron' ? <span className="tag tag-warn">Provisional</span> : null}
        </div>
        <div className="criterion-band">
          <span className="num">{r.band}</span>
          <span className={`gap ${gap <= 0 ? 'met' : ''}`}>{gap <= 0 ? 'At or above target' : `${fmtBand(gap)} below target`}</span>
        </div>
      </div>
      <BandRuler value={r.band} target={target} label={CRITERION_NAME[c]} compact />
      {r.summary ? <p>{r.summary}</p> : null}
      <div className="criterion-cols">
        <div>
          <h4 className="label">Evidence</h4>
          <ul className="evidence">{r.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
        <div>
          <h4 className="label">To improve</h4>
          <ul className="evidence">{r.toImprove.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}

export function OverallBlock({ report, target }: { report: Report; target: number }) {
  return (
    <div className="overall">
      <div className="overall-band">
        <span className="label">Estimated overall band</span>
        <span className="overall-num num">{fmtBand(report.overall)}</span>
        <span className="muted small">Target {fmtBand(target)}</span>
      </div>
      <div className="overall-main">
        <BandRuler value={report.overall} target={target} label="Overall" />
        <table className="mini-table">
          <thead><tr><th scope="col">Criterion</th><th scope="col">Estimate</th><th scope="col">Target</th><th scope="col">Gap</th></tr></thead>
          <tbody>
            {CRITERIA.map((c) => {
              const gap = target - report.criteria[c].band;
              return (
                <tr key={c}>
                  <th scope="row">{CRITERION_NAME[c]}{c === 'pron' ? ' *' : ''}</th>
                  <td className="num">{report.criteria[c].band}</td>
                  <td className="num">{fmtBand(target)}</td>
                  <td className={`num ${gap <= 0 ? 'met' : 'short'}`}>{gap <= 0 ? 'Met' : `−${fmtBand(gap)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted small">Overall is the mean of the four criteria, rounded down to the nearest half band. * Pronunciation is provisional.</p>
      </div>
    </div>
  );
}

export function Results({ id }: { id: string }) {
  const store = useStore();
  const backend = useBackend();
  const exam = store.exams.find((e) => e.id === id);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [added, setAdded] = useState<Record<string, boolean>>({});

  if (!exam)
    return (
      <div className="page">
        <Empty title="Report not found" action={<Button variant="primary" href="/dashboard">Go to dashboard</Button>}>
          This report is not stored on this device. Reports are saved in your browser, so they do not follow you between devices.
        </Empty>
      </div>
    );

  const r = exam.report;
  const a = aggregate(exam.turns);
  const answers = exam.turns.filter((t) => t.role === 'candidate');
  const mark = (k: string) => setAdded((x) => ({ ...x, [k]: true }));

  const reassess = async () => {
    setBusy(true); setErr('');
    try {
      const report = await assessWithAI(backend.url, exam.turns, exam.target);
      update((s) => ({ ...s, exams: s.exams.map((e) => (e.id === exam.id ? { ...e, report, mode: 'ai' } : e)) }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The AI assessment failed.');
    }
    setBusy(false);
  };

  const stat = (label: string, value: string | number | null, note?: string) => (
    <div className="stat">
      <span className="label">{label}</span>
      <span className="stat-num num">{value ?? '—'}</span>
      {note ? <span className="muted small">{note}</span> : null}
    </div>
  );

  return (
    <div className="page report">
      <PageHead
        title="Speaking test report"
        sub={<>{fmtDate(exam.startedAt)}, {Math.max(1, Math.round(exam.durationSec / 60))} minutes, {answers.length} answers. <span className={`tag ${r.source === 'ai' ? 'tag-ok' : 'tag-warn'}`}>{r.source === 'ai' ? 'AI assessed' : 'Rule-based estimate'}</span></>}
        actions={
          <span className="no-print row wrap">
            <Button icon="printer" onClick={() => window.print()}>Print or save as PDF</Button>
            <Button icon="download" onClick={() => download(`viva-report-${new Date(exam.startedAt).toISOString().slice(0, 10)}.md`, reportMarkdown(exam), 'text/markdown')}>Markdown</Button>
            <Button icon="download" onClick={() => download(`viva-report-${exam.id.slice(0, 8)}.json`, JSON.stringify(exam, null, 2), 'application/json')}>JSON</Button>
          </span>
        }
      />

      {r.source === 'demo' ? (
        <Notice kind="warn" title="This is a rule-based estimate, not an AI or examiner assessment"
          action={backend.mode === 'ai' ? <Button size="sm" variant="primary" busy={busy} onClick={reassess}>Assess with AI</Button> : undefined}>
          Bands here come from measurable features of your speech (pace, pauses, word variety, structures) and are capped between 4 and 8. They cannot judge meaning or accuracy in context. {backend.mode !== 'ai' ? <a href="#/settings">Connect the AI examiner</a> : null}
        </Notice>
      ) : null}
      {err ? <Notice kind="error" title="AI assessment failed">{err}</Notice> : null}
      {r.limitedEvidence ? <Notice kind="warn">You said fewer than 80 words in this session. That is too little evidence for a dependable band, so treat this report as indicative.</Notice> : null}

      <OverallBlock report={r} target={exam.target} />
      {r.examinerNote ? <p className="examiner-note serif">{r.examinerNote}</p> : null}

      <h2 className="h2">The four criteria</h2>
      <div className="criteria">
        {CRITERIA.map((c) => <CriterionBlock key={c} c={c} r={r.criteria[c]} target={exam.target} />)}
      </div>

      <h2 className="h2">Fluency analysis</h2>
      <div className="stats">
        {stat('Speech rate', a.wpm, 'words per minute')}
        {stat('Pauses, 1s or more', a.pauses, a.pausesPerMin != null ? `${a.pausesPerMin} per minute` : 'not measured')}
        {stat('Long pauses, 2.5s+', a.longPauses, a.longestPauseMs ? `longest ${(a.longestPauseMs / 1000).toFixed(1)}s` : undefined)}
        {stat('Fillers recognised', a.fillers, `${a.fillersPer100} per 100 words`)}
        {stat('Words spoken', a.words, `${Math.round(a.timedMs / 1000)}s of speech`)}
      </div>
      {r.fluencyNote ? <p>{r.fluencyNote}</p> : null}

      <h2 className="h2">Pronunciation analysis <span className="tag tag-warn">Provisional</span></h2>
      <div className="stats">
        {stat('Pitch variation', a.pitchSdSt, 'semitones, standard deviation')}
        {stat('Pitch range', a.pitchRangeSt, 'semitones, typical')}
        {stat('Recognition confidence', a.confidence != null ? `${Math.round(a.confidence * 100)}%` : null, 'proxy for intelligibility')}
      </div>
      <p>{r.pronunciationNote}</p>

      <h2 className="h2">Grammar corrections</h2>
      {r.corrections.length ? (
        <ul className="corrections">
          {r.corrections.map((c, i) => (
            <li key={i}>
              <p className="serif"><del>{c.original}</del></p>
              <p className="serif"><ins>{c.corrected}</ins></p>
              <p className="muted small">{c.explanation}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{r.source === 'ai' ? 'The assessor did not single out any errors to correct.' : 'The rule-based check found none of the common errors it looks for. It covers a limited set of patterns.'}</p>
      )}

      <h2 className="h2">Vocabulary analysis</h2>
      <div className="vocab-cols">
        <div>
          <h3 className="label">{r.source === 'ai' ? 'Used well' : 'Less common words you used'}</h3>
          {r.vocabulary.strong.length ? <p className="chips">{r.vocabulary.strong.map((w) => <span key={w} className="chip">{w}</span>)}</p> : <p className="muted small">None identified.</p>}
        </div>
        <div>
          <h3 className="label">Overused</h3>
          {r.vocabulary.overused.length ? <p className="chips">{r.vocabulary.overused.map((w) => <span key={w.word} className="chip">{w.word} <b>{'×'}{w.count}</b></span>)}</p> : <p className="muted small">No content word was repeated heavily.</p>}
        </div>
      </div>
      {r.vocabulary.upgrades.length ? (
        <ul className="rule-list">
          {r.vocabulary.upgrades.map((u) => (
            <li key={u.from + u.to} className="spread">
              <div><span className="serif"><del>{u.from}</del> {'→'} <strong>{u.to}</strong></span><p className="muted small">{u.note}</p></div>
              <span className="no-print"><Button size="sm" icon={added[u.to] ? 'check' : 'plus'} disabled={added[u.to]} onClick={() => { addVocab(u.to, u.note, '', 'From my reports'); mark(u.to); }}>{added[u.to] ? 'Saved' : 'Save'}</Button></span>
            </li>
          ))}
        </ul>
      ) : r.source === 'demo' ? <p className="muted small">Suggested upgrades need the AI examiner.</p> : null}

      <h2 className="h2">{r.improved.some((i) => !i.isModel) ? 'Three improved answers' : 'Band 8+ model answers'}</h2>
      {r.improved.length ? r.improved.map((im, i) => (
        <article key={i} className="improved">
          <h3 className="h3">{im.question}</h3>
          <div className="improved-cols">
            <div><span className="label">Your answer</span><p className="serif">{im.original || 'No answer recorded.'}</p></div>
            <div><span className="label">{im.isModel ? 'Model answer' : `Rewritten for band ${fmtBand(exam.target)}`}</span><p className="serif">{im.improved}</p></div>
          </div>
          <p className="muted small">{im.why}</p>
        </article>
      )) : <p className="muted">No model answers are stored for the questions in this test. Connect the AI examiner for personalised rewrites.</p>}

      <h2 className="h2">Your improvement plan</h2>
      <ol className="plan">
        {r.plan.map((p, i) => (
          <li key={i}>
            <strong>{p.title}</strong>
            <p>{p.detail}</p>
            {p.link ? <a className="no-print" href={`#${p.link}`}>Open this practice</a> : null}
          </li>
        ))}
      </ol>

      <h2 className="h2">Transcript and recordings</h2>
      {exam.cueCard ? <p className="muted small">Part 2 card: {exam.cueCard.prompt}</p> : null}
      <div className="transcript">
        {exam.turns.map((t) => (
          <div key={t.id} className={`turn turn-${t.role}`}>
            <span className="turn-who">{t.role === 'examiner' ? 'Examiner' : 'You'}{t.part ? `, Part ${t.part}` : ''}</span>
            <p className={t.role === 'candidate' ? 'serif' : ''}>{t.text || <em className="muted">No answer recorded</em>}</p>
            {t.role === 'candidate' ? (
              <div className="turn-tools no-print">
                {t.hasAudio ? <Clip id={t.id} /> : null}
                {t.metrics?.wpm ? <span className="muted small">{t.metrics.wpm} wpm{t.metrics.pauses ? `, ${t.metrics.pauses} pauses` : ''}</span> : null}
                {t.typed ? <span className="tag">Typed</span> : null}
                {t.question && t.part ? (
                  <>
                    <a className="small" href={t.longTurn && exam.cueCard ? `#/practice/part2?card=${exam.cueCard.id}` : `#/practice/part${t.part === 2 ? 1 : t.part}?q=${encodeURIComponent(t.question.replace(/ \(follow-up.*$/, ''))}`}>Answer again</a>
                    <button className="link small" disabled={added[t.id]} onClick={() => { saveQuestion(t.longTurn && exam.cueCard ? exam.cueCard.prompt : t.question!.replace(/ \(follow-up.*$/, ''), t.part as 1 | 2 | 3); mark(t.id); }}>{added[t.id] ? 'Saved' : 'Save question'}</button>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <p className="disclaimer muted small">Viva is an independent practice tool and is not affiliated with or endorsed by IELTS, the British Council, IDP or Cambridge. Band estimates are for practice only and are not official results.</p>
    </div>
  );
}
