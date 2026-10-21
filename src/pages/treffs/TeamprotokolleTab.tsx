import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { formatDatum } from '../../freizeiten/logik';
import { ortszeit } from '../../tagesprotokoll/logik';
import { holeTreffTeam, type TreffDetailDaten, type TreffTeamMitglied } from '../../treffs/api';
import { darfTreffVerwalten, sortiereTreffTeam } from '../../treffs/logik';
import { listeTeamprotokolle, loescheTeamprotokoll, vermerkeGelesen } from '../../teamprotokolle/api';
import { ARTEN, istGelesen, istUngelesen, nochNichtGelesen, verfasser, wirklichGelesen, wurdeGeaendert, type Teamprotokoll } from '../../teamprotokolle/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../../components/ui';
import { TeamprotokollInhalt } from './TeamprotokollInhalt';
import { TeamprotokollFormular } from './TeamprotokollFormular';

const name = (m: TreffTeamMitglied) => `${m.vorname} ${m.nachname}`;

/** Ein Protokoll lesen. Beim Öffnen gilt es als gelesen; die Treffleitung sieht, wer es schon gelesen hat. */
function LesenSheet({ p, team, ichId, verwaltung, schliessen, bearbeiten, geaendert }: {
  p: Teamprotokoll; team: TreffTeamMitglied[]; ichId: string; verwaltung: boolean; schliessen: () => void; bearbeiten: () => void; geaendert: () => void;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const namen = Object.fromEntries(team.map((m) => [m.person_id, name(m)]));
  const wer = (id: string | null) => (id ? namen[id] ?? 'jemand' : 'jemand');
  const offen = nochNichtGelesen(p, team.map((m) => m.person_id));
  const gelesen = wirklichGelesen(p);
  const neuImTeam = p.vorEintritt.filter((id) => namen[id]);

  // Gelesen vermerken: nicht bei Entwürfen, nicht für die meldende Person; „vor Eintritt“ wird zu echtem „gelesen“
  const vermerkt = useRef(false);
  useEffect(() => {
    const vorEintritt = p.vorEintritt.includes(ichId);
    if (vermerkt.current || p.entwurf || verfasser(p) === ichId || (istGelesen(p, ichId) && !vorEintritt)) return;
    vermerkt.current = true;
    vermerkeGelesen(p.id, ichId, vorEintritt).then(geaendert).catch(() => undefined);   // gelesen vermerken stört das Lesen nie
  }, [p, ichId, geaendert]);

  async function loeschen() {
    if (!window.confirm(`Das Protokoll „${p.titel}“ löschen?`)) return;
    try { await loescheTeamprotokoll(p.id); geaendert(); schliessen(); } catch (e) { setFehler(fehlerText(e)); }
  }

  return (
    <Sheet titel={p.titel} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {p.entwurf && <Alert ton="info">Entwurf – nur Treffleitung und Koordination sehen ihn. Zum Veröffentlichen auf „Bearbeiten“ tippen.</Alert>}
      <p className="list__meta">
        <Badge ton="accent">{ARTEN[p.art].icon} {ARTEN[p.art].label}</Badge>
        <span>{formatDatum(p.datum)}</span>
        {p.erstellt_von && namen[p.erstellt_von] && <span>von {namen[p.erstellt_von]}</span>}
      </p>
      {wurdeGeaendert(p) && <p className="field__hint">Zuletzt geändert am {ortszeit(p.updated_at)} von {wer(p.bearbeitet_von)}.</p>}
      {p.anwesend.length > 0 && <p className="field__hint">Anwesend: {p.anwesend.map((id) => wer(id)).join(', ')}</p>}
      <TeamprotokollInhalt p={p} />
      {verwaltung && !p.entwurf && (
        <section aria-label="Gelesen" style={{ marginTop: 'var(--space-4)' }}>
          <h3>Gelesen</h3>
          <p>{gelesen.length > 0 ? gelesen.map((id) => wer(id)).join(', ') : 'Noch niemand.'}</p>
          {offen.length > 0 && <p className="field__hint">Noch nicht gelesen: {offen.map((id) => wer(id)).join(', ')}</p>}
          {neuImTeam.length > 0 && <p className="field__hint">Erst danach ins Team gekommen: {neuImTeam.map((id) => wer(id)).join(', ')}</p>}
        </section>
      )}
      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        {verwaltung && <Button variante={p.entwurf ? 'primary' : 'standard'} onClick={bearbeiten}>Bearbeiten</Button>}
        {verwaltung && <Button variante="danger" onClick={() => void loeschen()}>Löschen</Button>}
        <Button onClick={schliessen}>Schließen</Button>
      </div>
    </Sheet>
  );
}

/**
 * Teamprotokolle eines Treffs: Teambesprechungen, Informationen und Sonstiges zum Nachlesen für alle im Treff.
 * Treffleitung und Treffkoordination legen sie an (auch als Entwurf); ungelesene sind markiert.
 */
export function TeamprotokolleTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const { ich } = useAuth();
  const liste = useLaden(() => listeTeamprotokolle(t.id), `teamprotokolle-${t.id}`);
  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  useLive(['treff_teamprotokolle', 'treff_teamprotokoll_gelesen'], () => liste.neuLaden());
  const [lesen, setLesen] = useState<string | null>(null);
  const [formular, setFormular] = useState<{ vorhanden: Teamprotokoll | null } | null>(null);
  if (!ich) return null;

  const verwaltung = darfTreffVerwalten(rolle);
  const mitglieder = sortiereTreffTeam(team.daten ?? []);
  const protokolle = liste.daten ?? [];
  const offen = protokolle.find((p) => p.id === lesen) ?? null;
  const ungelesen = protokolle.filter((p) => istUngelesen(p, ich.id)).length;
  const teamIds = mitglieder.map((m) => m.person_id);

  return (
    <div className="stack">
      <Card>
        <h2>Teamprotokolle</h2>
        <p>Teambesprechungen und wichtige Informationen zum Nachlesen für alle im Treff.{ungelesen > 0 ? ` ${ungelesen === 1 ? 'Ein Protokoll ist' : `${ungelesen} Protokolle sind`} für dich noch ungelesen.` : ''}</p>
        {verwaltung && <Button variante="primary" onClick={() => setFormular({ vorhanden: null })}>+ Neues Teamprotokoll</Button>}
      </Card>
      {(liste.fehler || team.fehler) && <Alert ton="error">{liste.fehler ?? team.fehler}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && protokolle.length === 0 && <EmptyState icon="🗂️" titel="Noch keine Teamprotokolle">{verwaltung ? 'Lege das erste mit „Neues Teamprotokoll“ an.' : undefined}</EmptyState>}
      <ul className="list" aria-label="Teamprotokolle">
        {protokolle.map((p) => {
          const neu = istUngelesen(p, ich.id);
          const fehlen = nochNichtGelesen(p, teamIds).length;
          return (
            <li key={p.id} className={`list__item${neu ? ' teamprotokoll--neu' : ''}${p.entwurf ? ' teamprotokoll--entwurf' : ''}`}>
              <div className="list__main">
                <button type="button" className="list__title linklike" onClick={() => setLesen(p.id)}>{p.titel}</button>
                <div className="list__meta">
                  {p.entwurf && <Badge>Entwurf</Badge>}
                  <span>{ARTEN[p.art].icon} {ARTEN[p.art].label}</span>
                  <span>{formatDatum(p.datum)}</span>
                  {neu && <Badge ton="warning">ungelesen</Badge>}
                  {verwaltung && !p.entwurf && <span>{fehlen === 0 ? 'von allen gelesen' : `${fehlen} noch nicht gelesen`}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {offen && (
        <LesenSheet key={offen.id} p={offen} team={mitglieder} ichId={ich.id} verwaltung={verwaltung} schliessen={() => setLesen(null)}
          bearbeiten={() => { setLesen(null); setFormular({ vorhanden: offen }); }} geaendert={liste.neuLaden} />
      )}
      {formular && (
        <TeamprotokollFormular treffId={t.id} vorhanden={formular.vorhanden} team={mitglieder} schliessen={() => setFormular(null)} gespeichert={() => liste.neuLaden()} />
      )}
    </div>
  );
}
