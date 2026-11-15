/**
 * Microphone capture and signal measurement.
 * What is measured here: loudness (to find speech and silence), pause timing,
 * and fundamental frequency (pitch) by autocorrelation. Nothing in this file
 * recognises individual speech sounds.
 */

export interface SegmentResult {
  durationMs: number; // first speech to last speech
  speakingMs: number;
  pauses: number;
  longPauses: number;
  longestPauseMs: number;
  pitchSdSt: number | null;
  pitchRangeSt: number | null;
  blob: Blob | null;
  spoke: boolean;
}

const TICK = 50;
const PAUSE_MS = 1000;
const LONG_PAUSE_MS = 2500;

export const micSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

export class Mic {
  stream: MediaStream | null = null;
  level = 0;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buf: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private timer: number | null = null;
  private noise = 0.008;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private seg: {
    active: boolean; elapsed: number; first: number; last: number; speaking: number; silence: number;
    pauses: number; longPauses: number; longest: number; pitches: number[]; n: number;
  } | null = null;

  async open(): Promise<void> {
    if (this.stream) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    src.connect(this.analyser);
    this.timer = window.setInterval(() => this.tick(), TICK);
  }

  close() {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
    try { if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop(); } catch { /* already stopped */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.analyser = null;
    this.seg = null;
    this.level = 0;
  }

  private tick() {
    if (!this.analyser) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    this.level = this.level * 0.6 + rms * 0.4;
    // Track the room's noise floor: fall quickly, rise slowly.
    this.noise = rms < this.noise ? this.noise * 0.7 + rms * 0.3 : this.noise + (rms - this.noise) * 0.003;
    const speaking = rms > Math.max(0.012, this.noise * 3);
    const s = this.seg;
    if (!s || !s.active) return;
    s.elapsed += TICK;
    s.n++;
    if (speaking) {
      if (s.first < 0) s.first = s.elapsed;
      else if (s.silence >= PAUSE_MS) {
        s.pauses++;
        if (s.silence >= LONG_PAUSE_MS) s.longPauses++;
        s.longest = Math.max(s.longest, s.silence);
      }
      s.silence = 0;
      s.speaking += TICK;
      s.last = s.elapsed;
      if (s.n % 2 === 0) {
        const f = this.pitch();
        if (f) s.pitches.push(f);
      }
    } else if (s.first >= 0) {
      s.silence += TICK;
    }
  }

  /** Fundamental frequency by normalised autocorrelation, limited to the range of the human voice. */
  private pitch(): number | null {
    const sr = this.ctx!.sampleRate;
    const b = this.buf;
    const n = b.length;
    const minLag = Math.floor(sr / 400);
    const maxLag = Math.min(Math.floor(sr / 75), n - 200);
    let r0 = 0;
    for (let i = 0; i < n; i++) r0 += b[i] * b[i];
    if (r0 < 1e-4) return null;
    let best = 0, bestLag = -1;
    for (let lag = minLag; lag <= maxLag; lag += 2) {
      let r = 0;
      const lim = n - lag;
      for (let i = 0; i < lim; i += 2) r += b[i] * b[i + lag];
      const norm = (r * 2) / (r0 * (lim / n));
      if (norm > best) { best = norm; bestLag = lag; }
    }
    return best > 0.55 && bestLag > 0 ? sr / bestLag : null;
  }

  begin(record = true) {
    this.seg = { active: true, elapsed: 0, first: -1, last: 0, speaking: 0, silence: 0, pauses: 0, longPauses: 0, longest: 0, pitches: [], n: 0 };
    this.chunks = [];
    this.recorder = null;
    if (record && this.stream && typeof MediaRecorder !== 'undefined') {
      try {
        const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
        this.recorder = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
        this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
        this.recorder.start(1000);
      } catch {
        this.recorder = null;
      }
    }
  }

  pause() {
    if (this.seg) this.seg.active = false;
    try { if (this.recorder?.state === 'recording') this.recorder.pause(); } catch { /* ignore */ }
  }
  resume() {
    if (this.seg) this.seg.active = true;
    try { if (this.recorder?.state === 'paused') this.recorder.resume(); } catch { /* ignore */ }
  }

  /** Trailing silence since the candidate last spoke, used to notice the end of an answer. */
  silence(): { ms: number; spoke: boolean } {
    const s = this.seg;
    return s ? { ms: s.silence, spoke: s.first >= 0 } : { ms: 0, spoke: false };
  }

  async end(): Promise<SegmentResult> {
    const s = this.seg;
    this.seg = null;
    let blob: Blob | null = null;
    const rec = this.recorder;
    if (rec && rec.state !== 'inactive') {
      blob = await new Promise<Blob | null>((resolve) => {
        const done = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }) : null);
        rec.onstop = done;
        try { rec.stop(); } catch { done(); }
        setTimeout(done, 1500);
      });
    }
    this.recorder = null;
    if (!s) return { durationMs: 0, speakingMs: 0, pauses: 0, longPauses: 0, longestPauseMs: 0, pitchSdSt: null, pitchRangeSt: null, blob, spoke: false };
    let sd: number | null = null, range: number | null = null;
    if (s.pitches.length >= 12) {
      const sorted = s.pitches.slice().sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      // Discard octave jumps, a common autocorrelation artefact.
      const st = s.pitches.filter((f) => f > med * 0.6 && f < med * 1.7).map((f) => 12 * Math.log2(f / med)).sort((a, b) => a - b);
      if (st.length >= 10) {
        const mean = st.reduce((a, b) => a + b, 0) / st.length;
        sd = +Math.sqrt(st.reduce((a, b) => a + (b - mean) ** 2, 0) / st.length).toFixed(1);
        range = +(st[Math.floor(st.length * 0.95)] - st[Math.floor(st.length * 0.05)]).toFixed(1);
      }
    }
    return {
      durationMs: s.first >= 0 ? Math.max(0, s.last - s.first + TICK) : 0,
      speakingMs: s.speaking, pauses: s.pauses, longPauses: s.longPauses, longestPauseMs: s.longest,
      pitchSdSt: sd, pitchRangeSt: range, blob, spoke: s.first >= 0,
    };
  }
}
