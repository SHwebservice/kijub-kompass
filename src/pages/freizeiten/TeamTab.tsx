import { useState } from 'react';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import {
  holeTeam, listeFreizeiten, listePersonen, teamEntfernen, teamRolleAendern, type FreizeitDetailDaten, type TeamMitglied,
} from '../../freizeiten/api';
import { ROLLEN_LABEL, sortiereTeam } from '../../freizeiten/logik';
import type { RolleInFreizeit } from '../../lib/rollen';
import { freizeitTeamHinzufuegen, listeFreizeitTeams, listeUeberschneidungsFreigaben } from '../../zuordnung/api';
import { FREIZEIT_ROLLEN, indexiere, kandidatenFuer, konfliktText, konflikteFuer, paarSchluessel, personName } from '../../zuordnung/logik';
import { MehrfachZuordnung } from '../zuordnung/MehrfachZuordnung';
import { Alert, Badge, Button, EmptyState, Spinner } from '../../components/ui';

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
  useLive(['freizeit_team'], () => team.neuLaden());
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function ausfuehren(aktion: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await aktion(); team.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  const mitglieder = sortiereTeam(team.daten ?? []);
  const imTeam = new Set(mitglieder.map((m) => m.person_id));
  // Für den Hinweis „zur selben Zeit schon woanders eingeteilt“: alle Freizeiten und Teams (nur für die Koordination geladen)
  /** Die akzeptierten Überschneidungen; ohne Recht oder bei einem Fehler gilt: keine (dann warnt der Hinweis wie bisher). */
  const akzeptierteLaden = async () => { try { return (await listeUeberschneidungsFreigaben()) ?? []; } catch { return []; } };
  const andere = useLaden(async () => (verwaltung ? {
    freizeiten: await listeFreizeiten(), teams: await listeFreizeitTeams(),
    // Bewusst akzeptierte Überschneidungen (nur die Freizeitenkoordination darf sie lesen; für andere ist die Liste leer)
    akzeptiert: new Set((await akzeptierteLaden()).map((x) => paarSchluessel(x.person_id, x.freizeit_a, x.freizeit_b))),
  } : null), `team-konflikte-${verwaltung}`);
  const zuordnungen = indexiere(andere.daten?.teams ?? [], []);
  const kandidaten = kandidatenFuer(personen.daten ?? [], imTeam, { suche: '', kategorie: '' }).map((p) => {
    const k = konflikteFuer(p.id, f, andere.daten?.freizeiten ?? [], zuordnungen, andere.daten?.akzeptiert);
    return { id: p.id, name: personName(p), kategorie: p.kategorie, ...(k.length ? { hinweis: `zur selben Zeit: ${k.map(konfliktText).join(', ')}` } : {}) };
  });

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
                  {m.kueche && <Badge>Küche</Badge>}
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
        <>
          {personen.fehler && <Alert ton="error">{personen.fehler}</Alert>}
          <MehrfachZuordnung titel="Personen zuordnen" kandidaten={kandidaten} rollen={FREIZEIT_ROLLEN}
            zuordnen={async (ids, r) => { await freizeitTeamHinzufuegen(f.id, ids, r); team.neuLaden(); andere.neuLaden(); }} />
        </>
      )}
    </div>
  );
}
