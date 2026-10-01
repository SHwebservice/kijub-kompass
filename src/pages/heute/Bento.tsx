import { Link } from 'react-router-dom';
import type { BentoKachel } from '../../heute/bento';

/** Das Kachelraster der Koordination: Zahlen auf einen Blick, jede Kachel ein Link. */
export function Bento({ kacheln }: { kacheln: BentoKachel[] }) {
  if (kacheln.length === 0) return null;
  return (
    <section aria-labelledby="bento-titel">
      <h2 id="bento-titel" className="feed__titelzeile">Überblick</h2>
      <ul className="bento" aria-label="Überblick der Koordination">
        {kacheln.map((k) => (
          <li key={k.id} className={`bento__kachel bento__kachel--${k.ton}${k.breit ? ' bento__kachel--breit' : ''}`}>
            <Link to={k.link}>
              <span className="bento__label">{k.label}</span>
              <span className={`bento__zahl${/^\d+$/.test(k.zahl) ? '' : ' bento__zahl--text'}`}>{k.zahl}</span>
              <span className="bento__unter">{k.unter}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
