import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fehlerText } from '../../lib/fehler';
import { formatTagLang } from '../../freizeiten/logik';
import { jeGruppe, type FeedEintrag, type FeedGruppe } from '../../heute/feed';
import { Alert, Badge, Button, EmptyState } from '../../components/ui';

const uhrzeit = (iso: string) => {
  const d = new Date(iso);
  return `${formatTagLang(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
};

/** Eine Karte im Feed: die ganze Karte ist ein Link; der Knopf darunter benennt nur, was dort passiert. */
export function FeedKarte({ e }: { e: FeedEintrag }) {
  return (
    <li className={`feed__karte feed__karte--${e.ton}`}>
      <span className="feed__icon" aria-hidden="true">{e.icon}</span>
      <div className="feed__inhalt">
        <div className="feed__kopf">
          <Link className="feed__titel" to={e.link}>{e.titel}</Link>
          {e.zahl !== undefined && <Badge ton="warning">{e.zahl}</Badge>}
        </div>
        {e.text && <div className="feed__text">{e.text}</div>}
        {e.zeilen && <ul className="feed__zeilen" aria-label={`Tagesprogramm ${e.titel}`}>{e.zeilen.map((z) => <li key={z}>{z}</li>)}</ul>}
        {e.aktion && <span className="feed__aktion" aria-hidden="true">{e.aktion} ›</span>}
      </div>
    </li>
  );
}

interface Props {
  heute: string;
  eintraege: FeedEintrag[];
  /** Zeitpunkt des letzten Besuchs (null = erster Besuch, dann gibt es kein „Neu“). */
  seit: string | null;
  neuGesamt: number;
  /** „Alles gesehen“ (vermerkt den Besuch und lädt neu). */
  gesehen: () => Promise<void>;
  /** Noch nichts geladen: dann keine „Alles erledigt“-Meldung. */
  laedt: boolean;
}

const TITEL: Record<FeedGruppe, string> = { erledigen: 'Zu erledigen', heute: 'Heute', neu: 'Neu seit deinem letzten Besuch' };

/** Der Feed der Startseite in drei Abschnitten: Zu erledigen, Heute, Neu. Leere Abschnitte fehlen. */
export function Feed({ heute, eintraege, seit, neuGesamt, gesehen, laedt }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function quittieren() {
    setFehler(null); setArbeitet(true);
    try { await gesehen(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  const gruppen = (['erledigen', 'heute', 'neu'] as const).filter((g) => jeGruppe(eintraege, g).length > 0);
  if (gruppen.length === 0) {
    return laedt ? null : <EmptyState icon="✅" titel="Gerade ist nichts offen">Neue Aufgaben und Neuigkeiten erscheinen hier.</EmptyState>;
  }

  return (
    <div className="stack">
      {gruppen.map((g) => {
        const liste = jeGruppe(eintraege, g);
        return (
          <section key={g} aria-labelledby={`feed-${g}`}>
            <h2 id={`feed-${g}`} className="feed__titelzeile">{g === 'heute' ? `Heute · ${formatTagLang(heute)}` : TITEL[g]}</h2>
            {g === 'neu' && seit && <p className="field__hint">Seit {uhrzeit(seit)} – ohne deine eigenen Änderungen.</p>}
            {g === 'neu' && fehler && <Alert ton="error">{fehler}</Alert>}
            <ul className="feed" aria-label={TITEL[g]}>
              {liste.map((e) => <FeedKarte key={e.id} e={e} />)}
            </ul>
            {g === 'neu' && neuGesamt > liste.length && <p className="field__hint">… und {neuGesamt - liste.length} weitere.</p>}
            {g === 'neu' && <Button klein laedt={arbeitet} onClick={() => void quittieren()}>Alles gesehen</Button>}
          </section>
        );
      })}
    </div>
  );
}
