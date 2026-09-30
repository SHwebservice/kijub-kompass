import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { bewerbungAblehnen, bewerbungAnnehmen, offeneBewerbungen } from '../freizeiten/api';
import { formatDatum, zeitraumText } from '../freizeiten/logik';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '../components/ui';

/** Koordination: offene Bewerbungen annehmen (→ Zuordnung als TeamerIn) oder ablehnen. */
export function Bewerbungen() {
  const liste = useLaden(offeneBewerbungen, 'offene-bewerbungen');
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState<string | null>(null);

  async function entscheiden(id: string, annehmen: boolean, name: string) {
    setArbeitet(id); setFehler(null); setMeldung(null);
    try {
      await (annehmen ? bewerbungAnnehmen(id) : bewerbungAblehnen(id));
      setMeldung(annehmen ? `${name} ist jetzt im Team.` : `Die Bewerbung von ${name} wurde abgelehnt.`);
      liste.neuLaden();
    } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(null); }
  }

  return (
    <>
      <p><Link to="/mehr">← Mehr</Link></p>
      <PageHeader titel="Bewerbungen" />
      {(liste.fehler || fehler) && <Alert ton="error">{liste.fehler ?? fehler}</Alert>}
      {meldung && <Alert ton="success">{meldung}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && liste.daten?.length === 0 && <EmptyState icon="📭" titel="Keine offenen Bewerbungen" />}
      <ul className="list">
        {(liste.daten ?? []).map((b) => {
          const name = `${b.person.vorname} ${b.person.nachname}`;
          return (
            <li key={b.id} className="list__item">
              <div className="list__main">
                <div className="list__title">{name}</div>
                <div className="list__meta">
                  <Link to={`/freizeiten/${b.freizeit.id}`}>{b.freizeit.name}</Link>
                  <span>{zeitraumText(b.freizeit.start_datum, b.freizeit.ende_datum)}</span>
                  <Badge>{b.person.kategorie}</Badge>
                  <span>eingegangen {formatDatum(b.created_at.slice(0, 10))}</span>
                </div>
                {b.notiz && <div className="list__meta" style={{ whiteSpace: 'pre-line' }}>„{b.notiz}"</div>}
              </div>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <Button klein variante="primary" laedt={arbeitet === b.id} onClick={() => void entscheiden(b.id, true, name)}>Annehmen</Button>
                <Button klein disabled={arbeitet === b.id} onClick={() => void entscheiden(b.id, false, name)}>Ablehnen</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
