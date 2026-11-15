import { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, micSupported } from './audio';
import { countFillers, tokens } from './metrics';
import { Recognizer, recognitionSupported } from './speech';
import type { AnswerMetrics } from './types';

export interface Capture {
  text: string;
  metrics: AnswerMetrics;
  blob: Blob | null;
  typed: boolean;
}

export type SpeakStatus = 'idle' | 'listening' | 'paused';

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow the microphone for this site in your browser settings, then try again.',
  'service-not-allowed': 'Speech recognition is blocked in this browser. You can type your answers instead.',
  'audio-capture': 'No microphone was found. Connect one and try again.',
  network: 'Speech recognition lost its connection. Check your internet connection; you can type this answer instead.',
};

/** One hook for everything a spoken answer needs: microphone, recording, live transcript and measurements. */
export function useSpeaking(analyseAudio: boolean) {
  const mic = useRef<Mic | null>(null);
  const rec = useRef<Recognizer | null>(null);
  const startedAt = useRef(0);
  const pausedMs = useRef(0);
  const pausedAt = useRef(0);
  const [status, setStatus] = useState<SpeakStatus>('idle');
  const statusRef = useRef<SpeakStatus>('idle');
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [micOn, setMicOn] = useState(false);
  const canRecognise = recognitionSupported();

  const set = (s: SpeakStatus) => { statusRef.current = s; setStatus(s); };

  useEffect(() => {
    if (status !== 'listening') return;
    const id = setInterval(() => setElapsedMs(Date.now() - startedAt.current - pausedMs.current), 250);
    return () => clearInterval(id);
  }, [status]);

  useEffect(() => () => { mic.current?.close(); rec.current?.setActive(false); }, []);

  /** Ask for the microphone. 'off' means audio analysis is disabled or unsupported; recognition may still work. */
  const prepare = useCallback(async (): Promise<'ok' | 'off' | 'failed'> => {
    setError('');
    if (!analyseAudio || !micSupported()) return 'off';
    try {
      if (!mic.current) mic.current = new Mic();
      await mic.current.open();
      setMicOn(true);
      return 'ok';
    } catch (e: any) {
      mic.current = null;
      setMicOn(false);
      setError(e?.name === 'NotAllowedError' ? ERRORS['not-allowed'] : e?.name === 'NotFoundError' ? ERRORS['audio-capture'] : 'The microphone could not be opened.');
      return 'failed';
    }
  }, [analyseAudio]);

  const start = useCallback((skipRecognition = false) => {
    setText(''); setInterim(''); setElapsedMs(0);
    startedAt.current = Date.now();
    pausedMs.current = 0;
    mic.current?.begin(true);
    if (canRecognise && !skipRecognition) {
      rec.current = new Recognizer(
        (fin, int) => { setText(fin); setInterim(int); },
        (code) => setError(ERRORS[code] || 'Speech recognition stopped unexpectedly.'),
      );
      rec.current.start();
    }
    set('listening');
  }, [canRecognise]);

  const pause = useCallback(() => {
    if (statusRef.current !== 'listening') return;
    pausedAt.current = Date.now();
    mic.current?.pause();
    rec.current?.setActive(false);
    set('paused');
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== 'paused') return;
    pausedMs.current += Date.now() - pausedAt.current;
    mic.current?.resume();
    rec.current?.setActive(true);
    set('listening');
  }, []);

  const stop = useCallback(async (typedText?: string): Promise<Capture> => {
    if (statusRef.current === 'paused') pausedMs.current += Date.now() - pausedAt.current;
    const wall = Date.now() - startedAt.current - pausedMs.current;
    set('idle');
    const [seg, heard] = await Promise.all([
      mic.current ? mic.current.end() : Promise.resolve(null),
      rec.current ? rec.current.stop() : Promise.resolve({ text: '', confidence: null as number | null }),
    ]);
    rec.current = null;
    const typed = !!typedText?.trim() && !heard.text;
    const finalText = (heard.text || typedText || '').trim();
    const words = tokens(finalText).length;
    const durationMs = typed ? null : seg && seg.spoke ? seg.durationMs : heard.text ? wall : null;
    const metrics: AnswerMetrics = {
      words,
      durationMs,
      speakingMs: seg && seg.spoke && !typed ? seg.speakingMs : null,
      wpm: durationMs && durationMs >= 3000 && words ? Math.round(words / (durationMs / 60000)) : null,
      pauses: seg && seg.spoke && !typed ? seg.pauses : null,
      longPauses: seg && seg.spoke && !typed ? seg.longPauses : null,
      longestPauseMs: seg && seg.spoke && !typed ? seg.longestPauseMs : null,
      pitchRangeSt: seg && !typed ? seg.pitchRangeSt : null,
      pitchSdSt: seg && !typed ? seg.pitchSdSt : null,
      confidence: typed ? null : heard.confidence,
      fillers: countFillers(finalText).count,
    };
    setText(finalText); setInterim('');
    return { text: finalText, metrics, blob: seg?.blob ?? null, typed };
  }, []);

  const release = useCallback(() => {
    rec.current?.setActive(false);
    rec.current = null;
    mic.current?.close();
    mic.current = null;
    setMicOn(false);
    set('idle');
  }, []);

  const getLevel = useCallback(() => mic.current?.level ?? 0, []);

  /** How long the candidate has been silent since they last spoke. */
  const getSilence = useCallback((): { ms: number; spoke: boolean } => {
    if (mic.current) return mic.current.silence();
    const r = rec.current;
    if (!r || !r.lastUpdate) return { ms: 0, spoke: false };
    return { ms: Date.now() - r.lastUpdate, spoke: true };
  }, []);

  return { status, text, interim, error, setError, elapsedMs, micOn, canRecognise, prepare, start, pause, resume, stop, release, getLevel, getSilence };
}

export type Speaking = ReturnType<typeof useSpeaking>;
