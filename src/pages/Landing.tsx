import { useState } from 'react';
import { CueCardView } from '../components/CueCardView';
import { ThemeToggle, Wordmark } from '../components/Shell';
import { Button } from '../components/ui';
import { CUE_CARDS } from '../lib/bank';
import { useStore } from '../lib/store';
import type { Report } from '../lib/types';
import { CriterionBlock, OverallBlock } from './Results';

/* In-page links cannot use href="#id" because the hash is the router. */
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

const SECTIONS = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'report', label: 'Example report' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'Questions' },
];

const FEATURES = [
  { t: 'The whole test, spoken', d: 'Part 1 interview, Part 2 long turn with a cue card and one minute to prepare, Part 3 discussion. The examiner asks one question at a time, aloud, and gives nothing away until the end.' },
  { t: 'Evidence behind every band', d: 'Each of the four criteria gets its own band, with quotes from your answers and measurements from your recording to justify it. No score appears without a reason.' },
  { t: 'Straight about pronunciation', d: 'A transcript cannot hear your accent. Viva measures pitch movement, pausing and how reliably you were recognised, and marks the pronunciation band as provisional.' },
  { t: 'Corrections you can use', d: 'Grammar errors with the corrected form, words you leaned on too often, and three of your own answers rewritten at your target band.' },
  { t: 'A practice centre for the gaps', d: 'Drill one part at a time, work by topic, build collocations, or run timed fluency rounds that count your pauses and fillers.' },
  { t: 'Progress you can see', d: 'Test history, a trend line against your target, weekly speaking minutes, and a tracker for the weaknesses that keep coming back.' },
  { t: 'Your recordings stay with you', d: 'Tests, reports and audio are stored in your browser. Only transcripts and measurements go to the assessment service, and only if you connect one.' },
];

const STEPS = [
  { t: 'Choose a length and a target', d: 'A full test runs about 13 minutes, a short one about 7. Pick the band you are aiming for, from 7 to 9.' },
  { t: 'Talk to the examiner', d: 'Allow the microphone and answer aloud. Your words appear as you speak, and the examiner moves on when you finish.' },
  { t: 'Read your report', d: 'Four criterion bands, the overall estimate, the evidence, your corrections and rewritten answers.' },
  { t: 'Practise what it found', d: 'Your plan links straight to the drills that address your weakest criterion. Then sit the test again.' },
];

const SAMPLE: Report = {
  source: 'ai',
  overall: 6.5,
  examinerNote: 'A willing, mostly fluent speaker who develops answers well in Part 2 but relies on a narrow set of everyday words. Wider, more precise vocabulary is the main thing between this performance and a 7.5.',
  criteria: {
    fc: { band: 7, summary: 'Speaks at length without obvious effort, with some hesitation while searching for language.', evidence: ['Part 2 ran 1 min 52 s with only two pauses longer than a second.', 'Links ideas with a range of markers: “on top of that”, “having said that”, “which is why”.', 'Average rate of 138 words per minute across the test.'], toImprove: ['Extend Part 3 answers past the first reason: add an example or a contrast.', 'Replace “you know” (9 times) with a silent pause.'] },
    lr: { band: 6, summary: 'Enough vocabulary to discuss every topic, but choices are often general where a precise word exists.', evidence: ['“good” used 11 times and “a lot of” 8 times.', 'Successful paraphrase: “the place where people leave their bikes” for bike rack.', 'Collocation slip: “do a decision”.'], toImprove: ['Learn five collocations per topic and use each one in a spoken answer the same day.', 'Swap general adjectives for specific ones: “good teacher” to “patient” or “demanding”.'] },
    gra: { band: 6, summary: 'A mix of simple and complex sentences; errors appear mainly when structures get longer.', evidence: ['Accurate conditionals: “if I had more time, I would take it up again”.', 'Agreement errors: “people who lives”, “it depend on”.', 'Past narrative in Part 2 slips into present twice.'], toImprove: ['Record a two-minute story in the past and check every verb.', 'Practise relative clauses with plural subjects.'] },
    pron: { band: 7, summary: 'Provisional. Pitch movement and recognition confidence suggest clear, varied delivery.', evidence: ['Pitch varied by 3.4 semitones (standard deviation), a typically expressive range.', 'Speech recognition confidence averaged 93%.'], toImprove: ['Ask a teacher to check individual sounds, which software here cannot hear.'] },
  },
  corrections: [],
  vocabulary: { strong: [], overused: [], upgrades: [] },
  fluencyNote: '',
  pronunciationNote: '',
  improved: [],
  plan: [],
};

