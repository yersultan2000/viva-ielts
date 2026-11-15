import { useState } from 'react';
import { CueCardView } from '../components/CueCardView';
import { PageHead } from '../components/Shell';
import { Button, Empty, download, fmtDate } from '../components/ui';
import { CUE_CARDS, PART1, PART3_MODELS } from '../lib/bank';
import type { Route } from '../lib/router';
import { update, useStore } from '../lib/store';
import { addVocab } from './Results';

const TABS = [
  { id: 'vocab', label: 'Vocabulary' },
  { id: 'questions', label: 'Saved questions' },
  { id: 'cards', label: 'Cue cards' },
  { id: 'models', label: 'Band 8+ answers' },
];

export function Notebook({ route }: { route: Route }) {
  const s = useStore();
  const tab = TABS.some((t) => t.id === route.segments[1]) ? route.segments[1] : 'vocab';
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [filter, setFilter] = useState<'all' | 'learning'>('all');

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    addVocab(term.trim(), meaning.trim(), example.trim(), 'My words');
    setTerm(''); setMeaning(''); setExample('');
  };
  const csv = () =>
    download('viva-vocabulary.csv', ['term,meaning,example,topic', ...s.vocab.map((v) => [v.term, v.meaning, v.example, v.topic || ''].map((x) => `"${x.replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv');
  const words = s.vocab.filter((v) => filter === 'all' || !v.known);

  return (
    <div className="page">
      <PageHead title="Notebook" sub="Everything you have chosen to keep: words, questions you found hard, cue cards and model answers." />
      <nav className="tabs" aria-label="Notebook sections">
        {TABS.map((t) => (
          <a key={t.id} href={`#/notebook/${t.id}`} aria-current={tab === t.id ? 'page' : undefined}>
            {t.label}
            {t.id === 'vocab' && s.vocab.length ? <span className="count">{s.vocab.length}</span> : null}
            {t.id === 'questions' && s.saved.length ? <span className="count">{s.saved.length}</span> : null}
            {t.id === 'cards' && s.bookmarks.length ? <span className="count">{s.bookmarks.length}</span> : null}
          </a>
        ))}
      </nav>

      {tab === 'vocab' ? (
        <>
          <form className="add-form" onSubmit={add}>
            <label className="field"><span className="label">Word or phrase</span><input className="input" value={term} onChange={(e) => setTerm(e.target.value)} required /></label>
            <label className="field"><span className="label">Meaning</span><input className="input" value={meaning} onChange={(e) => setMeaning(e.target.value)} /></label>
            <label className="field grow"><span className="label">Example sentence</span><input className="input" value={example} onChange={(e) => setExample(e.target.value)} /></label>
            <Button type="submit" variant="primary" icon="plus">Add</Button>
          </form>
          {s.vocab.length ? (
            <>
              <div className="spread">
                <div className="row">
                  <button className="link" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({s.vocab.length})</button>
                  <button className="link" aria-pressed={filter === 'learning'} onClick={() => setFilter('learning')}>Still learning ({s.vocab.filter((v) => !v.known).length})</button>
                </div>
                <Button size="sm" icon="download" onClick={csv}>Export CSV</Button>
              </div>
              <ul className="rule-list">
                {words.map((v) => (
                  <li key={v.id} className="spread">
                    <div>
                      <strong className={v.known ? 'known' : ''}>{v.term}</strong>{v.topic ? <span className="tag">{v.topic}</span> : null}
                      {v.meaning ? <p className="small">{v.meaning}</p> : null}
                      {v.example ? <p className="serif small muted">{v.example}</p> : null}
                    </div>
                    <div className="row">
                      <Button size="sm" variant="quiet" icon="check" pressed={!!v.known} onClick={() => update((st) => ({ ...st, vocab: st.vocab.map((x) => (x.id === v.id ? { ...x, known: !x.known } : x)) }))}>{v.known ? 'Known' : 'Mark known'}</Button>
                      <Button size="sm" variant="quiet" icon="trash" label={`Remove ${v.term}`} onClick={() => update((st) => ({ ...st, vocab: st.vocab.filter((x) => x.id !== v.id) }))} />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty title="No words yet" action={<Button href="/practice/vocab" variant="primary">Open vocabulary practice</Button>}>
              Add words above, or save them from vocabulary practice and from the upgrades in your test reports.
            </Empty>
          )}
        </>
      ) : null}

      {tab === 'questions' ? (
        s.saved.length ? (
          <ul className="rule-list">
            {s.saved.map((q) => (
              <li key={q.id} className="spread">
                <div><p className="serif">{q.text}</p><span className="muted small">Part {q.part}, saved {fmtDate(q.addedAt)}</span></div>
                <div className="row">
                  <Button size="sm" variant="primary" icon="mic" href={q.part === 2 ? '/practice/part2' : `/practice/part${q.part}?q=${encodeURIComponent(q.text)}`}>Practise</Button>
                  <Button size="sm" variant="quiet" icon="trash" label="Remove question" onClick={() => update((st) => ({ ...st, saved: st.saved.filter((x) => x.id !== q.id) }))} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Empty title="No saved questions" action={<Button href="/practice/part1" variant="primary">Practise Part 1</Button>}>
            Save any question you found difficult, from practice or from a test report, and come back to it here.
          </Empty>
        )
      ) : null}

      {tab === 'cards' ? (
        s.bookmarks.length ? (
          <div className="card-grid">
            {s.bookmarks.map((c) => (
              <CueCardView key={c.id} card={c} footer={
                <div className="row wrap">
                  <Button size="sm" variant="primary" icon="mic" href={`/practice/part2?card=${c.id}`}>Practise</Button>
                  <Button size="sm" href={`/exam?card=${c.id}`}>Use in a mock test</Button>
                  <Button size="sm" variant="quiet" icon="trash" label="Remove bookmark" onClick={() => update((st) => ({ ...st, bookmarks: st.bookmarks.filter((x) => x.id !== c.id) }))} />
                </div>
              } />
            ))}
          </div>
        ) : (
          <Empty title="No bookmarked cue cards" action={<Button href="/practice/part2" variant="primary">Browse cue cards</Button>}>
            Bookmark a card in Part 2 practice to keep it here, including AI-written ones.
          </Empty>
        )
      ) : null}

      {tab === 'models' ? (
        <div className="models">
          <p className="muted">Model answers written at Band 8 and above. Read them aloud, notice how ideas are linked and extended, then answer in your own words. Memorised answers are easy for examiners to spot.</p>
          <h2 className="h2">Part 1</h2>
          {PART1.filter((t) => t.model).map((t) => (
            <article key={t.id} className="improved"><h3 className="h3">{t.questions[0]}</h3><p className="serif">{t.model}</p><a className="small" href={`#/practice/part1?q=${encodeURIComponent(t.questions[0])}`}>Answer this yourself</a></article>
          ))}
          <h2 className="h2">Part 2</h2>
          {CUE_CARDS.filter((c) => c.model).map((c) => (
            <article key={c.id} className="improved"><h3 className="h3">{c.prompt}</h3><p className="serif">{c.model}</p><a className="small" href={`#/practice/part2?card=${c.id}`}>Speak on this card</a></article>
          ))}
          <h2 className="h2">Part 3</h2>
          {CUE_CARDS.filter((c) => PART3_MODELS[c.id]).map((c) => (
            <article key={c.id} className="improved"><h3 className="h3">{c.part3[0]}</h3><p className="serif">{PART3_MODELS[c.id]}</p><a className="small" href={`#/practice/part3?q=${encodeURIComponent(c.part3[0])}`}>Answer this yourself</a></article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
