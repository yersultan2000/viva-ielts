import { useEffect, useRef, useState } from 'react';
import { PageHead } from '../components/Shell';
import { Button, Notice, Segmented, download } from '../components/ui';
import { checkBackend } from '../lib/api';
import type { BackendInfo } from '../lib/api';
import { englishVoices, speak, ttsSupported } from '../lib/speech';
import { applyTheme, clearClips, getState, isStorageOk, replaceAll, resetAll, update, useStore } from '../lib/store';
import { TARGETS } from '../lib/types';
import type { Settings, TargetBand } from '../lib/types';

export function SettingsPage() {
  const { settings } = useStore();
  const set = (patch: Partial<Settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  const [url, setUrl] = useState(settings.backendUrl);
  const [test, setTest] = useState<BackendInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [msg, setMsg] = useState('');
  const file = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => setVoices(englishVoices());
    load();
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const connect = async () => {
    setTesting(true); setTest(null);
    const clean = url.trim().replace(/\/+$/, '');
    if (!clean) { set({ backendUrl: '' }); setTest({ ok: false, error: 'Backend removed. The app is in demo mode.' }); setTesting(false); return; }
    if (!/^https?:\/\//.test(clean)) { setTest({ ok: false, error: 'Enter a full URL beginning with https://' }); setTesting(false); return; }
    const info = await checkBackend(clean, true);
    setTest(info);
    if (info.ok) set({ backendUrl: clean });
    setTesting(false);
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (!data || typeof data !== 'object' || !('settings' in data)) throw new Error('bad');
      replaceAll(data);
      setMsg('Your data was imported.');
    } catch { setMsg('That file is not a Viva export.'); }
  };

  return (
    <div className="page settings">
      <PageHead title="Settings" />
      {!isStorageOk() ? <Notice kind="warn">This browser is blocking storage, so your tests and notebook will be lost when you close the tab.</Notice> : null}
      {msg ? <Notice kind="info">{msg}</Notice> : null}

      <section className="section">
        <h2 className="h2">You</h2>
        <label className="field narrow"><span className="label">First name (used to greet you)</span><input className="input" value={settings.name} onChange={(e) => set({ name: e.target.value })} autoComplete="given-name" /></label>
        <div className="field"><span className="label">Target band</span><Segmented label="Target band" value={settings.target} onChange={(v) => set({ target: v as TargetBand })} options={TARGETS.map((t) => ({ value: t, label: t.toFixed(1) }))} /></div>
        <div className="field"><span className="label">Appearance</span><Segmented label="Appearance" value={settings.theme} onChange={(v) => { set({ theme: v }); applyTheme(v); }} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} /></div>
      </section>

      <section className="section">
        <h2 className="h2">AI examiner</h2>
        <p className="muted">Viva{'’'}s AI features run through a small backend that you deploy, which keeps the language-model API key off this site. Paste its URL here. Without one, the app runs in demo mode: built-in questions and a rule-based estimate. The repository README explains how to deploy the backend.</p>
        <div className="add-form">
          <label className="field grow"><span className="label">Backend URL</span><input className="input" type="url" inputMode="url" placeholder="https://viva-backend.your-name.workers.dev" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
          <Button variant="primary" busy={testing} onClick={connect}>Save and test</Button>
        </div>
        {test ? <Notice kind={test.ok ? 'info' : 'error'} title={test.ok ? 'Connected' : 'Not connected'}>{test.ok ? `The backend is using ${test.provider} with the model ${test.model}.` : test.error}</Notice> : null}
        <p className="muted small">Never paste an API key here or anywhere in this site. The key belongs only in the backend{'’'}s secret settings.</p>
      </section>

      <section className="section">
        <h2 className="h2">Voice and microphone</h2>
        {ttsSupported() ? (
          <>
            <div className="add-form">
              <label className="field grow"><span className="label">Examiner voice</span>
                <select className="input" value={settings.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })}>
                  <option value="">Automatic (British English if available)</option>
                  {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select>
              </label>
              <Button icon="volume" onClick={() => void speak('Let’s talk about your hometown. What do you like most about it?', { voiceURI: getState().settings.voiceURI, rate: getState().settings.rate })}>Test voice</Button>
            </div>
            <label className="field narrow"><span className="label">Speaking speed: {settings.rate.toFixed(2)}{'×'}</span><input type="range" min={0.8} max={1.2} step={0.05} value={settings.rate} onChange={(e) => set({ rate: +e.target.value })} /></label>
            {voices.length === 0 ? <p className="muted small">No English voices are installed in this browser yet. Questions will appear as text until one loads.</p> : null}
          </>
        ) : <Notice kind="warn">This browser cannot speak, so the examiner{'’'}s questions will appear as text only.</Notice>}
        <label className="check"><input type="checkbox" checked={settings.analyseAudio} onChange={(e) => set({ analyseAudio: e.target.checked })} /><span><strong>Record and analyse audio.</strong> Needed for playback, pause timing and pitch measurement. Turn this off if speech recognition stops working while recording, which happens on some Android phones.</span></label>
        <label className="check"><input type="checkbox" checked={settings.autoAdvance} onChange={(e) => set({ autoAdvance: e.target.checked })} /><span><strong>Move on when I stop speaking.</strong> The examiner continues after a few seconds of silence. Turn this off to end each answer yourself.</span></label>
      </section>

      <section className="section">
        <h2 className="h2">Your data</h2>
        <p className="muted">Tests, reports, notebook entries and recordings are stored only in this browser. Nothing is uploaded except the transcript and measurements sent to your own backend for AI assessment. Audio never leaves this device.</p>
        <div className="row wrap">
          <Button icon="download" onClick={() => download(`viva-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getState(), null, 2), 'application/json')}>Export everything</Button>
          <Button onClick={() => file.current?.click()}>Import an export</Button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importData(f); e.target.value = ''; }} />
          <Button variant="danger" icon="trash" onClick={() => { if (window.confirm('Delete all tests, reports, notebook entries and recordings from this browser? This cannot be undone.')) { resetAll(); void clearClips(); setUrl(''); setMsg('Everything was deleted.'); } }}>Delete everything</Button>
        </div>
      </section>
    </div>
  );
}
