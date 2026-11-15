import { useEffect, useRef } from 'react';
import { fmtBand, useWidth } from './ui';

/**
 * The band ruler: the 0–9 IELTS scale drawn as a measuring rule, with the
 * estimate as a filled marker and the target as an open one.
 */
export function BandRuler({ value, target, label, compact }: { value: number; target?: number; label?: string; compact?: boolean }) {
  const pct = (b: number) => `${(b / 9) * 100}%`;
  return (
    <div className={`ruler${compact ? ' ruler-compact' : ''}`} role="img" aria-label={`${label ? label + ': ' : ''}band ${fmtBand(value)}${target ? `, target ${fmtBand(target)}` : ''}`}>
      <div className="ruler-track">
        <div className="ruler-fill" style={{ width: pct(value) }} />
        {Array.from({ length: 19 }, (_, i) => <span key={i} className={`ruler-tick${i % 2 ? ' half' : ''}`} style={{ left: pct(i / 2) }} />)}
        {target ? <span className="ruler-target" style={{ left: pct(target) }} title={`Target ${fmtBand(target)}`} /> : null}
        <span className="ruler-mark" style={{ left: pct(value) }} />
      </div>
      {compact ? null : (
        <div className="ruler-scale" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n} style={{ left: pct(n) }}>{n}</span>)}
        </div>
      )}
    </div>
  );
}

export function TrendChart({ points, target }: { points: { label: string; value: number }[]; target: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const h = 200, padL = 28, padR = 44, padT = 12, padB = 26;
  const lo = Math.max(0, Math.floor(Math.min(target, ...points.map((p) => p.value)) - 1));
  const hi = 9;
  const x = (i: number) => (points.length === 1 ? padL + (w - padL - padR) / 2 : padL + (i / (points.length - 1)) * (w - padL - padR));
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
  const grid = [];
  for (let b = lo; b <= hi; b++) grid.push(b);
  const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(w / 90))));
  return (
    <div ref={ref} className="chart">
      {w > 0 ? (
        <svg width={w} height={h} role="img" aria-label={`Overall band across ${points.length} mock tests. Latest ${fmtBand(points[points.length - 1].value)}, target ${fmtBand(target)}.`}>
          {grid.map((b) => (
            <g key={b}>
              <line x1={padL} x2={w - padR} y1={y(b)} y2={y(b)} className="chart-grid" />
              <text x={padL - 8} y={y(b) + 4} textAnchor="end" className="chart-axis">{b}</text>
            </g>
          ))}
          <line x1={padL} x2={w - padR} y1={y(target)} y2={y(target)} className="chart-target" />
          <text x={w - padR + 6} y={y(target) + 4} className="chart-target-label">Target</text>
          {points.length > 1 ? <polyline className="chart-line" fill="none" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} /> : null}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 5 : 3.5} className="chart-dot"><title>{`${p.label}: ${fmtBand(p.value)}`}</title></circle>
              {i === points.length - 1 ? <text x={x(i)} y={y(p.value) - 11} textAnchor="middle" className="chart-value">{fmtBand(p.value)}</text> : null}
              {i % every === 0 || i === points.length - 1 ? <text x={x(i)} y={h - 6} textAnchor="middle" className="chart-axis">{p.label}</text> : null}
            </g>
          ))}
        </svg>
      ) : <div style={{ height: h }} />}
    </div>
  );
}

export function WeekBars({ weeks }: { weeks: { label: string; minutes: number }[] }) {
  const max = Math.max(10, ...weeks.map((w) => w.minutes));
  return (
    <div className="bars" role="img" aria-label={`Minutes of speaking practice per week: ${weeks.map((w) => `${w.label} ${w.minutes}`).join(', ')}`}>
      {weeks.map((w, i) => (
        <div className="bar-col" key={i}>
          <span className="bar-val">{w.minutes || ''}</span>
          <div className="bar" style={{ height: `${Math.max(w.minutes ? 3 : 0, (w.minutes / max) * 100)}%` }} />
          <span className="bar-label">{w.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Live input level drawn as a scrolling bar waveform. */
export function Waveform({ getLevel, active, height = 56 }: { getLevel: () => number; active: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hist: number[] = [];
    let raf = 0, last = 0;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < (reduce ? 200 : 45)) return;
      last = t;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.floor(w / 5);
      hist.push(active ? Math.min(1, getLevel() * 9) : 0);
      while (hist.length > n) hist.shift();
      ctx.clearRect(0, 0, w, h);
      const css = getComputedStyle(canvas);
      ctx.fillStyle = active ? css.getPropertyValue('--brand') : css.getPropertyValue('--line-strong');
      for (let i = 0; i < n; i++) {
        const v = hist[hist.length - n + i] ?? 0;
        const bh = Math.max(2, v * (h - 4));
        ctx.fillRect(i * 5, (h - bh) / 2, 3, bh);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [getLevel, active]);
  return <canvas ref={ref} className="wave" style={{ height }} aria-hidden="true" />;
}
