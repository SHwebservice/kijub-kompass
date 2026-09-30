import { Link } from 'react-router-dom';
import { summeBadges, type Kachel, type KachelGruppe } from '../../heute/kacheln';
import { Badge } from '../../components/ui';

function Inhalt({ k }: { k: Kachel }) {
  return (
    <>
      <span className="kachel__icon" aria-hidden="true">{k.icon}</span>
      <span className="kachel__name">{k.label}</span>
      {k.badge ? <span className="kachel__badge"><Badge ton="warning"><span className="sr-only">Offen: </span>{k.badge}</Badge></span> : null}
    </>
  );
}

/** Eine Kachel: direkter Link, oder – bei mehreren Zielen (z. B. mehrere Freizeiten) – ein aufklappbares Menü mit den Zielen. */
function KachelEintrag({ k }: { k: Kachel }) {
  if (!k.ziele) return <li><Link className="kachel" to={k.pfad}><Inhalt k={k} /></Link></li>;
  return (
    <li>
      <details className="kachel kachel--auswahl">
        <summary><Inhalt k={k} /></summary>
        <ul className="kachel__ziele" aria-label={`${k.label}: Auswahl`}>
          {k.ziele.map((z) => <li key={z.pfad}><Link to={z.pfad}>{z.label}</Link></li>)}
          <li><Link to={k.pfad} className="kachel__alle">Alle anzeigen</Link></li>
        </ul>
      </details>
    </li>
  );
}

/**
 * Schnellzugriff: alle wichtigen Funktionen der Rollen der Person als Kacheln, nach Bereichen gruppiert.
 * Die Verwaltung der Koordination ist eingeklappt und zeigt die Zahl offener Aufgaben.
 */
export function Schnellzugriff({ gruppen }: { gruppen: KachelGruppe[] }) {
  return (
    <nav aria-label="Schnellzugriff" className="stack">
      {gruppen.map((g) => {
        const liste = (
          <ul className="kacheln" aria-label={g.titel}>
            {g.kacheln.map((k) => <KachelEintrag key={k.id} k={k} />)}
          </ul>
        );
        if (g.id !== 'verwaltung') return <section key={g.id}><h2 className="kacheln__titel">{g.titel}</h2>{liste}</section>;
        const offen = summeBadges(g);
        return (
          <details key={g.id} className="kacheln__gruppe" open={offen > 0}>
            <summary><h2 className="kacheln__titel" style={{ display: 'inline' }}>{g.titel}</h2>{offen > 0 && <> <Badge ton="warning">{offen} offen</Badge></>}</summary>
            {liste}
          </details>
        );
      })}
    </nav>
  );
}