const FAQ = [
  { q: 'Is this an official IELTS score?', a: 'No. Viva is an independent practice tool with no connection to IELTS, the British Council, IDP or Cambridge. It gives an estimate based on the public band descriptors. Only a certified examiner in a real test can award a band.' },
  { q: 'How are the bands decided?', a: 'With the AI examiner connected, a language model reads your full transcript and the measurements from your recording against the four criteria, and must quote evidence for each band. It is instructed to choose the lower band when the evidence sits between two. Without it, demo mode gives a rule-based estimate from measurable features only, and says so on the report.' },
  { q: 'Can software really judge pronunciation?', a: 'Only partly. Viva analyses your audio for pitch movement, pausing and rate, and uses speech recognition confidence as a rough sign of intelligibility. It cannot judge individual sounds or word stress the way an examiner does, so the pronunciation band is always labelled provisional.' },
  { q: 'What is demo mode?', a: 'The app needs a small backend service to reach a language model without exposing an API key. Until one is connected, Viva runs in demo mode: the examiner uses a built-in question bank and the report is a rule-based estimate. Everything else, including voice, recording, practice and history, works in full.' },
  { q: 'Which browsers work?', a: 'Chrome, Edge and Safari support both speech recognition and speech output. In Firefox, which has no speech recognition, you can type your answers instead; fluency and pronunciation are then not measured.' },
  { q: 'Where is my data kept?', a: 'In your browser, on this device. There are no accounts. You can export everything as a file or delete it all from Settings.' },
];

