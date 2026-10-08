import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { bewerbungAblehnen, bewerbungAnnehmen, offeneBewerbungen } from '../freizeiten/api';
import { sendePush } from '../mitteilungen/senden';
import { formatDatum, zeitraumText } from '../freizeiten/logik';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui';
import { BewerbungenZeitraum, BewerbungsFrist } from './BewerbungenZeitraum';

/**
 * Freizeitenkoordination: offene Bewerbungen für Freizeiten annehmen (mit Rolle: TeamerIn oder Leitung) oder ablehnen,
 * Bewerbungen für Ferienzeiten einer Freizeit zuordnen und die Bewerbungsfrist einstellen.
 */
export function Bewerbungen() {
  const liste = useLaden(offeneBewerbungen, 'offene-bewerbungen');
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [rollen, setRollen] = useState<Record<string, 'teamer' | 'leitung'>>({});

  async function entscheiden(id: string, annehmen: boolean, name: string, rolle: 'teamer' | 'leitung' = 'teamer') {
    setArbeitet(id); setFehler(null); setMeldung(null);
    try {
      await (annehmen ? bewerbungAnnehmen(id, rolle) : bewerbungAblehnen(id));
      if (annehmen) sendePush('bewerbung_angenommen', id);          // die Person erfährt, dass sie dabei ist (Absage bewusst ohne Mitteilung)
      setMeldung(annehmen ? (rolle === 'leitung' ? `${name} ist jetzt Leitung.` : `${name} ist jetzt im Team.`) : `Die Bewerbung von ${name} wurde abgelehnt.`);
      liste.neuLaden();
    } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(null); }
  }

  return (
    <>
      <p><Link to="/mehr">← Mehr</Link></p>
      <PageHeader titel="Bewerbungen" />
      {(liste.fehler || fehler) && <Alert ton="error">{liste.fehler ?? fehler}</Alert>}
      {meldung && <Alert ton="success">{meldung}</Alert>}
      <div className="stack">
      <Card>
      <h2>Bewerbungen für Freizeiten</h2>
      {liste.laedt && <Spinner />}
      {!liste.laedt && liste.daten?.length === 0 && <EmptyState icon="📭" titel="Keine offenen Bewerbungen" />}
      <ul className="list" aria-label="Bewerbungen für Freizeiten">
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
                <select aria-label={`Rolle für ${name}`} className="input" style={{ width: 'auto', minHeight: 36 }} value={rollen[b.id] ?? 'teamer'} disabled={arbeitet === b.id}
                  onChange={(e) => setRollen({ ...rollen, [b.id]: e.target.value as 'teamer' | 'leitung' })}>
                  <option value="teamer">TeamerIn</option>
                  <option value="leitung">Leitung</option>
                </select>
                <Button klein variante="primary" laedt={arbeitet === b.id} onClick={() => void entscheiden(b.id, true, name, rollen[b.id] ?? 'teamer')}>Annehmen</Button>
                <Button klein disabled={arbeitet === b.id} onClick={() => void entscheiden(b.id, false, name)}>Ablehnen</Button>
              </div>
            </li>
          );
        })}
      </ul>
      </Card>
      <BewerbungenZeitraum />
      <BewerbungsFrist />
      </div>
    </>
  );
}
