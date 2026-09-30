import type { PersonZeile } from '../../zuordnung/api';
import { personName } from '../../zuordnung/logik';
import { Badge, Button } from '../../components/ui';
import { zugangsStatus } from './Startpasswort';

interface Props {
  personen: PersonZeile[];
  /** Kurzfassung der Zuordnungen je Person („2 Freizeiten · 1 Treff“). */
  zusammenfassung: (p: PersonZeile) => string;
  /** Die eigene Person (kann sich nicht selbst entfernen). */
  ichId: string | undefined;
  /** Person, für die gerade ein Zugang eingerichtet wird. */
  arbeitet: string | null;
  oeffneZuordnung: (p: PersonZeile) => void;
  zugangEinrichten: (p: PersonZeile) => void;
  aktivieren: (p: PersonZeile) => void;
  entfernen: (p: PersonZeile) => void;
}

/** Die Liste der Personen mit Zugangsstatus, Koordinationsschildern und den Knöpfen je Person. */
export function PersonenListe({ personen, zusammenfassung, ichId, arbeitet, oeffneZuordnung, zugangEinrichten, aktivieren, entfernen }: Props) {
  return (
    <ul className="list">
      {personen.map((p) => {
        const s = zugangsStatus(p);
        const kurz = zusammenfassung(p);
        return (
          <li key={p.id} className="list__item">
            <div className="list__main">
              <div className="list__title">{p.vorname} {p.nachname}</div>
              <div className="list__meta">
                <span>{p.mail}</span>
                <Badge>{p.kategorie}</Badge>
                <Badge ton={s.ton}>{s.text}</Badge>
                {!p.aktiv && <Badge ton="danger">Deaktiviert</Badge>}
                {p.ist_freizeitkoordination && <Badge ton="accent">Freizeitenkoordination</Badge>}
                {p.ist_treffkoordination && <Badge ton="accent">Treffkoordination</Badge>}
                {kurz && <span>{kurz}</span>}
              </div>
            </div>
            <div className="row" style={{ gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
              <Button klein onClick={() => oeffneZuordnung(p)} aria-label={`Zuordnungen von ${personName(p)}`}>Zuordnungen</Button>
              {p.aktiv ? (
                <Button klein laedt={arbeitet === p.id} onClick={() => zugangEinrichten(p)}>
                  {p.auth_user_id ? 'Passwort zurücksetzen' : 'Zugang einrichten'}
                </Button>
              ) : (
                <Button klein onClick={() => aktivieren(p)}>Aktivieren</Button>
              )}
              {p.id !== ichId && <Button klein variante="danger" onClick={() => entfernen(p)}>Entfernen …</Button>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