export function Landing() {
  const hasHistory = useStore().exams.length > 0;
  const [cardIx, setCardIx] = useState(0);
  const card = CUE_CARDS[cardIx % CUE_CARDS.length];
  return (
    <div className="land">
      <a className="skip" href="#/exam">Skip to the mock test</a>
      <header className="land-nav">
        <Wordmark />
        <nav className="land-links" aria-label="Sections">
          {SECTIONS.map((s) => <button key={s.id} className="link" onClick={() => jump(s.id)}>{s.label}</button>)}
        </nav>
        <div className="row">
          <ThemeToggle />
          <Button href="/dashboard">{hasHistory ? 'Dashboard' : 'Open the app'}</Button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1 className="hero-title">Sit the Speaking test tonight. Know your band before the real one.</h1>
            <p className="hero-sub">Viva is a spoken IELTS examiner. It runs all three parts of the Speaking test by voice, then shows you an estimated band for each criterion and the evidence it rests on.</p>
            <div className="row wrap">
              <Button variant="primary" size="lg" icon="mic" href="/exam">Start a mock test</Button>
              <Button size="lg" onClick={() => jump('report')}>See an example report</Button>
            </div>
            <p className="muted small">Free to use. No account. Works in Chrome, Edge and Safari.</p>
          </div>
          <div className="hero-card">
            <p className="hero-card-lead">Part 2 begins with a card like this one. You have one minute to prepare, then up to two minutes to speak.</p>
            <CueCardView card={card} footer={
              <div className="row wrap">
                <Button size="sm" icon="shuffle" onClick={() => setCardIx((i) => i + 1)}>Draw another card</Button>
                <Button size="sm" variant="quiet" href={`/practice/part2?card=${card.id}`}>Practise this card</Button>
              </div>
            } />
          </div>
        </section>

        <section className="land-section" id="features">
          <h2 className="land-h">What you get</h2>
          <dl className="feature-list">
            {FEATURES.map((f) => <div key={f.t}><dt>{f.t}</dt><dd>{f.d}</dd></div>)}
          </dl>
        </section>

        <section className="land-section" id="how">
          <h2 className="land-h">How it works</h2>
          <ol className="steps">
            {STEPS.map((s) => <li key={s.t}><strong>{s.t}</strong><p>{s.d}</p></li>)}
          </ol>
        </section>

        <section className="land-section" id="report">
          <h2 className="land-h">An example report</h2>
          <p className="land-lead">This is a sample for a candidate aiming at 7.5. Your own report also includes grammar corrections, vocabulary analysis, three rewritten answers, a plan and your recordings.</p>
          <div className="sample">
            <OverallBlock report={SAMPLE} target={7.5} />
            <p className="examiner-note serif">{SAMPLE.examinerNote}</p>
            <div className="criteria">
              <CriterionBlock c="lr" r={SAMPLE.criteria.lr} target={7.5} />
              <CriterionBlock c="pron" r={SAMPLE.criteria.pron} target={7.5} />
            </div>
          </div>
        </section>

        <section className="land-section" id="pricing">
          <h2 className="land-h">Pricing</h2>
          <p className="land-lead">The prices below are illustrative, to show how a hosted version could be offered. Nothing is on sale here: this build is free, and the AI examiner runs on a backend you connect yourself.</p>
          <div className="pricing">
            <div className="price">
              <h3 className="h3">Practice</h3>
              <p className="price-num">$0</p>
              <ul className="evidence"><li>Unlimited mock tests in demo mode</li><li>Rule-based band estimate</li><li>Full practice centre and notebook</li><li>History and progress on this device</li></ul>
              <Button variant="primary" href="/exam">Start a mock test</Button>
            </div>
            <div className="price">
              <h3 className="h3">Candidate</h3>
              <p className="price-num">$12 <span className="muted small">a month, illustrative</span></p>
              <ul className="evidence"><li>AI examiner with follow-up questions</li><li>AI assessment with quoted evidence</li><li>Answers rewritten at your target band</li><li>New AI-written questions and cue cards</li></ul>
              <p className="muted small">Not on sale. Available now by connecting your own backend in Settings.</p>
            </div>
            <div className="price">
              <h3 className="h3">Teacher</h3>
              <p className="price-num">$39 <span className="muted small">a month, illustrative</span></p>
              <ul className="evidence"><li>Everything in Candidate</li><li>Reports exported for each student</li><li>One backend shared by a class</li></ul>
              <p className="muted small">Not on sale. Reports can already be exported as PDF, Markdown or JSON.</p>
            </div>
          </div>
        </section>

        <section className="land-section" id="faq">
          <h2 className="land-h">Questions</h2>
          <div className="faq">
            {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
          </div>
        </section>

        <section className="land-cta">
          <h2 className="land-h">The examiner is ready when you are.</h2>
          <Button variant="primary" size="lg" icon="mic" href="/exam">Start a mock test</Button>
        </section>
      </main>

      <footer className="footer">
        <div>
          <Wordmark />
          <p className="muted small">An independent practice tool. Not affiliated with or endorsed by IELTS, the British Council, IDP or Cambridge. Band estimates are for practice only.</p>
        </div>
        <nav aria-label="App">
          <a href="#/exam">Mock test</a>
          <a href="#/practice">Practice centre</a>
          <a href="#/dashboard">Dashboard</a>
          <a href="#/notebook">Notebook</a>
          <a href="#/settings">Settings</a>
        </nav>
        <nav aria-label="On this page">
          {SECTIONS.map((s) => <button key={s.id} className="link" onClick={() => jump(s.id)}>{s.label}</button>)}
        </nav>
      </footer>
    </div>
  );
}
