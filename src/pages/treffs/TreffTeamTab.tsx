import { useState } from 'react';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { listePersonen } from '../../freizeiten/api';
import { holeTreffTeam, treffTeamEntfernen, treffTeamRolleAendern, type TreffDetailDaten, type TreffTeamMitglied } from '../../treffs/api';
import { darfInTreff, sortiereTreffTeam, TREFF_ROLLEN_LABEL } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { treffTeamHinzufuegenViele } from '../../zuordnung/api';
import { kandidatenFuer, personName, TREFF_ROLLEN } from '../../zuordnung/logik';
import { MehrfachZuordnung } from '../zuordnung/MehrfachZuordnung';
import { Alert, Badge, Button, EmptyState, Spinner } from '../../components/ui';

function Kontakt({ m }: { m: TreffTeamMitglied }) {
  const teile = [
    m.mail && <a key="m" href={`mailto:${m.mail}`}>{m.mail}</a>,
    m.telefon && <a key="t" href={`tel:${m.telefon.replace(/\s/g, '')}`}>{m.telefon}</a>,
  ].filter(Boolean);
  const tzk = m.kategorie === 'TZK' && (m.tzk_regeltage || m.tzk_max_stunden)
    ? [m.tzk_regeltage && `Regeltage: ${m.tzk_regeltage}`, m.tzk_max_stunden && `max. ${m.tzk_max_stunden} h/Monat`].filter(Boolean).join(' · ')
    : '';
  if (!teile.length && !tzk) return null;
  return (
    <>
      {teile.length > 0 && <div className="list__meta">{teile.map((t, i) => <span key={i}>{t}</span>)}</div>}
      {tzk && <div className="list__meta">{tzk}</div>}
    </>
  );
}

/** Team des Treffs. Kontaktdaten kommen nur an, wenn die Datenbank sie freigibt (Treffleitung, Koordination). Die Koordination verwaltet das Team. */
export function TreffTeamTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const verwaltung = rolle === 'koordination';
  const personen = useLaden(async () => (verwaltung ? listePersonen() : []), `treff-personen-${verwaltung}`);
  useLive(['treff_team'], () => team.neuLaden());
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function ausfuehren(aktion: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await aktion(); team.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  const mitglieder = sortiereTreffTeam(team.daten ?? []);
  const imTeam = new Set(mitglieder.map((m) => m.person_id));
  const kandidaten = kandidatenFuer((personen.daten ?? []).filter((p) => darfInTreff(p.kategorie)), imTeam, { suche: '', kategorie: '' })
    .map((p) => ({ id: p.id, name: personName(p), kategorie: p.kategorie }));

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
                  <Badge ton={m.rolle === 'treffleitung' ? 'accent' : 'neutral'}>{TREFF_ROLLEN_LABEL[m.rolle]}</Badge>
                  <Badge>{m.kategorie}</Badge>
                </div>
                <Kontakt m={m} />
              </div>
              {verwaltung && (
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <select aria-label={`Rolle von ${m.vorname} ${m.nachname}`} className="input" style={{ width: 'auto', minHeight: 36 }} value={m.rolle} disabled={arbeitet}
                    onChange={(e) => void ausfuehren(() => treffTeamRolleAendern(t.id, m.person_id, e.target.value as 'betreuerin' | 'treffleitung'))}>
                    <option value="betreuerin">BetreuerIn</option>
                    <option value="treffleitung">Treffleitung</option>
                  </select>
                  <Button klein variante="danger" disabled={arbeitet}
                    onClick={() => { if (window.confirm(`${m.vorname} ${m.nachname} aus dem Team von „${t.name}“ entfernen?`)) void ausfuehren(() => treffTeamEntfernen(t.id, m.person_id)); }}>
                    Entfernen
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {rolle === 'betreuerin' && <p className="field__hint">Kontaktdaten der anderen sehen nur die Treffleitung und die Koordination.</p>}

      {verwaltung && (
        <>
          {personen.fehler && <Alert ton="error">{personen.fehler}</Alert>}
          <MehrfachZuordnung titel="Personen zuordnen" kandidaten={kandidaten} rollen={TREFF_ROLLEN}
            hinweis="Treffs sind für TZK, FSJ, Praktikum unbezahlt und Hauptamtliche offen."
            zuordnen={async (ids, r) => { await treffTeamHinzufuegenViele(t.id, ids, r); team.neuLaden(); }} />
        </>
      )}
    </div>
  );
}
