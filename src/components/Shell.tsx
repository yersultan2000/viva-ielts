import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { ModeBadge } from './ui';
import { useBackend } from '../lib/api';
import { applyTheme, update, useStore } from '../lib/store';

const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: 'chart' },
  { path: '/exam', label: 'Mock test', icon: 'exam' },
  { path: '/practice', label: 'Practice', icon: 'practice' },
  { path: '/notebook', label: 'Notebook', icon: 'book' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

export function Wordmark({ href = '#/' }: { href?: string }) {
  return (
    <a className="wordmark" href={href} aria-label="Viva home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="var(--brand)" />
        <path d="M8 10l8 13 8-13" fill="none" stroke="var(--on-brand)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="8.5" r="2" fill="var(--marker)" />
      </svg>
      <span>Viva</span>
    </a>
  );
}

export function ThemeToggle() {
  const { settings } = useStore();
  const dark = document.documentElement.dataset.theme === 'dark';
  const flip = () => {
    const next = dark ? 'light' : 'dark';
    update((s) => ({ ...s, settings: { ...s.settings, theme: next } }));
    applyTheme(next);
  };
  return (
    <button className="btn btn-quiet btn-md btn-icon" onClick={flip} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`} title={`Theme: ${settings.theme}`}>
      <Icon name={dark ? 'sun' : 'moon'} />
    </button>
  );
}

export function Shell({ path, children }: { path: string; children: ReactNode }) {
  const { mode } = useBackend();
  const current = (p: string) => path === p || path.startsWith(p + '/') || (p === '/dashboard' && path.startsWith('/results'));
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <aside className="rail">
        <Wordmark />
        <nav aria-label="Main">
          {NAV.map((n) => (
            <a key={n.path} href={`#${n.path}`} className="rail-link" aria-current={current(n.path) ? 'page' : undefined}>
              <Icon name={n.icon} />
              <span>{n.label}</span>
            </a>
          ))}
        </nav>
        <div className="rail-foot">
          <ModeBadge mode={mode} />
          <ThemeToggle />
        </div>
      </aside>
      <header className="topbar">
        <Wordmark />
        <div className="row">
          <ModeBadge mode={mode} />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="main">{children}</main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.path} href={`#${n.path}`} className="tab" aria-current={current(n.path) ? 'page' : undefined}>
            <Icon name={n.icon} size={20} />
            <span>{n.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub ? <p className="page-sub">{sub}</p> : null}
      </div>
      {actions ? <div className="row wrap">{actions}</div> : null}
    </header>
  );
}
