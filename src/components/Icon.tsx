const PATHS: Record<string, string> = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6 6h12v12H6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  right: 'M9 6l6 6-6 6',
  left: 'M15 6l-6 6 6 6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  exam: 'M8 3h8l4 4v14H4V3h4ZM8 11h8M8 15h8M8 7h3',
  practice: 'M4 12a8 8 0 1 0 8-8M4 4v5h5M12 8v4l3 2',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4ZM5 17a3 3 0 0 1 3-3h11',
  settings: 'M4 7h10M18 7h2M4 17h2M10 17h10M14 4.5v5M6 14.5v5',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  bookmark: 'M7 4h10v16l-5-4-5 4V4Z',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
  volume: 'M4 10v4h3l5 4V6l-5 4H4ZM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  printer: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  shuffle: 'M4 7h3c5 0 5 10 10 10h3M4 17h3c1.6 0 2.7-1 3.6-2.4M20 7h-3c-1.6 0-2.7 1-3.6 2.4M17 4l3 3-3 3M17 14l3 3-3 3',
  wifi: 'M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0M12 19.5v.01',
  alert: 'M12 4l9 16H3l9-16ZM12 10v4M12 17v.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 11v5M12 8v.01',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9Z',
  keyboard: 'M3 6h18v12H3zM7 10v.01M11 10v.01M15 10v.01M7 14h10',
};

export function Icon({ name, size = 18, filled = false }: { name: keyof typeof PATHS | string; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] || ''} />
    </svg>
  );
}
