import { useEffect, useMemo, useRef, useState } from 'react';
import { CueCardView } from '../components/CueCardView';
import { PageHead } from '../components/Shell';
import { Waveform } from '../components/charts';
import { Button, Clip, Empty, Notice, Segmented, fmtTime } from '../components/ui';
import { api, useBackend } from '../lib/api';
import { assessWithAI } from '../lib/assess';
import { CUE_CARDS, FLUENCY_PROMPTS, PART1, PART3_MODELS, TOPICS, VOCAB_SETS, dailyChallenge, pick } from '../lib/bank';
import { countFillers, grammarHits, overusedWords, tokens } from '../lib/metrics';
import type { Route } from '../lib/router';
import { go } from '../lib/router';
import { dayKey, uid, update, useStore } from '../lib/store';
import { CRITERIA, CRITERION_NAME } from '../lib/types';
import type { CueCard, Report, Turn } from '../lib/types';
import { useSpeaking } from '../lib/useSpeaking';
import type { Capture } from '../lib/useSpeaking';
import { addVocab, saveQuestion } from './Results';

function logPractice(kind: string, cap: Capture, label: string) {
  const seconds = Math.round((cap.metrics.durationMs || cap.metrics.words * 400) / 1000);
  update((s) => ({ ...s, practice: [{ id: uid(), at: Date.now(), kind, seconds, wpm: cap.metrics.wpm, label }, ...s.practice].slice(0, 400) }));
}

/* ---------- Recorder: one spoken (or typed) answer ---------- */
export function Recorder({ maxSec, onDone, startLabel = 'Start recording' }: { maxSec: number; onDone: (cap: Capture) => void; startLabel?: string }) {
  const { settings } = useStore();
  const sp = useSpeaking(settings.analyseAudio);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ended = useRef(false);
  const [forceType, setForceType] = useState(false);
  const typing = !sp.canRecognise || forceType;

  const begin = async () => {
    ended.current = false;
    if (typing) return sp.start(true);
    if ((await sp.prepare()) === 'failed') return;
    sp.start();
  };
  const end = async () => {
    if (ended.current) return;
    ended.current = true;
    setBusy(true);
    const cap = await sp.stop(typed);
    sp.release();
    setBusy(false);
    onDone(cap);
  };
  useEffect(() => {
    if (sp.status === 'listening' && !typing && sp.elapsedMs >= maxSec * 1000) void end();
  }, [sp.elapsedMs, sp.status]);

  if (sp.status === 'idle')
    return (
      <div className="recorder">
        {sp.error ? <Notice kind="error" title="Microphone problem">{sp.error}</Notice> : null}
        {typing ? <Notice kind="warn">This browser has no speech recognition, so you will type your answer and timing will not be measured.</Notice> : null}
        <Button variant="primary" size="lg" icon={typing ? 'keyboard' : 'mic'} onClick={begin} busy={busy}>{typing ? 'Type an answer' : startLabel}</Button>
        {!typing ? <span className="muted small">Up to {fmtTime(maxSec)}. {sp.transcriptOnly ? 'On phones your answer is transcribed but not recorded, and pauses and pitch are not measured.' : 'Recording stays on this device.'}</span> : null}
      </div>
    );

  const left = Math.max(0, maxSec - sp.elapsedMs / 1000);
  return (
    <div className="recorder live-rec">
      {typing ? (
        <label className="field">
          <span className="label">Your answer</span>
          <textarea className="input" rows={5} autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
      ) : (
        <>
          <div className="spread">
            <span className={`mic-chip ${sp.status === 'listening' ? 'live' : ''}`}><span className="dot" />{sp.status === 'paused' ? 'Paused' : sp.micOn ? 'Recording' : 'Listening'}</span>
            <span className="timer num" role="timer">{fmtTime(sp.elapsedMs / 1000)} <span className="muted">/ {fmtTime(maxSec)}</span></span>
          </div>
          {sp.micOn ? <Waveform getLevel={sp.getLevel} active={sp.status === 'listening'} /> : null}
          <div className="rec-progress"><div style={{ width: `${100 - (left / maxSec) * 100}%` }} /></div>
          <p className="live serif">{sp.text} <span className="interim">{sp.interim}</span>{!sp.text && !sp.interim ? <span className="muted">{sp.elapsedMs > 10000 ? 'Nothing heard yet. Check that your microphone is not muted, then speak.' : 'Your words appear here as you speak.'}</span> : null}</p>
          {!sp.text && !sp.interim && sp.elapsedMs > 10000 ? <Button size="sm" icon="keyboard" onClick={() => setForceType(true)}>Type my answer instead</Button> : null}
        </>
      )}
      <div className="controls">
        {!typing ? <Button icon={sp.status === 'paused' ? 'play' : 'pause'} onClick={sp.status === 'paused' ? sp.resume : sp.pause}>{sp.status === 'paused' ? 'Resume' : 'Pause'}</Button> : null}
        <Button variant="primary" icon="stop" onClick={end} busy={busy}>{typing ? 'Submit answer' : 'Stop'}</Button>
      </div>
    </div>
  );
}

