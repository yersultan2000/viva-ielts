/** Speech recognition (browser Web Speech API) and text-to-speech for the examiner's voice. */

const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;
export const recognitionSupported = () => !!SR;
export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export class Recognizer {
  private rec: any = null;
  private base = '';
  private session = '';
  private confs: number[] = [];
  private sessionConfs = new Map<number, number>();
  private active = false;
  interim = '';
  lastUpdate = 0;

  constructor(private onUpdate: (finalText: string, interim: string) => void, private onError: (code: string) => void) {}

  get text() {
    return (this.base + ' ' + this.session).replace(/\s+/g, ' ').trim();
  }

  start() {
    if (!SR) return;
    this.base = '';
    this.session = '';
    this.interim = '';
    this.confs = [];
    this.active = true;
    this.spawn();
  }

  private spawn() {
    const rec = new SR();
    this.rec = rec;
    rec.lang = 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.sessionConfs = new Map();
    rec.onresult = (e: any) => {
      let fin = '', interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) {
          fin += res[0].transcript + ' ';
          if (res[0].confidence > 0) this.sessionConfs.set(i, res[0].confidence);
        } else interim += res[0].transcript;
      }
      this.session = fin;
      this.interim = interim;
      this.lastUpdate = Date.now();
      this.onUpdate(this.text, interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'network') {
        this.active = false;
        this.onError(e.error);
      }
    };
    rec.onend = () => {
      this.base = this.text;
      this.session = '';
      this.confs.push(...this.sessionConfs.values());
      this.sessionConfs = new Map();
      // The browser ends recognition after a silence; keep listening until we are told to stop.
      if (this.active) {
        try { this.spawn(); } catch { this.active = false; }
      }
    };
    try { rec.start(); } catch { /* start() throws if called twice in quick succession */ }
  }

  setActive(on: boolean) {
    if (!SR) return;
    if (on && !this.active) { this.active = true; this.spawn(); }
    else if (!on && this.active) { this.active = false; try { this.rec?.stop(); } catch { /* ignore */ } }
  }

  stop(): Promise<{ text: string; confidence: number | null }> {
    return new Promise((resolve) => {
      const finish = () => {
        const all = [...this.confs, ...this.sessionConfs.values()];
        const text = (this.text + ' ' + this.interim).replace(/\s+/g, ' ').trim();
        this.interim = '';
        resolve({ text, confidence: all.length ? all.reduce((a, b) => a + b, 0) / all.length : null });
      };
      if (!this.rec || !this.active) return finish();
      this.active = false;
      const rec = this.rec;
      let done = false;
      const once = () => { if (!done) { done = true; finish(); } };
      const prev = rec.onend;
      rec.onend = () => { prev?.(); once(); };
      try { rec.stop(); } catch { once(); }
      setTimeout(once, 1200); // some browsers never fire onend
    });
  }
}

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

function chooseVoice(uri: string): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  return (
    voices.find((v) => v.voiceURI === uri) ||
    voices.find((v) => /en-GB/i.test(v.lang) && /google|natural|online/i.test(v.name)) ||
    voices.find((v) => /en-GB/i.test(v.lang)) ||
    voices.find((v) => /natural|google/i.test(v.name)) ||
    voices[0]
  );
}

let speakToken = 0;
let settleCurrent: (() => void) | null = null;

export function cancelSpeech() {
  speakToken++;
  settleCurrent?.(); // also ends the silent reading delay used when no voice is installed
  if (ttsSupported()) speechSynthesis.cancel();
}

/** Speaks the text and resolves when it has finished. Falls back to a reading-time delay with no voice. */
export function speak(text: string, opts: { voiceURI: string; rate: number }): Promise<void> {
  const token = ++speakToken;
  const readMs = Math.min(12000, 900 + text.length * 45);
  return new Promise((resolve) => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; if (settleCurrent === done) settleCurrent = null; resolve(); } };
    settleCurrent?.();
    settleCurrent = done;
    if (!ttsSupported() || englishVoices().length === 0) {
      setTimeout(done, readMs);
      return;
    }
    speechSynthesis.cancel();
    // Long utterances are cut off in some browsers, so speak one sentence at a time.
    const parts = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) || [text];
    const voice = chooseVoice(opts.voiceURI);
    let i = 0;
    const watchdog = setTimeout(done, 4000 + (text.length * 110) / opts.rate);
    const next = () => {
      if (token !== speakToken) { clearTimeout(watchdog); return done(); }
      if (i >= parts.length) { clearTimeout(watchdog); return done(); }
      const u = new SpeechSynthesisUtterance(parts[i++]);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-GB';
      u.rate = opts.rate;
      u.onend = next;
      u.onerror = next;
      speechSynthesis.speak(u);
    };
    next();
  });
}
