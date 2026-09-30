import { useState } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import {
  holeTeam, listePersonen, teamEntfernen, teamHinzufuegen, teamRolleAendern, type FreizeitDetailDaten, type TeamMitglied,
} from '../../freizeiten/api';
import { ROLLEN_LABEL, sortiereTeam } from '../../freizeiten/logik';
import type { RolleInFreizeit } from '../../lib/rollen';
import { Alert, Badge, Button, Card, EmptyState, SelectField, Spinner } from '../../components/ui';

function Kontakt({ m }: { m: TeamMitglied }) {
  const teile = [
    m.mail && <a key="m" href={`mailto:${m.mail}`}>{m.mail}</a>,
    m.telefon && <a key="t" href={`tel:${m.telefon.replace(/\s/g, '')}`}>{m.telefon}</a>,
    m.ernaehrung && <span key="e">{m.ernaehrung}</span>,
  ].filter(Boolean);
  const tzk = m.kategorie === 'TZK' && (m.tzk_regeltage || m.tzk_max_stunden)
    ? [m.tzk_regeltage && `Regeltage: ${m.tzk_regeltage}`, m.tzk_max_stunden && `max. ${m.tzk_max_stunden} h/Monat`].filter(Boolean).join(' · ')
    : '';
  if (!teile.length && !m.notizen && !tzk) return null;
  return (
    <>
      {teile.length > 0 && <div className="list__meta">{teile.map((t, i) => <span key={i}>{t}</span>)}</div>}
      {tzk && <div className="list__meta">{tzk}</div>}
      {m.notizen && <div className="list__meta" style={{ whiteSpace: 'pre-line' }}>{m.notizen}</div>}
    </>
  );
}

/** Team der Freizeit. Kontaktdaten kommen nur an, wenn die Datenbank sie freigibt (Leitung, Koordination). Die Koordination verwaltet das Team. */
export function TeamTab({ freizeit: f, rolle }: { freizeit: FreizeitDetailDaten; rolle: RolleInFreizeit }) {
  const team = useLaden(() => holeTeam(f.id), `team-${f.id}`);
  const verwaltung = rolle === 'koordination';
  const personen = useLaden(async () => (verwaltung ? listePersonen() : []), `personen-${verwaltung}`);
  const [neuePerson, setNeuePerson] = useState('');
  const [neueRolle, setNeueRolle] = useState<'teamer' | 'leitung'>('teamer');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function ausfuehren(aktion: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await aktion(); team.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  const mitglieder = sortiereTeam(team.daten ?? []);
  const imTeam = new Set(mitglieder.map((m) => m.person_id));
  const kandidaten = (personen.daten ?? []).filter((p) => p.aktiv && !imTeam.has(p.id));

  return (
    <div className="stack">
      {team.fehler && <Alert ton="error">{team.fehler}</Alert>}
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {team.laedt && <Spinner />}
      {!team.laedt && mitglieder.length === 0 && <EmptyState icon="👥" titel="Noch niemand zugeordnet" />}

      {mitglieder.length > 0 && (
        <ul className="list">
          {mitglieder.map((m) => (
            <li key={m.person_id} className="list__item">
              <div className="list__main">
                <div className="list__title">{m.vorname} {m.nachname}</div>
                <div className="list__meta">
                  <Badge ton={m.rolle === 'leitung' ? 'accent' : 'neutral'}>{ROLLEN_LABEL[m.rolle]}</Badge>
                  <Badge>{m.kategorie}</Badge>
                </div>
                <Kontakt m={m} />
              </div>
              {verwaltung && (
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <select aria-label={`Rolle von ${m.vorname} ${m.nachname}`} className="input" style={{ width: 'auto', minHeight: 36 }} value={m.rolle} disabled={arbeitet}
                    onChange={(e) => void ausfuehren(() => teamRolleAendern(f.id, m.person_id, e.target.value as 'leitung' | 'teamer'))}>
                    <option value="teamer">TeamerIn</option>
                    <option value="leitung">Leitung</option>
                  </select>
                  <Button klein variante="danger" disabled={arbeitet}
                    onClick={() => { if (window.confirm(`${m.vorname} ${m.nachname} aus dem Team von „${f.name}" entfernen?`)) void ausfuehren(() => teamEntfernen(f.id, m.person_id)); }}>
                    Entfernen
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {rolle === 'teamer' && <p className="field__hint">Kontaktdaten der anderen sehen nur die Leitung und die Koordination.</p>}

      {verwaltung && (
        <Card>
          <h2>Person zuordnen</h2>
          {personen.fehler && <Alert ton="error">{personen.fehler}</Alert>}
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 220px' }}>
              <SelectField label="Person" value={neuePerson} onChange={(e) => setNeuePerson(e.target.value)}>
                <option value="">– bitte wählen –</option>
                {kandidaten.map((p) => <option key={p.id} value={p.id}>{p.nachname}, {p.vorname} ({p.kategorie})</option>)}
              </SelectField>
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <SelectField label="Rolle" value={neueRolle} onChange={(e) => setNeueRolle(e.target.value as 'teamer' | 'leitung')}>
                <option value="teamer">TeamerIn</option>
                <option value="leitung">Leitung</option>
              </SelectField>
            </div>
            <div className="field">
              <Button variante="primary" disabled={!neuePerson || arbeitet}
                onClick={() => void ausfuehren(async () => { await teamHinzufuegen(f.id, neuePerson, neueRolle); setNeuePerson(''); })}>
                Zuordnen
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
