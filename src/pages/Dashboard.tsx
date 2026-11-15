import { PageHead } from '../components/Shell';
import { BandRuler, TrendChart, WeekBars } from '../components/charts';
import { Button, Empty, fmtBand, fmtDate } from '../components/ui';
import { dailyChallenge } from '../lib/bank';
import { dayKey, update, useStore } from '../lib/store';
import { CRITERIA, CRITERION_NAME, CRITERION_SHORT } from '../lib/types';
import type { Criterion, ExamRecord } from '../lib/types';

function streak(done: Record<string, boolean>): number {
  let n = 0;
  const d = new Date();
  if (!done[dayKey(d)]) d.setDate(d.getDate() - 1);
  while (done[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function weekly(practice: { at: number; seconds: number }[]) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  return Array.from({ length: 8 }, (_, i) => {
    const from = new Date(start); from.setDate(from.getDate() - (7 - i) * 7);
    const to = new Date(from); to.setDate(to.getDate() + 7);
    const secs = practice.filter((p) => p.at >= +from && p.at < +to).reduce((s, p) => s + p.seconds, 0);
    return { label: i === 7 ? 'This wk' : from.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), minutes: Math.round(secs / 60) };
  });
}

/** What keeps coming up across the candidate's recent tests. */
function weaknesses(exams: ExamRecord[]) {
  const recent = exams.slice(0, 5);
  const lowest: Record<Criterion, number> = { fc: 0, lr: 0, gra: 0, pron: 0 };
  const words = new Map<string, number>();
  const rules = new Map<string, number>();
  for (const e of recent) {
    const min = Math.min(...CRITERIA.map((c) => e.report.criteria[c].band));
    CRITERIA.forEach((c) => { if (e.report.criteria[c].band === min) lowest[c]++; });
    e.report.vocabulary.overused.forEach((o) => words.set(o.word, (words.get(o.word) || 0) + 1));
    e.report.corrections.forEach((c) => rules.set(c.explanation, (rules.get(c.explanation) || 0) + 1));
  }
  const top = <T,>(m: Map<T, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return { n: recent.length, lowest: CRITERIA.filter((c) => lowest[c] > 0).sort((a, b) => lowest[b] - lowest[a]).map((c) => ({ c, times: lowest[c] })), words: top(words), rules: top(rules) };
}

export function Dashboard() {
  const s = useStore();
  const { exams, settings } = s;
  const latest = exams[0];
  const today = dayKey();
  const challenge = dailyChallenge(today);
  const doneToday = !!s.challenges[today];
  const run = streak(s.challenges);
  const hour = new Date().getHours();
  const greeting = `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}${settings.name ? `, ${settings.name}` : ''}`;
  const weeks = weekly(s.practice);
  const w = weaknesses(exams);
  const chrono = [...exams].reverse();
  const avg = (c: Criterion) => exams.slice(0, 5).reduce((t, e) => t + e.report.criteria[c].band, 0) / Math.min(5, exams.length);

  const challengeBlock = (
    <section className="panel challenge">
      <div className="spread">
        <h2 className="h3">Today{'\u2019'}s speaking challenge</h2>
        <span className="tag">{run > 0 ? `${run}-day streak` : 'No streak yet'}</span>
      </div>
      <p className="serif challenge-q">{challenge.text}</p>
      <p className="muted small">Part {challenge.part}, about {challenge.seconds >= 60 ? `${challenge.seconds / 60} minute${challenge.seconds > 60 ? 's' : ''}` : `${challenge.seconds} seconds`}.</p>
      {doneToday ? <span className="tag tag-ok">Done today</span> : <Button variant="primary" href="/practice/challenge" icon="mic">Answer it</Button>}
    </section>
  );

  if (!latest)
    return (
      <div className="page">
        <PageHead title={greeting} sub="Your band estimates, history and progress will build up here." />
        <div className="grid-2">
          <Empty title="No mock tests yet" action={<Button variant="primary" href="/exam" icon="mic">Take your first mock test</Button>}>
            A full test takes about 13 minutes. A short one takes about 7. You will get a band estimate for each of the four criteria with the evidence behind it.
          </Empty>
          {challengeBlock}
        </div>
        <section className="section">
          <h2 className="h2">Practice this week</h2>
          <WeekBars weeks={weeks} />
          <p className="muted small">Minutes of speaking per week, from mock tests and practice sessions on this device.</p>
        </section>
      </div>
    );

  const r = latest.report;
  return (
    <div className="page">
      <PageHead
        title={greeting}
        sub={<>Target band {fmtBand(settings.target)}. <a href="#/settings">Change</a></>}
        actions={<Button variant="primary" href="/exam" icon="mic">New mock test</Button>}
      />

      <div className="dash-top">
        <section className="latest">
          <span className="label">Latest estimate, {fmtDate(latest.startedAt)}</span>
          <div className="latest-row">
            <span className="overall-num num">{fmtBand(r.overall)}</span>
            <div className="latest-meta">
              <span className={`tag ${r.source === 'ai' ? 'tag-ok' : 'tag-warn'}`}>{r.source === 'ai' ? 'AI assessed' : 'Rule-based estimate'}</span>
              <span className="muted small">{settings.target - r.overall <= 0 ? 'At or above your target' : `${fmtBand(settings.target - r.overall)} below your target`}</span>
            </div>
          </div>
          <BandRuler value={r.overall} target={settings.target} label="Latest overall" />
          <a href={`#/results/${latest.id}`}>Open the full report</a>
        </section>
        {challengeBlock}
      </div>

      <section className="section">
        <h2 className="h2">Progress</h2>
        <TrendChart points={chrono.map((e) => ({ label: new Date(e.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), value: e.report.overall }))} target={settings.target} />
        {exams.length < 2 ? <p className="muted small">One test so far. A trend line appears after your second.</p> : null}
      </section>

      <section className="section">
        <h2 className="h2">Criterion performance</h2>
        <div className="crit-grid">
          {CRITERIA.map((c) => (
            <div key={c} className="crit-row">
              <div className="spread">
                <span className="crit-name">{CRITERION_NAME[c]}{c === 'pron' ? <span className="muted small"> (provisional)</span> : null}</span>
                <span><span className="num crit-band">{r.criteria[c].band}</span>{exams.length > 1 ? <span className="muted small"> avg {avg(c).toFixed(1)}</span> : null}</span>
              </div>
              <BandRuler value={r.criteria[c].band} target={settings.target} label={CRITERION_NAME[c]} compact />
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="section">
          <h2 className="h2">Weakness tracker</h2>
          <p className="muted small">Across your last {w.n} test{w.n > 1 ? 's' : ''}.</p>
          <ul className="rule-list">
            {w.lowest.slice(0, 2).map(({ c, times }) => (
              <li key={c}><strong>{CRITERION_SHORT[c]}</strong> was your lowest or joint-lowest criterion in {times} of {w.n}.</li>
            ))}
            {w.words.length ? <li>Words you lean on: {w.words.map(([word, n]) => `${word} (${n} test${n > 1 ? 's' : ''})`).join(', ')}.</li> : null}
            {w.rules.map(([rule, n]) => <li key={rule}>{rule} <span className="muted small">Seen in {n} test{n > 1 ? 's' : ''}.</span></li>)}
          </ul>
        </section>
        <section className="section">
          <h2 className="h2">Recommended next steps</h2>
          <ol className="plan">
            {r.plan.map((p, i) => (
              <li key={i}><strong>{p.title}</strong><p>{p.detail}</p>{p.link ? <a href={`#${p.link}`}>Open this practice</a> : null}</li>
            ))}
          </ol>
        </section>
      </div>

      <section className="section">
        <h2 className="h2">Practice by week</h2>
        <WeekBars weeks={weeks} />
        <p className="muted small">Minutes of speaking per week, from mock tests and practice sessions on this device.</p>
      </section>

      <section className="section">
        <h2 className="h2">Test history</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th scope="col">Date</th><th scope="col">Length</th><th scope="col">Overall</th>{CRITERIA.map((c) => <th scope="col" key={c}>{CRITERION_SHORT[c]}</th>)}<th scope="col">Assessed by</th><th scope="col"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id}>
                  <th scope="row"><a href={`#/results/${e.id}`}>{fmtDate(e.startedAt)}</a></th>
                  <td>{Math.max(1, Math.round(e.durationSec / 60))} min</td>
                  <td className="num strong">{fmtBand(e.report.overall)}</td>
                  {CRITERIA.map((c) => <td className="num" key={c}>{e.report.criteria[c].band}</td>)}
                  <td>{e.report.source === 'ai' ? 'AI' : 'Rules'}</td>
                  <td><Button size="sm" variant="quiet" icon="trash" label={`Delete test from ${fmtDate(e.startedAt)}`} onClick={() => { if (window.confirm('Delete this test and its report?')) update((st) => ({ ...st, exams: st.exams.filter((x) => x.id !== e.id) })); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
