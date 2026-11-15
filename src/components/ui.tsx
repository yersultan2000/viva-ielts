import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { Icon } from './Icon';
import { loadClip } from '../lib/store';
import type { Mode } from '../lib/api';

type BtnProps = {
  children?: ReactNode;
  variant?: 'primary' | 'ghost' | 'quiet' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  label?: string; // accessible name for icon-only buttons
  pressed?: boolean;
  type?: 'button' | 'submit';
  busy?: boolean;
};

export function Button({ children, variant = 'ghost', size = 'md', icon, href, onClick, disabled, label, pressed, type = 'button', busy }: BtnProps) {
  const cls = `btn btn-${variant} btn-${size}${children ? '' : ' btn-icon'}`;
  const inner = (
    <>
      {busy ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} /> : null}
      {children ? <span>{children}</span> : null}
    </>
  );
  if (href && !disabled) return <a className={cls} href={`#${href}`} aria-label={label}>{inner}</a>;
  return (
    <button className={cls} type={type} onClick={onClick} disabled={disabled || busy} aria-label={label} title={label} aria-pressed={pressed}>
      {inner}
    </button>
  );
}

export function Notice({ kind = 'info', title, children, action }: { kind?: 'info' | 'warn' | 'error'; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={kind === 'info' ? 'info' : 'alert'} />
      <div className="notice-body">
        {title ? <strong>{title}</strong> : null}
        {children ? <div>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}

export function ModeBadge({ mode }: { mode: Mode }) {
  if (mode === 'checking') return <span className="mode mode-checking"><span className="dot" />Checking AI examiner</span>;
  return mode === 'ai'
    ? <span className="mode mode-ai"><span className="dot" />AI examiner connected</span>
    : <a className="mode mode-demo" href="#/settings"><span className="dot" />Demo mode</a>;
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="seg-btn" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Plays a recording, either from a Blob in memory or from IndexedDB by id. */
export function Clip({ blob, id }: { blob?: Blob | null; id?: string }) {
  const [url, setUrl] = useState('');
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    let made = '';
    const use = (b: Blob | null) => {
      if (!live) return;
      if (!b) return setMissing(true);
      made = URL.createObjectURL(b);
      setUrl(made);
    };
    if (blob) use(blob);
    else if (id) loadClip(id).then(use);
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [blob, id]);
  if (missing) return <span className="muted small">Recording not stored on this device.</span>;
  if (!url) return null;
  return <audio className="clip" controls preload="metadata" src={url} />;
}

export const fmtTime = (sec: number) => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;
export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtBand = (b: number) => b.toFixed(1);

export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function download(name: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
