import { useEffect, useRef, useState } from 'react';
import { CueCardView } from '../components/CueCardView';
import { Icon } from '../components/Icon';
import { ThemeToggle, Wordmark } from '../components/Shell';
import { Waveform } from '../components/charts';
import { Button, ModeBadge, Notice, Segmented, fmtTime } from '../components/ui';
import { api, useBackend } from '../lib/api';
import { assess } from '../lib/assess';
import { CUE_CARDS, PART1, pick } from '../lib/bank';
import { go } from '../lib/router';
import type { Route } from '../lib/router';
import { cancelSpeech, speak, ttsSupported } from '../lib/speech';
import { getState, saveClip, uid, update, useStore } from '../lib/store';
import { TARGETS } from '../lib/types';
import type { CueCard, ExamConfig, ExamRecord, Part, TargetBand, Turn } from '../lib/types';
import { useSpeaking } from '../lib/useSpeaking';
import type { Capture } from '../lib/useSpeaking';

const PRESETS: Record<'full' | 'short', ExamConfig> = {
  full: { preset: 'full', parts: { p1: true, p2: true, p3: true }, p1Sec: 270, prepSec: 60, talkSec: 120, p3Sec: 270 },
  short: { preset: 'short', parts: { p1: true, p2: true, p3: true }, p1Sec: 120, prepSec: 60, talkSec: 120, p3Sec: 120 },
};

const estimate = (c: ExamConfig) =>
  25 + (c.parts.p1 ? c.p1Sec + 10 : 0) + (c.parts.p2 ? 45 + c.prepSec + c.talkSec + 25 : 0) + (c.parts.p3 ? c.p3Sec + 15 : 0) + 10;

type Phase = 'setup' | 'loading' | 'examiner' | 'answer' | 'thinking' | 'prep' | 'assessing';
const ABORT = Symbol('abort');
const WHY = ['Why is that?', 'Why?', 'Can you tell me a little more about that?'];

