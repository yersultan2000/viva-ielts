import { useEffect, useState } from 'react';
import { useStore } from './store';
import type { CueCard, TargetBand } from './types';

/**
 * Client for the Viva backend. The backend holds the LLM API key; this file only
 * ever knows the backend's public URL. With no URL, or an unreachable one, the
 * app runs in demo mode.
 */

export interface BackendInfo {
  ok: boolean;
  provider?: string;
  model?: string;
  error?: string;
}

const clean = (url: string) => url.trim().replace(/\/+$/, '');
const cache = new Map<string, { at: number; info: BackendInfo }>();

export async function checkBackend(url: string, force = false): Promise<BackendInfo> {
  const base = clean(url);
  if (!base) return { ok: false, error: 'No backend URL is set.' };
  const hit = cache.get(base);
  if (!force && hit && Date.now() - hit.at < 60000) return hit.info;
  let info: BackendInfo;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${base}/health`, { signal: ctl.signal });
    clearTimeout(t);
    const body = await res.json().catch(() => ({}));
    info = res.ok && body.ok ? { ok: true, provider: body.provider, model: body.model } : { ok: false, error: body.error || `The backend answered with status ${res.status}.` };
  } catch {
    info = { ok: false, error: 'The backend could not be reached. Check the URL and that its CORS settings allow this site.' };
  }
  cache.set(base, { at: Date.now(), info });
  return info;
}

async function post<T>(url: string, path: string, body: unknown, timeoutMs = 90000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${clean(url)}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || `The AI service returned an error (${res.status}).`);
    return data as T;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('The AI service took too long to respond.');
    throw e instanceof Error ? e : new Error('The AI service could not be reached.');
  } finally {
    clearTimeout(t);
  }
}

export interface ExamPlan {
  part1: { topic: string; questions: string[] }[];
  cueCard: CueCard;
}

export const api = {
  plan: (url: string, body: { avoid: string[]; topics: number }) => post<ExamPlan>(url, '/api/plan', body, 45000),
  examiner: (url: string, body: { part: number; theme: string; history: { role: string; text: string }[]; asked: string[]; fallback: string[] }) =>
    post<{ text: string }>(url, '/api/examiner', body, 20000),
  assess: (url: string, body: { target: TargetBand; answers: unknown[]; measurements: unknown }) => post<unknown>(url, '/api/assess', body, 120000),
  generate: <T,>(url: string, body: { kind: 'questions' | 'cuecard' | 'sample'; part?: number; topic?: string; question?: string; count?: number }) =>
    post<T>(url, '/api/generate', body, 45000),
};

export type Mode = 'checking' | 'ai' | 'demo';

export function useBackend(): { mode: Mode; info: BackendInfo | null; url: string; recheck: () => void } {
  const url = useStore().settings.backendUrl;
  const [info, setInfo] = useState<BackendInfo | null>(url ? null : { ok: false });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    if (!url.trim()) { setInfo({ ok: false }); return; }
    setInfo(null);
    checkBackend(url, n > 0).then((i) => live && setInfo(i));
    return () => { live = false; };
  }, [url, n]);
  return { mode: info == null ? 'checking' : info.ok ? 'ai' : 'demo', info, url, recheck: () => setN((x) => x + 1) };
}
