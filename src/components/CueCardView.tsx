import type { ReactNode } from 'react';
import type { CueCard } from '../lib/types';

/** The Part 2 task card, drawn as the physical card a candidate is handed. */
export function CueCardView({ card, footer }: { card: CueCard; footer?: ReactNode }) {
  return (
    <article className="cue-card" aria-label="Part 2 task card">
      <p className="cue-prompt">{card.prompt}</p>
      <p className="cue-say">You should say:</p>
      <ul className="cue-points">
        {card.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
      <p className="cue-closing">{card.closing}</p>
      {footer ? <div className="cue-footer">{footer}</div> : null}
    </article>
  );
}