export function Exam({ route }: { route: Route }) {
  const store = useStore();
  const { settings } = store;
  const backend = useBackend();
  const sp = useSpeaking(settings.analyseAudio);

  const [phase, setPhaseState] = useState<Phase>('setup');
  const [config, setConfig] = useState<ExamConfig>(PRESETS.full);
  const [cardChoice, setCardChoice] = useState(route.query.get('card') || 'random');
  const [part, setPart] = useState<Part>(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [card, setCard] = useState<CueCard | null>(null);
  const [cardShown, setCardShown] = useState(false);
  const [notes, setNotes] = useState('');
  const [prepLeft, setPrepLeft] = useState(0);
  const [clock, setClock] = useState({ total: 0, part: 0 });
  const [answerLeft, setAnswerLeft] = useState<number | null>(null);
  const [paused, setPausedState] = useState(false);
  const [typed, setTypedState] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [showText, setShowText] = useState(true);
  const [forceTyped, setForceTyped] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [silentHint, setSilentHint] = useState(false);

  const r = useRef({
    phase: 'setup' as Phase, paused: false, abort: false, early: false, waiter: null as null | (() => void),
    turns: [] as Turn[], total: 0, part: 0, prep: 0, typed: '', heard: '',
    answer: null as null | { maxMs: number; silenceMs: number; active: number; longTurn?: boolean },
    startedAt: 0, finishing: false, notes: '', card: null as CueCard | null, mode: 'demo' as 'ai' | 'demo', config: PRESETS.full, forceTyped: false,
  });
  r.current.heard = sp.text + sp.interim;
  const logEnd = useRef<HTMLDivElement | null>(null);

  const setPhase = (p: Phase) => { r.current.phase = p; setPhaseState(p); };
  const setPaused = (p: boolean) => { r.current.paused = p; setPausedState(p); };
  const release = () => { const w = r.current.waiter; r.current.waiter = null; w?.(); };
  const check = () => { if (r.current.abort) throw ABORT; };
  const pushTurn = (t: Omit<Turn, 'id' | 'at'> & { id?: string }) => {
    const turn: Turn = { id: t.id || uid(), at: Date.now(), ...t };
    r.current.turns = [...r.current.turns, turn];
    setTurns(r.current.turns);
    return turn;
  };

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
      r.current.abort = true;
      release();
      cancelSpeech();
    };
  }, []);

  // One clock drives the test timer, the preparation countdown and end-of-answer detection.
  useEffect(() => {
    const id = setInterval(() => {
      const s = r.current;
      if (s.paused || ['setup', 'loading', 'assessing'].includes(s.phase)) return;
      s.total += 0.25;
      s.part += 0.25;
      if (Number.isInteger(s.total)) setClock({ total: s.total, part: s.part });
      if (s.phase === 'prep') {
        s.prep -= 0.25;
        if (Number.isInteger(s.prep)) setPrepLeft(Math.max(0, s.prep));
        if (s.prep <= 0) release();
      }
      if (s.phase === 'answer' && s.answer) {
        const a = s.answer;
        a.active += 250;
        if (a.longTurn) setAnswerLeft(Math.max(0, Math.ceil((a.maxMs - a.active) / 1000)));
        const sil = sp.getSilence();
        setSilentHint(!s.heard && !s.typed && a.active > 12000);
        if (a.active >= a.maxMs) release();
        else if (getState().settings.autoAdvance && sp.canRecognise && !s.forceTyped && s.heard.trim() && sil.spoke && sil.ms >= a.silenceMs) release();
      }
    }, 250);
    return () => clearInterval(id);
  }, [sp.getSilence, sp.canRecognise]);

  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [turns.length, sp.text]);

  const say = async (p: Part, text: string) => {
    check();
    pushTurn({ role: 'examiner', part: p, text });
    setPhase('examiner');
    const st = getState().settings;
    await speak(text, { voiceURI: st.voiceURI, rate: st.rate });
    check();
  };

  const listen = async (p: Part, spoken: string, question: string, opts: { maxMs: number; silenceMs: number; longTurn?: boolean }): Promise<Capture> => {
    await say(p, spoken);
    r.current.typed = ''; setTypedState(''); setSilentHint(false);
    r.current.answer = { ...opts, active: 0 };
    setAnswerLeft(opts.longTurn ? Math.ceil(opts.maxMs / 1000) : null);
    setPhase('answer');
    sp.start(r.current.forceTyped);
    await new Promise<void>((res) => { r.current.waiter = res; });
    r.current.answer = null;
    const cap = await sp.stop(r.current.typed);
    if (r.current.abort && !r.current.early) throw ABORT;
    const id = uid();
    const hasAudio = cap.blob ? await saveClip(id, cap.blob) : false;
    pushTurn({ id, role: 'candidate', part: p, text: cap.text, question, metrics: cap.metrics, hasAudio, typed: cap.typed, longTurn: opts.longTurn });
    check();
    return cap;
  };

  const begin = async (typedOnly = false) => {
    const s = r.current;
    Object.assign(s, { abort: false, early: false, finishing: false, notes: '', card: null, turns: [], total: 0, part: 0, startedAt: Date.now(), config, forceTyped: typedOnly });
    s.mode = backend.mode === 'ai' ? 'ai' : 'demo';
    setTurns([]); setNotice(''); setNotes(''); setCardShown(false); setClock({ total: 0, part: 0 }); setForceTyped(typedOnly);
    setPhase('loading');
    if (!typedOnly && (await sp.prepare()) === 'failed') { setPhase('setup'); return; }
    try {
      await run();
      await finish();
    } catch (e) {
      if (e !== ABORT) { console.error(e); setNotice('The test stopped because of an unexpected error. Your answers so far have been assessed.'); await finish(); return; }
      if (r.current.early) await finish();
    }
  };

  const run = async () => {
    const s = r.current;
    const cfg = s.config;
    const st = getState();
    const recent = st.exams.slice(0, 2);
    const recentTopics = recent.flatMap((e) => e.config.topicIds || []);
    const nTopics = cfg.p1Sec >= 200 ? 3 : cfg.p1Sec >= 100 ? 2 : 1;

    // Choose the question set: AI-written when connected, otherwise from the built-in bank.
    let frames: { topic: string; questions: string[]; id?: string }[] = [];
    let chosen: CueCard | undefined = [...CUE_CARDS, ...st.bookmarks].find((c) => c.id === cardChoice);
    if (s.mode === 'ai' && !chosen) {
      try {
        const plan = await api.plan(backend.url, { avoid: [...recent.map((e) => e.cueCard?.prompt || ''), ...recent.flatMap((e) => e.turns.filter((t) => t.part === 1 && t.role === 'examiner').slice(0, 3).map((t) => t.text))].filter(Boolean), topics: nTopics });
        frames = plan.part1.filter((f) => f.topic && Array.isArray(f.questions) && f.questions.length).slice(0, nTopics);
        chosen = { ...plan.cueCard, id: uid(), generated: true, points: plan.cueCard.points || [], part3: plan.cueCard.part3 || [] };
      } catch (e) {
        setNotice(`Built-in questions are in use because the AI question writer failed: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
    check();
    if (!frames.length) {
      const first = PART1[0];
      const rest = pick(PART1.slice(1), nTopics - 1, (t) => recentTopics.includes(t.id));
      frames = [first, ...rest];
    }
    if (!chosen) chosen = pick(CUE_CARDS, 1, (c) => recent.some((e) => e.cueCard?.id === c.id))[0];
    s.config = { ...cfg, topicIds: frames.map((f) => f.id || f.topic), cueCardId: chosen.id };
    setCard(chosen);
    s.card = chosen;
    const theCard = chosen;

    const hour = new Date().getHours();
    setPart(0);
    await say(0, `Good ${hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'}. My name is Alex, and I will be your examiner today.`);
    await listen(0, 'Can you tell me your full name, please?', 'Can you tell me your full name, please?', { maxMs: 15000, silenceMs: 2200 });

    if (cfg.parts.p1) {
      setPart(1); s.part = 0;
      await say(1, 'Thank you. Now, in this first part, I’d like to ask you some questions about yourself.');
      let asked = 0;
      outer: for (let t = 0; t < frames.length; t++) {
        const f = frames[t];
        const lead = t === 0 ? `Let’s talk about ${f.topic}.` : t === 1 ? `Now let’s talk about ${f.topic}.` : `Let’s move on to ${f.topic}.`;
        for (let q = 0; q < Math.min(4, f.questions.length); q++) {
          if (asked > 0 && s.part >= cfg.p1Sec) break outer;
          const question = f.questions[q];
          const cap = await listen(1, q === 0 ? `${lead} ${question}` : question, question, { maxMs: 45000, silenceMs: 2800 });
          asked++;
          if (q > 0 && cap.metrics.words > 0 && cap.metrics.words < 8 && s.part < cfg.p1Sec) {
            const why = WHY[asked % WHY.length];
            await listen(1, why, `${question} (follow-up: ${why})`, { maxMs: 40000, silenceMs: 2800 });
          }
        }
      }
    }

    if (cfg.parts.p2) {
      setPart(2); s.part = 0;
      await say(2, `${cfg.parts.p1 ? 'Thank you. ' : ''}Now I’m going to give you a topic, and I’d like you to talk about it for one to two minutes. Before you talk, you’ll have ${cfg.prepSec === 60 ? 'one minute' : `${cfg.prepSec} seconds`} to think about what you’re going to say. You can make some notes if you wish.`);
      setCardShown(true);
      await say(2, `Here is your topic. I’d like you to ${theCard.prompt.charAt(0).toLowerCase()}${theCard.prompt.slice(1)}`);
      s.prep = cfg.prepSec; setPrepLeft(cfg.prepSec); setPhase('prep');
      await new Promise<void>((res) => { s.waiter = res; });
      check();
      await listen(2, 'All right? Remember, you have one to two minutes for this, so don’t worry if I stop you. I’ll tell you when the time is up. Can you start speaking now, please?', theCard.prompt, { maxMs: cfg.talkSec * 1000, silenceMs: 7000, longTurn: true });
      await listen(2, `Thank you. ${theCard.roundOff}`, theCard.roundOff, { maxMs: 30000, silenceMs: 2800 });
      setCardShown(false);
    }

    if (cfg.parts.p3) {
      setPart(3); s.part = 0;
      const about = theCard.prompt.replace(/^Describe\s+/i, '').replace(/\.$/, '');
      const pool = theCard.part3.slice();
      const asked: string[] = [];
      let lead = `${cfg.parts.p2 ? `Thank you. We’ve been talking about ${about}, and` : 'Now,'} I’d like to discuss with you one or two more general questions related to ${cfg.parts.p2 ? 'this' : theCard.part3Theme}. Let’s consider first of all ${theCard.part3Theme}. `;
      while ((asked.length === 0 || s.part < cfg.p3Sec) && asked.length < 9) {
        let question = '';
        if (s.mode === 'ai' && asked.length > 0) {
          setPhase('thinking');
          try {
            const out = await api.examiner(backend.url, {
              part: 3, theme: theCard.part3Theme,
              history: s.turns.filter((t) => t.part === 3).map((t) => ({ role: t.role, text: t.text })),
              asked, fallback: pool,
            });
            question = out.text;
          } catch { /* fall back to the prepared questions below */ }
          check();
        }
        if (!question) question = pool.shift() || '';
        else {
          const i = pool.findIndex((p) => p.toLowerCase() === question.toLowerCase());
          if (i >= 0) pool.splice(i, 1);
        }
        if (!question) break;
        asked.push(question);
        await listen(3, lead + question, question, { maxMs: 75000, silenceMs: 3200 });
        lead = '';
      }
    }
    await say(3, 'Thank you very much. That is the end of the speaking test.');
  };

  const finish = async () => {
    const s = r.current;
    if (s.finishing) return;
    s.finishing = true;
    cancelSpeech();
    sp.release();
    setConfirmEnd(false); setPaused(false);
    const answered = s.turns.filter((t) => t.role === 'candidate' && t.text.trim());
    if (!answered.length) {
      s.finishing = false;
      setPhase('setup');
      setNotice('No answers were recorded, so there was nothing to assess.');
      return;
    }
    setPhase('assessing');
    const target = getState().settings.target;
    const chosen = s.card || undefined;
    const { report } = await assess(s.mode, backend.url, s.turns, target, chosen);
    const record: ExamRecord = {
      id: uid(), startedAt: s.startedAt, endedAt: Date.now(), durationSec: Math.round(s.total), config: s.config, target,
      mode: report.source, turns: s.turns, cueCard: chosen, notes: s.notes, report,
    };
    update((st) => ({
      ...st,
      exams: [record, ...st.exams].slice(0, 60),
      practice: [{ id: uid(), at: Date.now(), kind: 'exam', seconds: Math.round(s.total), label: 'Mock test' }, ...st.practice].slice(0, 400),
    }));
    go(`/results/${record.id}`);
  };

  const endNow = (assessIt: boolean) => {
    const s = r.current;
    s.abort = true; s.early = assessIt;
    setConfirmEnd(false);
    cancelSpeech();
    if (s.phase === 'answer' || s.phase === 'prep') release();
    if (!assessIt) { sp.release(); go('/dashboard'); }
    else if (s.phase === 'thinking' || s.phase === 'loading') void finish();
  };

  const togglePause = () => {
    if (paused) { setPaused(false); if (phase === 'answer') sp.resume(); }
    else { setPaused(true); if (phase === 'answer') sp.pause(); }
  };

  /* ---------- Setup screen ---------- */
  if (phase === 'setup') {
    const cards = [...CUE_CARDS, ...store.bookmarks.filter((b) => !CUE_CARDS.some((c) => c.id === b.id))];
    const custom = config.preset === 'custom';
    const setCfg = (patch: Partial<ExamConfig>) => setConfig((c) => ({ ...c, ...patch, preset: 'custom' }));
    const anyPart = config.parts.p1 || config.parts.p2 || config.parts.p3;
    return (
      <div className="setup">
        <header className="setup-top">
          <Wordmark href="#/dashboard" />
          <div className="row">
            <ModeBadge mode={backend.mode} />
            <ThemeToggle />
            <Button variant="quiet" href="/dashboard" icon="x" label="Close and return to dashboard" />
          </div>
        </header>
        <main className="setup-body" id="main">
          <h1 className="page-title">Set up your mock test</h1>
          <p className="page-sub">The examiner speaks each question aloud, listens to your answer and moves on, exactly one question at a time. You get no feedback until the end.</p>

          {notice ? <Notice kind="warn">{notice}</Notice> : null}
          {sp.error ? (
            <Notice kind="error" title="Microphone problem" action={<Button size="sm" onClick={() => { sp.setError(''); void begin(true); }} icon="keyboard">Type answers instead</Button>}>
              {sp.error}
            </Notice>
          ) : null}
          {backend.mode === 'demo' ? (
            <Notice kind="info" title="Demo mode">
              No AI backend is connected, so questions come from the built-in bank and your result will be a rule-based estimate from measurable features of your speech, not an AI assessment. <a href="#/settings">Connect a backend</a>
            </Notice>
          ) : null}

          <section className="setup-section">
            <h2 className="h3">Length</h2>
            <Segmented
              label="Test length"
              value={config.preset}
              onChange={(v) => setConfig(v === 'custom' ? { ...config, preset: 'custom' } : PRESETS[v as 'full' | 'short'])}
              options={[{ value: 'full', label: 'Full test' }, { value: 'short', label: 'Short test' }, { value: 'custom', label: 'Custom' }]}
            />
            <p className="muted small">About {Math.round(estimate(config) / 60)} minutes. {config.preset === 'full' ? 'Timed like the real test: Part 1 and Part 3 run 4–5 minutes each.' : config.preset === 'short' ? 'All three parts, with Parts 1 and 3 cut to two minutes each.' : 'Choose the parts and timings yourself.'}</p>
            {custom ? (
              <div className="custom-grid">
                {(['p1', 'p2', 'p3'] as const).map((k, i) => (
                  <label key={k} className="check">
                    <input type="checkbox" checked={config.parts[k]} onChange={(e) => setCfg({ parts: { ...config.parts, [k]: e.target.checked } })} />
                    <span>Include Part {i + 1}</span>
                  </label>
                ))}
                <label className="field">
                  <span className="label">Part 1 length: {fmtTime(config.p1Sec)}</span>
                  <input type="range" min={60} max={300} step={30} value={config.p1Sec} disabled={!config.parts.p1} onChange={(e) => setCfg({ p1Sec: +e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Part 2 preparation: {fmtTime(config.prepSec)}</span>
                  <input type="range" min={15} max={60} step={15} value={config.prepSec} disabled={!config.parts.p2} onChange={(e) => setCfg({ prepSec: +e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Part 2 talk, up to: {fmtTime(config.talkSec)}</span>
                  <input type="range" min={60} max={120} step={15} value={config.talkSec} disabled={!config.parts.p2} onChange={(e) => setCfg({ talkSec: +e.target.value })} />
                </label>
                <label className="field">
                  <span className="label">Part 3 length: {fmtTime(config.p3Sec)}</span>
                  <input type="range" min={60} max={300} step={30} value={config.p3Sec} disabled={!config.parts.p3} onChange={(e) => setCfg({ p3Sec: +e.target.value })} />
                </label>
              </div>
            ) : null}
          </section>

          <section className="setup-section">
            <h2 className="h3">Target band</h2>
            <Segmented label="Target band" value={settings.target} onChange={(v) => update((s) => ({ ...s, settings: { ...s.settings, target: v as TargetBand } }))} options={TARGETS.map((t) => ({ value: t, label: t.toFixed(1) }))} />
            <p className="muted small">Your report compares each criterion with this band. It does not change how strictly you are assessed.</p>
          </section>

          <section className="setup-section">
            <h2 className="h3">Part 2 topic</h2>
            <select className="input" value={cardChoice} onChange={(e) => setCardChoice(e.target.value)} aria-label="Part 2 topic">
              <option value="random">{backend.mode === 'ai' ? 'Surprise me (new AI-written card)' : 'Surprise me (random card)'}</option>
              {cards.map((c) => <option key={c.id} value={c.id}>{c.topic}: {c.prompt}</option>)}
            </select>
          </section>

          <section className="setup-section">
            <h2 className="h3">Before you begin</h2>
            <ul className="checks">
              <li className={sp.canRecognise ? 'ok' : 'warn'}>
                <Icon name={sp.canRecognise ? 'check' : 'alert'} />
                {sp.canRecognise ? 'Speech recognition is available in this browser.' : 'This browser has no speech recognition, so you will type your answers and fluency cannot be measured. Chrome, Edge and Safari support it.'}
              </li>
              <li className={ttsSupported() ? 'ok' : 'warn'}>
                <Icon name={ttsSupported() ? 'check' : 'alert'} />
                {ttsSupported() ? 'The examiner will speak aloud. ' : 'This browser cannot speak, so questions will appear as text only. '}
                {ttsSupported() ? <button className="link" onClick={() => void speak('Good morning. Can you hear me clearly?', { voiceURI: settings.voiceURI, rate: settings.rate })}>Test the voice</button> : null}
              </li>
              <li className={online ? 'ok' : 'warn'}>
                <Icon name={online ? 'check' : 'alert'} />
                {online ? 'You are online.' : 'You are offline. Speech recognition in most browsers needs a connection.'}
              </li>
              <li className="ok"><Icon name="mic" />Your browser will ask for the microphone when you start. Recordings stay on this device.</li>
            </ul>
          </section>

          <div className="setup-go">
            <Button variant="primary" size="lg" icon="mic" disabled={!anyPart} onClick={() => void begin(!sp.canRecognise)}>Start the test</Button>
            {!anyPart ? <span className="muted small">Include at least one part.</span> : null}
          </div>
        </main>
      </div>
    );
  }

  /* ---------- Examination room ---------- */
  const steps = [{ p: 0, label: 'Introduction' }, ...(r.current.config.parts.p1 ? [{ p: 1, label: 'Part 1' }] : []), ...(r.current.config.parts.p2 ? [{ p: 2, label: 'Part 2' }] : []), ...(r.current.config.parts.p3 ? [{ p: 3, label: 'Part 3' }] : [])];
  const total = estimate(r.current.config);
  const lastExaminer = [...turns].reverse().find((t) => t.role === 'examiner');
  const typing = !sp.canRecognise || forceTyped || !!sp.error;
  const listening = phase === 'answer' && !paused;
  const status =
    phase === 'loading' ? 'Setting up your test' :
    phase === 'examiner' ? 'The examiner is speaking' :
    phase === 'thinking' ? 'The examiner is considering your answer' :
    phase === 'prep' ? 'Preparation time' :
    phase === 'assessing' ? 'Assessing your test' :
    paused ? 'Paused' : typing ? 'Type your answer' : 'Listening to you';

  return (
    <div className="room">
      <header className="room-top">
        <span className="wordmark" aria-hidden="true"><span>Viva</span></span>
        <ol className="partbar" aria-label="Test progress">
          {steps.map((st) => (
            <li key={st.p} className={st.p === part ? 'now' : st.p < part ? 'done' : ''} aria-current={st.p === part ? 'step' : undefined}>{st.label}</li>
          ))}
        </ol>
        <div className="room-meta">
          <span className="timer" aria-label={`Elapsed time ${fmtTime(clock.total)}`}><Icon name="clock" size={15} />{fmtTime(clock.total)}</span>
          <span className={`conn ${online ? 'on' : 'off'}`} title={online ? 'Connected' : 'Offline'}>
            <Icon name="wifi" size={15} />
            <span className="conn-text">{!online ? 'Offline' : r.current.mode === 'ai' ? 'AI examiner' : 'Demo mode'}</span>
          </span>
          {phase !== 'assessing' ? <Button size="sm" variant="quiet" onClick={() => setConfirmEnd(true)}>End test</Button> : null}
        </div>
      </header>
      <div className="room-progress" role="progressbar" aria-label="Test progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((clock.total / total) * 100))}>
        <div style={{ width: `${Math.min(100, (clock.total / total) * 100)}%` }} />
      </div>

      {confirmEnd ? (
        <div className="dialog-backdrop">
          <div className="dialog" role="alertdialog" aria-labelledby="end-title">
            <h2 id="end-title" className="h3">End the test now?</h2>
            <p className="muted">You can get a report on what you have said so far, or leave without saving anything.</p>
            <div className="row wrap">
              <Button variant="primary" onClick={() => setConfirmEnd(false)}>Keep going</Button>
              <Button onClick={() => endNow(true)} disabled={!turns.some((t) => t.role === 'candidate' && t.text) && phase !== 'answer'}>End and assess</Button>
              <Button variant="danger" onClick={() => endNow(false)}>Discard and leave</Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="room-body">
        <section className="stage" aria-live="polite">
          {notice ? <Notice kind="warn">{notice}</Notice> : null}
          {!online ? <Notice kind="warn">You are offline. Speech recognition may stop until the connection returns.</Notice> : null}
          {paused ? <Notice kind="info" title="Paused">The clock and the recording are stopped. A real test cannot be paused.</Notice> : null}

          <div className={`examiner ${phase === 'examiner' ? 'speaking' : listening ? 'attending' : ''}`}>
            <div className="orb" aria-hidden="true"><span /><span /><span /><b>A</b></div>
            <div>
              <p className="examiner-name">Alex, examiner</p>
              <p className="examiner-status">{phase === 'loading' || phase === 'thinking' || phase === 'assessing' ? <span className="spinner" aria-hidden="true" /> : null}{status}</p>
            </div>
            <span className={`mic-chip ${listening && !typing ? 'live' : ''}`}>
              <span className="dot" />{listening && !typing ? 'Recording' : sp.micOn ? 'Microphone ready' : 'Microphone off'}
            </span>
          </div>

          {phase === 'assessing' ? (
            <p className="stage-line muted">{r.current.mode === 'ai' ? 'The AI assessor is reading your transcript against the band descriptors. This usually takes under a minute.' : 'Measuring pace, pausing, vocabulary range and structures.'}</p>
          ) : null}

          {showText && lastExaminer && (phase === 'examiner' || phase === 'answer' || phase === 'thinking') && !(cardShown && phase === 'answer') ? (
            <p className="stage-line serif">{lastExaminer.text}</p>
          ) : null}

          {cardShown && card && (phase === 'prep' || phase === 'answer' || phase === 'examiner') ? (
            <div className="p2">
              <CueCardView card={card} />
              <div className="p2-side">
                {phase === 'prep' ? (
                  <div className="countdown" role="timer" aria-label={`Preparation time left: ${prepLeft} seconds`}>
                    <span className="countdown-num">{fmtTime(prepLeft)}</span>
                    <span className="muted small">to prepare</span>
                  </div>
                ) : answerLeft != null && phase === 'answer' ? (
                  <div className="countdown" role="timer" aria-label={`Speaking time left: ${answerLeft} seconds`}>
                    <span className="countdown-num">{fmtTime(answerLeft)}</span>
                    <span className="muted small">the examiner will stop you</span>
                  </div>
                ) : null}
                <label className="field">
                  <span className="label">Your notes</span>
                  <textarea className="input notes" value={notes} onChange={(e) => { r.current.notes = e.target.value; setNotes(e.target.value); }} placeholder="Key words only. You can look at these while you speak." rows={5} />
                </label>
              </div>
            </div>
          ) : null}

          {phase === 'answer' ? (
            <div className="answer">
              {typing ? (
                <label className="field">
                  <span className="label">{sp.error || 'Type your answer'}</span>
                  <textarea className="input" rows={4} autoFocus value={typed} onChange={(e) => { r.current.typed = e.target.value; setTypedState(e.target.value); }} />
                </label>
              ) : (
                <>
                  <Waveform getLevel={sp.getLevel} active={listening} />
                  <p className="live serif" aria-label="Live transcript">
                    {sp.text} <span className="interim">{sp.interim}</span>
                    {!sp.text && !sp.interim ? <span className="muted">{silentHint ? 'Nothing heard yet. Check that your microphone is not muted, then speak.' : 'Your words appear here as you speak.'}</span> : null}
                  </p>
                </>
              )}
            </div>
          ) : null}

          <div className="controls">
            {phase === 'answer' || phase === 'prep' ? (
              <Button icon={paused ? 'play' : 'pause'} onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</Button>
            ) : null}
            {phase === 'prep' ? <Button variant="primary" icon="mic" onClick={release} disabled={paused}>Start speaking now</Button> : null}
            {phase === 'answer' ? <Button variant="primary" icon="check" onClick={release} disabled={paused}>{typing ? 'Submit answer' : 'I’ve finished'}</Button> : null}
            {phase === 'examiner' ? <Button variant="quiet" icon="right" onClick={() => cancelSpeech()}>Skip speech</Button> : null}
          </div>
          {phase === 'answer' && !typing && settings.autoAdvance ? <p className="muted small center">The examiner moves on when you stop speaking for a few seconds.</p> : null}
        </section>

        <aside className="log" aria-label="Conversation transcript">
          <div className="spread">
            <h2 className="h3">Transcript</h2>
            <label className="check small"><input type="checkbox" checked={showText} onChange={(e) => setShowText(e.target.checked)} /><span>Show question text</span></label>
          </div>
          <div className="log-scroll">
            {turns.length === 0 ? <p className="muted small">The conversation will appear here.</p> : null}
            {turns.map((t) => (
              <div key={t.id} className={`turn turn-${t.role}`}>
                <span className="turn-who">{t.role === 'examiner' ? 'Examiner' : 'You'}</span>
                <p className={t.role === 'candidate' ? 'serif' : ''}>{t.role === 'examiner' && !showText ? 'Question hidden' : t.text || <em className="muted">No answer recorded</em>}</p>
              </div>
            ))}
            <div ref={logEnd} />
          </div>
        </aside>
      </div>
    </div>
  );
}