/* ---------- Review of one practice answer ---------- */
function Review({ question, part, cap, model }: { question: string; part: 1 | 2 | 3; cap: Capture; model?: string }) {
  const { settings } = useStore();
  const backend = useBackend();
  const [ai, setAi] = useState<Report | null>(null);
  const [sample, setSample] = useState<{ answer: string; features: string[] } | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const m = cap.metrics;
  const hits = useMemo(() => grammarHits(cap.text), [cap.text]);
  const over = useMemo(() => overusedWords(tokens(cap.text)), [cap.text]);
  const fillers = useMemo(() => countFillers(cap.text), [cap.text]);

  const getFeedback = async () => {
    setBusy('ai'); setErr('');
    const turns: Turn[] = [
      { id: uid(), role: 'examiner', part, text: question, at: Date.now() },
      { id: uid(), role: 'candidate', part, text: cap.text, question, at: Date.now(), metrics: m, typed: cap.typed, longTurn: part === 2 },
    ];
    try { setAi(await assessWithAI(backend.url, turns, settings.target)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The AI feedback failed.'); }
    setBusy('');
  };
  const getSample = async () => {
    setBusy('sample'); setErr('');
    try { setSample(await api.generate<{ answer: string; features: string[] }>(backend.url, { kind: 'sample', part, question })); }
    catch (e) { setErr(e instanceof Error ? e.message : 'The sample answer could not be written.'); }
    setBusy('');
  };

  if (!cap.text)
    return <Notice kind="warn" title="Nothing was recorded">No words were recognised. Check your microphone and try the question again.</Notice>;

  return (
    <div className="review">
      <h3 className="label">Your answer</h3>
      <p className="serif answer-text">{cap.text}</p>
      {cap.blob ? <Clip blob={cap.blob} /> : null}
      <div className="stats">
        <div className="stat"><span className="label">Words</span><span className="stat-num num">{m.words}</span></div>
        <div className="stat"><span className="label">Speech rate</span><span className="stat-num num">{m.wpm ?? '—'}</span><span className="muted small">words per minute</span></div>
        <div className="stat"><span className="label">Pauses, 1s+</span><span className="stat-num num">{m.pauses ?? '—'}</span><span className="muted small">{m.longPauses ? `${m.longPauses} of 2.5s or more` : m.pauses == null ? 'not measured' : 'none over 2.5s'}</span></div>
        <div className="stat"><span className="label">Fillers</span><span className="stat-num num">{fillers.count}</span><span className="muted small">{Object.keys(fillers.byType).join(', ') || 'none recognised'}</span></div>
        <div className="stat"><span className="label">Pitch variation</span><span className="stat-num num">{m.pitchSdSt ?? '—'}</span><span className="muted small">semitones (provisional)</span></div>
      </div>
      {hits.length ? (
        <>
          <h3 className="label">Likely errors (rule-based check)</h3>
          <ul className="corrections">{hits.map((h, i) => <li key={i}><p className="serif"><del>{h.original}</del></p><p className="serif"><ins>{h.corrected}</ins></p><p className="muted small">{h.explanation}</p></li>)}</ul>
        </>
      ) : null}
      {over.length ? <p className="small">Repeated words: {over.map((o) => `${o.word} ×${o.count}`).join(', ')}.</p> : null}

      {err ? <Notice kind="error">{err}</Notice> : null}
      <div className="row wrap">
        {backend.mode === 'ai' && !ai ? <Button variant="primary" busy={busy === 'ai'} onClick={getFeedback}>Get AI feedback</Button> : null}
        {backend.mode === 'ai' && !sample && !model ? <Button busy={busy === 'sample'} onClick={getSample}>Write a Band 8+ sample</Button> : null}
      </div>
      {backend.mode === 'demo' ? <p className="muted small">Demo mode shows measurements only. A band for a single answer needs the AI examiner. <a href="#/settings">Connect it</a></p> : null}

      {ai ? (
        <div className="ai-feedback">
          <h3 className="h3">AI feedback</h3>
          <p className="muted small">One answer is limited evidence, so read these bands as a rough guide. Pronunciation is provisional.</p>
          <ul className="rule-list">
            {CRITERIA.map((c) => (
              <li key={c}>
                <div className="spread"><strong>{CRITERION_NAME[c]}</strong><span className="num crit-band">{ai.criteria[c].band}</span></div>
                <p className="small">{ai.criteria[c].summary}</p>
                <ul className="evidence">{ai.criteria[c].evidence.slice(0, 2).map((e, i) => <li key={i}>{e}</li>)}</ul>
              </li>
            ))}
          </ul>
          {ai.improved[0] ? <><h3 className="label">Your answer, rewritten for band {settings.target.toFixed(1)}</h3><p className="serif">{ai.improved[0].improved}</p><p className="muted small">{ai.improved[0].why}</p></> : null}
        </div>
      ) : null}

      {model || sample ? (
        <div className="model">
          <h3 className="label">Band 8+ {sample ? 'sample answer (AI-written)' : 'model answer'}</h3>
          <p className="serif">{sample?.answer || model}</p>
          {sample?.features?.length ? <ul className="evidence">{sample.features.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- Part 1 / Part 3 / Part 2 question practice ---------- */
interface Q { text: string; model?: string; topic: string }
const P1_QUESTIONS: Q[] = PART1.flatMap((t) => t.questions.map((q, i) => ({ text: q, topic: t.topic, model: i === 0 ? t.model : undefined })));
const P3_QUESTIONS: Q[] = CUE_CARDS.flatMap((c) => c.part3.map((q, i) => ({ text: q, topic: c.part3Theme, model: i === 0 ? PART3_MODELS[c.id] : undefined })));

function QuestionPractice({ part, route, fixed, onComplete }: { part: 1 | 3; route: Route; fixed?: string; onComplete?: () => void }) {
  const backend = useBackend();
  const store = useStore();
  const bank = part === 1 ? P1_QUESTIONS : P3_QUESTIONS;
  const topics = useMemo(() => Array.from(new Set(bank.map((q) => q.topic))), [bank]);
  const [topic, setTopic] = useState('all');
  const fromUrl = fixed || route.query.get('q');
  const [q, setQ] = useState<Q>(() => (fromUrl ? bank.find((b) => b.text === fromUrl) || { text: fromUrl, topic: 'Saved question' } : pick(bank, 1)[0]));
  const [cap, setCap] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  const isSaved = store.saved.some((s) => s.text === q.text);

  const next = () => {
    const pool = topic === 'all' ? bank : bank.filter((b) => b.topic === topic);
    setQ(pick(pool, 1, (b) => b.text === q.text)[0]);
    setCap(null); setN((x) => x + 1);
  };
  const generate = async () => {
    setBusy(true); setErr('');
    try {
      const out = await api.generate<{ questions: string[] }>(backend.url, { kind: 'questions', part, topic: topic === 'all' ? '' : topic, count: 1 });
      if (!out.questions?.[0]) throw new Error('The AI returned no question.');
      setQ({ text: out.questions[0], topic: topic === 'all' ? 'AI-written' : topic });
      setCap(null); setN((x) => x + 1);
    } catch (e) { setErr(e instanceof Error ? e.message : 'A new question could not be written.'); }
    setBusy(false);
  };

  return (
    <div className="practice-q">
      {!fixed ? (
        <div className="row wrap">
          <select className="input input-sm" value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
            <option value="all">All topics</option>
            {topics.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
          <Button icon="shuffle" onClick={next}>Another question</Button>
          {backend.mode === 'ai' ? <Button icon="plus" busy={busy} onClick={generate}>New AI-written question</Button> : null}
        </div>
      ) : null}
      {err ? <Notice kind="error">{err}</Notice> : null}
      <div className="question">
        <span className="label">Part {part}, {q.topic}</span>
        <p className="question-text serif">{q.text}</p>
        <div className="row wrap">
          <Button size="sm" variant="quiet" icon="bookmark" disabled={isSaved} onClick={() => saveQuestion(q.text, part)}>{isSaved ? 'Saved' : 'Save question'}</Button>
          <span className="muted small">{part === 1 ? 'Aim for two to four sentences.' : 'Aim for four to six sentences: opinion, reason, example.'}</span>
        </div>
      </div>
      {cap ? (
        <>
          <Review question={q.text} part={part} cap={cap} model={q.model} />
          <div className="row wrap">
            <Button icon="refresh" onClick={() => { setCap(null); setN((x) => x + 1); }}>Answer again</Button>
            {!fixed ? <Button variant="primary" icon="right" onClick={next}>Next question</Button> : null}
          </div>
        </>
      ) : (
        <Recorder key={n} maxSec={part === 1 ? 45 : 90} onDone={(c) => { setCap(c); if (c.text) { logPractice(`part${part}`, c, q.text); onComplete?.(); } }} />
      )}
    </div>
  );
}

function CardPractice({ route, fixed, onComplete }: { route: Route; fixed?: CueCard; onComplete?: () => void }) {
  const backend = useBackend();
  const store = useStore();
  const all = useMemo(() => {
    const extra = [...store.bookmarks, ...store.exams.map((e) => e.cueCard).filter((c): c is CueCard => !!c)];
    return [...CUE_CARDS, ...extra.filter((c, i) => !CUE_CARDS.some((b) => b.id === c.id) && extra.findIndex((x) => x.id === c.id) === i)];
  }, [store.bookmarks, store.exams]);
  const [card, setCard] = useState<CueCard>(() => fixed || all.find((c) => c.id === route.query.get('card')) || pick(CUE_CARDS, 1)[0]);
  const [cap, setCap] = useState<Capture | null>(null);
  const [notes, setNotes] = useState('');
  const [prep, setPrep] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [n, setN] = useState(0);
  const marked = store.bookmarks.some((b) => b.id === card.id);

  useEffect(() => {
    if (prep == null || prep <= 0) return;
    const id = setTimeout(() => setPrep((p) => (p == null ? p : p - 1)), 1000);
    return () => clearTimeout(id);
  }, [prep]);

  const change = (c: CueCard) => { setCard(c); setCap(null); setNotes(''); setPrep(null); setN((x) => x + 1); };
  const generate = async () => {
    setBusy(true); setErr('');
    try {
      const out = await api.generate<CueCard>(backend.url, { kind: 'cuecard', topic: pick(TOPICS, 1)[0] });
      if (!out.prompt || !Array.isArray(out.points)) throw new Error('The AI returned an incomplete card.');
      change({ ...out, id: uid(), generated: true, part3: out.part3 || [], roundOff: out.roundOff || '', closing: out.closing || '', part3Theme: out.part3Theme || '', topic: out.topic || 'AI-written' });
    } catch (e) { setErr(e instanceof Error ? e.message : 'A new card could not be written.'); }
    setBusy(false);
  };
  const toggleMark = () => update((s) => ({ ...s, bookmarks: marked ? s.bookmarks.filter((b) => b.id !== card.id) : [card, ...s.bookmarks] }));

  return (
    <div className="practice-q">
      {!fixed ? (
        <div className="row wrap">
          <select className="input input-sm" value={card.id} onChange={(e) => change(all.find((c) => c.id === e.target.value) || card)} aria-label="Cue card">
            {!all.some((c) => c.id === card.id) ? <option value={card.id}>{card.topic}: {card.prompt}</option> : null}
            {all.map((c) => <option key={c.id} value={c.id}>{c.topic}: {c.prompt}</option>)}
          </select>
          <Button icon="shuffle" onClick={() => change(pick(all, 1, (c) => c.id === card.id)[0])}>Random card</Button>
          {backend.mode === 'ai' ? <Button icon="plus" busy={busy} onClick={generate}>New AI-written card</Button> : null}
        </div>
      ) : null}
      {err ? <Notice kind="error">{err}</Notice> : null}
      <div className="p2">
        <CueCardView card={card} footer={<Button size="sm" variant="quiet" icon="bookmark" onClick={toggleMark} pressed={marked}>{marked ? 'Bookmarked' : 'Bookmark card'}</Button>} />
        <div className="p2-side">
          {!cap ? (
            prep == null ? <Button icon="clock" onClick={() => setPrep(60)}>Start one-minute preparation</Button>
            : <div className="countdown" role="timer"><span className="countdown-num">{fmtTime(prep)}</span><span className="muted small">{prep > 0 ? 'to prepare' : 'Preparation over. Start speaking.'}</span></div>
          ) : null}
          <label className="field">
            <span className="label">Your notes</span>
            <textarea className="input notes" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key words only." />
          </label>
        </div>
      </div>
      {cap ? (
        <>
          <Review question={card.prompt} part={2} cap={cap} model={card.model} />
          {cap.metrics.durationMs != null && cap.metrics.durationMs < 60000 && cap.text ? <Notice kind="warn">You spoke for {Math.round(cap.metrics.durationMs / 1000)} seconds. In the test you are expected to keep going for at least a minute, ideally until the examiner stops you at two.</Notice> : null}
          <div className="row wrap">
            <Button icon="refresh" onClick={() => { setCap(null); setPrep(null); setN((x) => x + 1); }}>Speak again</Button>
            {card.part3.length ? <Button href={`/practice/part3?q=${encodeURIComponent(card.part3[0])}`} icon="right">Continue to a Part 3 question</Button> : null}
          </div>
        </>
      ) : (
        <Recorder key={n} maxSec={120} startLabel="Start your long turn" onDone={(c) => { setCap(c); if (c.text) { logPractice('part2', c, card.prompt); onComplete?.(); } }} />
      )}
    </div>
  );
}

/* ---------- Vocabulary ---------- */
function VocabPractice() {
  const store = useStore();
  const [setIx, setSetIx] = useState(0);
  const set = VOCAB_SETS[setIx];
  const order = useMemo(() => pick(set.items, set.items.length), [setIx]);
  const [i, setI] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [cap, setCap] = useState<Capture | null>(null);
  const item = order[i];
  const options = useMemo(() => (item ? pick([item, ...pick(set.items, 3, (x) => x.term === item.term)], 4) : []), [item]);
  const reset = (ix: number) => { setSetIx(ix); setI(0); setChoice(null); setScore(0); setCap(null); };
  const has = (t: string) => store.vocab.some((v) => v.term.toLowerCase() === t.toLowerCase());
  const core = (t: string) => t.replace(/^(to|a|an|the) /, '').toLowerCase();
  const used = cap ? set.items.filter((x) => tokens(cap.text).join(' ').includes(tokens(core(x.term)).join(' '))) : [];

  return (
    <div className="practice-q">
      <Segmented label="Vocabulary topic" value={setIx} onChange={reset} options={VOCAB_SETS.map((s, ix) => ({ value: ix, label: s.topic }))} />
      {item ? (
        <div className="question">
          <span className="label">Question {i + 1} of {order.length}: choose the expression that fits</span>
          <p className="question-text serif">{item.example.replace(item.term, ' _____ ')}</p>
          <div className="options">
            {options.map((o) => (
              <button key={o.term} className={`option ${choice ? (o.term === item.term ? 'right' : o.term === choice ? 'wrong' : '') : ''}`} disabled={!!choice} onClick={() => { setChoice(o.term); if (o.term === item.term) setScore((s) => s + 1); }}>
                {o.term}
              </button>
            ))}
          </div>
          {choice ? (
            <div className="answer-note" role="status">
              <p><strong>{choice === item.term ? 'Correct.' : `Not quite. The answer is “${item.term}”.`}</strong> It means: {item.meaning}.</p>
              <div className="row wrap">
                <Button size="sm" icon={has(item.term) ? 'check' : 'plus'} disabled={has(item.term)} onClick={() => addVocab(item.term, item.meaning, item.example, set.topic)}>{has(item.term) ? 'In your notebook' : 'Save to notebook'}</Button>
                <Button size="sm" variant="primary" icon="right" onClick={() => { setI(i + 1); setChoice(null); }}>{i + 1 < order.length ? 'Next' : 'Finish'}</Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="question">
          <span className="label">Set complete</span>
          <p className="question-text">You chose {score} of {order.length} correctly.</p>
          <p>Now use them. Record 45 seconds about {set.topic.toLowerCase()} and try to include at least three of these expressions:</p>
          <p className="chips">{set.items.map((x) => <span key={x.term} className={`chip ${used.includes(x) ? 'chip-on' : ''}`}>{x.term}</span>)}</p>
          {cap ? (
            <>
              <p className="serif answer-text">{cap.text || 'Nothing was recognised.'}</p>
              <Notice kind={used.length >= 3 ? 'info' : 'warn'}>{used.length ? `Recognised in your answer: ${used.map((u) => u.term).join(', ')}.` : 'None of the expressions were recognised in your answer.'} {used.length >= 3 ? 'Target met.' : 'Try again and aim for three.'}</Notice>
              <div className="row wrap">
                <Button icon="refresh" onClick={() => setCap(null)}>Record again</Button>
                <Button variant="primary" onClick={() => reset((setIx + 1) % VOCAB_SETS.length)}>Next topic</Button>
              </div>
            </>
          ) : <Recorder maxSec={45} onDone={(c) => { setCap(c); if (c.text) logPractice('vocab', c, `Vocabulary: ${set.topic}`); }} />}
        </div>
      )}
    </div>
  );
}

/* ---------- Fluency drills ---------- */
type Drill = 'pauses' | '432' | 'fillers';
const ROUNDS = [60, 45, 30];
function FluencyPractice() {
  const [drill, setDrill] = useState<Drill>('pauses');
  const [prompt, setPrompt] = useState(() => pick(FLUENCY_PROMPTS, 1)[0]);
  const [caps, setCaps] = useState<Capture[]>([]);
  const [n, setN] = useState(0);
  const restart = (d: Drill = drill, newPrompt = true) => { setDrill(d); setCaps([]); setN((x) => x + 1); if (newPrompt) setPrompt(pick(FLUENCY_PROMPTS, 1, (p) => p === prompt)[0]); };
  const done = (c: Capture) => { setCaps((x) => [...x, c]); setN((x) => x + 1); if (c.text) logPractice('fluency', c, `Fluency: ${drill}`); };
  const last = caps[caps.length - 1];
  const finished = drill === '432' ? caps.length >= 3 : caps.length >= 1;
  const fill = last ? countFillers(last.text) : null;

  return (
    <div className="practice-q">
      <Segmented label="Fluency drill" value={drill} onChange={(d) => restart(d)} options={[{ value: 'pauses', label: 'No long pauses' }, { value: '432', label: '60-45-30' }, { value: 'fillers', label: 'Filler watch' }]} />
      <p className="muted">
        {drill === 'pauses' ? 'Speak for 60 seconds without stopping for more than a second. If you run out of ideas, describe, give an example, or compare. Keep the sound going.'
          : drill === '432' ? 'Give the same talk three times: in 60, then 45, then 30 seconds. Squeezing the same ideas into less time pushes your speech rate up without rushing your thinking.'
          : 'Speak for 45 seconds and try not to use "you know", "I mean", "sort of" or "kind of". Speech recognition misses many "um" sounds, so listen to the playback too.'}
      </p>
      <div className="question">
        <span className="label">{drill === '432' && !finished ? `Round ${caps.length + 1} of 3: ${ROUNDS[caps.length]} seconds` : 'Prompt'}</span>
        <p className="question-text serif">{prompt}</p>
        <Button size="sm" variant="quiet" icon="shuffle" onClick={() => restart()}>Different prompt</Button>
      </div>

      {drill === '432' && caps.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th scope="col">Round</th><th scope="col">Time allowed</th><th scope="col">Words</th><th scope="col">Words per minute</th><th scope="col">Pauses, 1s+</th></tr></thead>
            <tbody>{caps.map((c, i) => <tr key={i}><th scope="row">{i + 1}</th><td>{ROUNDS[i]}s</td><td className="num">{c.metrics.words}</td><td className="num strong">{c.metrics.wpm ?? '—'}</td><td className="num">{c.metrics.pauses ?? '—'}</td></tr>)}</tbody>
          </table>
        </div>
      ) : null}

      {finished && last ? (
        <>
          {!last.text ? <Notice kind="warn" title="Nothing was recorded">No words were recognised. Check your microphone and try again.</Notice>
            : drill === 'pauses' ? (
              <Notice kind={last.metrics.pauses === 0 ? 'info' : 'warn'} title={last.metrics.pauses == null ? 'Pauses could not be measured' : last.metrics.pauses === 0 ? 'No pauses of a second or more' : `${last.metrics.pauses} pause${last.metrics.pauses > 1 ? 's' : ''} of a second or more`}>
                {last.metrics.pauses == null ? 'Turn on audio analysis in Settings to measure pauses.' : `${last.metrics.longPauses} lasted 2.5 seconds or longer${last.metrics.longestPauseMs ? `; the longest was ${(last.metrics.longestPauseMs / 1000).toFixed(1)}s` : ''}. You spoke at ${last.metrics.wpm ?? 'an unmeasured number of'} words per minute.`}
              </Notice>
            ) : drill === 'fillers' && fill ? (
              <Notice kind={fill.count === 0 ? 'info' : 'warn'} title={fill.count === 0 ? 'No fillers recognised' : `${fill.count} filler${fill.count > 1 ? 's' : ''} recognised`}>
                {fill.count ? Object.entries(fill.byType).map(([k, v]) => `${k} ×${v}`).join(', ') + '.' : 'Listen back to check for sounds the recogniser dropped.'}
              </Notice>
            ) : drill === '432' ? (
              <Notice kind="info" title="Three rounds complete">
                {caps[0].metrics.wpm && caps[2].metrics.wpm ? `Your rate went from ${caps[0].metrics.wpm} to ${caps[2].metrics.wpm} words per minute.` : 'Compare the rounds in the table above.'}
              </Notice>
            ) : null}
          {last.text ? <p className="serif answer-text">{last.text}</p> : null}
          {last.blob ? <Clip blob={last.blob} /> : null}
          <div className="row wrap">
            <Button icon="refresh" onClick={() => restart(drill, false)}>Same prompt again</Button>
            <Button variant="primary" icon="right" onClick={() => restart()}>New prompt</Button>
          </div>
        </>
      ) : (
        <Recorder key={n} maxSec={drill === 'pauses' ? 60 : drill === 'fillers' ? 45 : ROUNDS[caps.length]} startLabel={drill === '432' && caps.length ? `Start round ${caps.length + 1}` : 'Start speaking'} onDone={done} />
      )}
    </div>
  );
}

/* ---------- Topic browser, random question, daily challenge ---------- */
function Topics() {
  const [topic, setTopic] = useState(TOPICS[0]);
  const cards = CUE_CARDS.filter((c) => c.topic === topic);
  return (
    <div className="practice-q">
      <Segmented label="Topic" value={topic} onChange={setTopic} options={TOPICS.map((t) => ({ value: t, label: t }))} />
      {cards.map((c) => (
        <section key={c.id} className="topic-block">
          <div className="p2">
            <CueCardView card={c} footer={<Button size="sm" variant="primary" href={`/practice/part2?card=${c.id}`} icon="mic">Practise this card</Button>} />
            <div>
              <h3 className="label">Part 3: {c.part3Theme}</h3>
              <ul className="rule-list">
                {c.part3.map((q) => <li key={q} className="spread"><span className="serif">{q}</span><Button size="sm" href={`/practice/part3?q=${encodeURIComponent(q)}`}>Practise</Button></li>)}
              </ul>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}

function RandomQuestion() {
  const draw = () => {
    const part = (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
    if (part === 2) { const c = pick(CUE_CARDS, 1)[0]; return { part, text: c.prompt, href: `/practice/part2?card=${c.id}` }; }
    const q = pick(part === 1 ? P1_QUESTIONS : P3_QUESTIONS, 1)[0];
    return { part, text: q.text, href: `/practice/part${part}?q=${encodeURIComponent(q.text)}` };
  };
  const [q, setQ] = useState(draw);
  return (
    <section className="panel random">
      <div className="spread"><h2 className="h3">Random question</h2><Button size="sm" icon="shuffle" onClick={() => setQ(draw())}>Draw another</Button></div>
      <p className="serif challenge-q">{q.text}</p>
      <div className="row wrap"><span className="tag">Part {q.part}</span><Button size="sm" variant="primary" href={q.href} icon="mic">Answer it</Button></div>
    </section>
  );
}

function Challenge({ route }: { route: Route }) {
  const store = useStore();
  const today = dayKey();
  const ch = dailyChallenge(today);
  const complete = () => update((s) => ({ ...s, challenges: { ...s.challenges, [today]: true } }));
  return (
    <>
      {store.challenges[today] ? <Notice kind="info" title="Challenge complete for today">Come back tomorrow for a new one. You can still answer this one again.</Notice> : null}
      {ch.part === 2 && ch.card ? <CardPractice route={route} fixed={ch.card} onComplete={complete} /> : <QuestionPractice part={ch.part as 1 | 3} route={route} fixed={ch.text} onComplete={complete} />}
    </>
  );
}

const MODES: { path: string; title: string; text: string }[] = [
  { path: 'part1', title: 'Part 1: interview questions', text: 'Short personal questions on familiar topics. Practise answering in two to four natural sentences.' },
  { path: 'part2', title: 'Part 2: cue card', text: 'One minute to prepare, up to two minutes to speak. Notes, timer and playback included.' },
  { path: 'part3', title: 'Part 3: discussion', text: 'Abstract questions that ask you to give opinions, compare and speculate.' },
  { path: 'topics', title: 'By topic', text: 'Pick a theme and work through its cue card and discussion questions together.' },
  { path: 'vocab', title: 'Vocabulary', text: 'Topic collocations in context, then a spoken task that checks you actually used them.' },
  { path: 'fluency', title: 'Fluency drills', text: 'Timed talks that measure your pauses, fillers and speech rate.' },
];

export function Practice({ route }: { route: Route }) {
  const mode = route.segments[1];
  const key = route.path + '?' + route.query.toString();
  if (!mode)
    return (
      <div className="page">
        <PageHead title="Practice centre" sub="Work on one part or one skill at a time. Every spoken answer is transcribed, measured and kept for playback until you leave the page." />
        <div className="grid-2">
          <ul className="mode-list">
            {MODES.map((m) => (
              <li key={m.path}>
                <a href={`#/practice/${m.path}`}>
                  <strong>{m.title}</strong>
                  <span className="muted">{m.text}</span>
                </a>
              </li>
            ))}
          </ul>
          <div className="stack">
            <RandomQuestion />
            <section className="panel">
              <h2 className="h3">Daily challenge</h2>
              <p className="muted">One question a day, the same for everyone. Answer it to keep your streak.</p>
              <Button href="/practice/challenge" icon="flame">Open today{'’'}s challenge</Button>
            </section>
          </div>
        </div>
      </div>
    );

  const titles: Record<string, string> = { part1: 'Part 1 practice', part2: 'Part 2 cue card practice', part3: 'Part 3 discussion practice', topics: 'Practice by topic', vocab: 'Vocabulary', fluency: 'Fluency drills', challenge: 'Daily challenge' };
  if (!titles[mode])
    return <div className="page"><Empty title="Practice mode not found" action={<Button variant="primary" onClick={() => go('/practice')}>Back to the practice centre</Button>} /></div>;
  return (
    <div className="page">
      <PageHead title={titles[mode]} sub={<a href="#/practice">All practice</a>} />
      {mode === 'part1' ? <QuestionPractice key={key} part={1} route={route} />
        : mode === 'part3' ? <QuestionPractice key={key} part={3} route={route} />
        : mode === 'part2' ? <CardPractice key={key} route={route} />
        : mode === 'topics' ? <Topics />
        : mode === 'vocab' ? <VocabPractice />
        : mode === 'fluency' ? <FluencyPractice />
        : <Challenge route={route} />}
    </div>
  );
}
