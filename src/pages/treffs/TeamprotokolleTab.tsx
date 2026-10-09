import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import { holeTreffTeam, type TreffDetailDaten, type TreffTeamMitglied } from '../../treffs/api';
import { darfTreffVerwalten, sortiereTreffTeam } from '../../treffs/logik';
import { listeTeamprotokolle, loescheTeamprotokoll, speichereTeamprotokoll, vermerkeGelesen } from '../../teamprotokolle/api';
import {
  ARTEN, eingabeAus, istGelesen, leeresProtokoll, MAX_TEXT, nochNichtGelesen, validiere, type Teamprotokoll, type TeamprotokollArt, type TeamprotokollEingabe,
} from '../../teamprotokolle/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button, Card, EmptyState, SelectField, Spinner, TextField } from '../../components/ui';

const name = (m: TreffTeamMitglied) => `${m.vorname} ${m.nachname}`;

/** Ein Protokoll lesen. Beim Öffnen gilt es als gelesen; die Treffleitung sieht, wer es schon gelesen hat. */
function LesenSheet({ p, team, ichId, verwaltung, schliessen, bearbeiten, geaendert }: {
  p: Teamprotokoll; team: TreffTeamMitglied[]; ichId: string; verwaltung: boolean; schliessen: () => void; bearbeiten: () => void; geaendert: () => void;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const namen = Object.fromEntries(team.map((m) => [m.person_id, name(m)]));
  const offen = nochNichtGelesen(p, team.map((m) => m.person_id));

  const vermerkt = useRef(false);
  useEffect(() => {
    if (vermerkt.current || istGelesen(p, ichId) || p.erstellt_von === ichId) return;
    vermerkt.current = true;
    vermerkeGelesen(p.id, ichId).then(geaendert).catch(() => undefined);   // gelesen vermerken stört das Lesen nie
  }, [p, ichId, geaendert]);

  async function loeschen() {
    if (!window.confirm(`Das Protokoll „${p.titel}“ löschen?`)) return;
    try { await loescheTeamprotokoll(p.id); geaendert(); schliessen(); } catch (e) { setFehler(fehlerText(e)); }
  }

  return (
    <Sheet titel={p.titel} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <p className="list__meta">
        <Badge ton="accent">{ARTEN[p.art].icon} {ARTEN[p.art].label}</Badge>
        <span>{formatDatum(p.datum)}</span>
        {p.erstellt_von && namen[p.erstellt_von] && <span>von {namen[p.erstellt_von]}</span>}
      </p>
      {p.anwesend.length > 0 && <p className="field__hint">Anwesend: {p.anwesend.map((id) => namen[id] ?? 'jemand').join(', ')}</p>}
      <div className="teamprotokoll__text">{p.text}</div>
      {verwaltung && (
        <section aria-label="Gelesen" style={{ marginTop: 'var(--space-4)' }}>
          <h3>Gelesen</h3>
          <p>{p.gelesen.length > 0 ? p.gelesen.map((id) => namen[id] ?? 'jemand').join(', ') : 'Noch niemand.'}</p>
          {offen.length > 0 && <p className="field__hint">Noch nicht gelesen: {offen.map((id) => namen[id] ?? 'jemand').join(', ')}</p>}
        </section>
      )}
      <div className="row" style={{ marginTop: 'var(--space-4)' }}>
        {verwaltung && <Button onClick={bearbeiten}>Bearbeiten</Button>}
        {verwaltung && <Button variante="danger" onClick={() => void loeschen()}>Löschen</Button>}
        <Button onClick={schliessen}>Schließen</Button>
      </div>
    </Sheet>
  );
}

/** Protokoll anlegen oder bearbeiten (Treffleitung, Treffkoordination). Neue Protokolle melden sich beim Team. */
function FormularSheet({ treffId, vorhanden, team, schliessen, gespeichert }: {
  treffId: string; vorhanden: Teamprotokoll | null; team: TreffTeamMitglied[]; schliessen: () => void; gespeichert: () => void;
}) {
  const [e, setE] = useState<TeamprotokollEingabe>(vorhanden ? eingabeAus(vorhanden) : leeresProtokoll(heuteIso()));
  const [fehler, setFehler] = useState<ReturnType<typeof validiere>>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    const f = validiere(e);
    setFehler(f);
    if (Object.keys(f).length) return;
    setArbeitet(true); setMeldung(null);
    try {
      const id = await speichereTeamprotokoll(treffId, vorhanden?.id ?? null, e);
      if (!vorhanden) sendePush('teamprotokoll', id);
      gespeichert(); schliessen();
    } catch (x) { setMeldung(fehlerText(x, 'Das Protokoll konnte nicht gespeichert werden.')); setArbeitet(false); }
  }

  return (
    <Sheet titel={vorhanden ? 'Teamprotokoll bearbeiten' : 'Neues Teamprotokoll'} schliessen={schliessen}>
      <form onSubmit={(ev) => void speichern(ev)} noValidate>
        {meldung && <Alert ton="error">{meldung}</Alert>}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 170px' }}>
            <SelectField label="Art" value={e.art} onChange={(x) => setE({ ...e, art: x.target.value as TeamprotokollArt })}>
              {(Object.keys(ARTEN) as TeamprotokollArt[]).map((a) => <option key={a} value={a}>{ARTEN[a].label}</option>)}
            </SelectField>
          </div>
          <div style={{ flex: '1 1 150px' }}><TextField label="Datum" type="date" value={e.datum} onChange={(x) => setE({ ...e, datum: x.target.value })} fehler={fehler.datum} /></div>
        </div>
        <TextField label="Titel" value={e.titel} maxLength={200} onChange={(x) => setE({ ...e, titel: x.target.value })} fehler={fehler.titel} />
        <div className="field">
          <label className="field__label" htmlFor="teamprotokoll-text">Inhalt</label>
          <textarea id="teamprotokoll-text" className="input" rows={10} value={e.text} maxLength={MAX_TEXT + 1} style={{ padding: 'var(--space-3)' }}
            aria-invalid={fehler.text ? true : undefined} onChange={(x) => setE({ ...e, text: x.target.value })} />
          {fehler.text && <span className="field__error">{fehler.text}</span>}
        </div>
        {team.length > 0 && (
          <fieldset className="optionen">
            <legend className="field__label">Anwesend (optional)</legend>
            {team.map((m) => (
              <label key={m.person_id} className="option">
                <input type="checkbox" checked={e.anwesend.includes(m.person_id)}
                  onChange={(x) => setE({ ...e, anwesend: x.target.checked ? [...e.anwesend, m.person_id] : e.anwesend.filter((id) => id !== m.person_id) })} />
                <span>{name(m)}</span>
              </label>
            ))}
          </fieldset>
        )}
        {!vorhanden && <p className="field__hint">Das ganze Team bekommt eine Mitteilung und kann das Protokoll nachlesen.</p>}
        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>{vorhanden ? 'Speichern' : 'Speichern und Team informieren'}</Button>
          <Button onClick={schliessen}>Abbrechen</Button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Teamprotokolle eines Treffs: Teambesprechungen, Informationen und Sonstiges zum Nachlesen für alle im Treff.
 * Treffleitung und Treffkoordination legen sie an; ungelesene sind markiert.
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
  const ungelesen = protokolle.filter((p) => p.erstellt_von !== ich.id && !istGelesen(p, ich.id)).length;
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
          const neu = p.erstellt_von !== ich.id && !istGelesen(p, ich.id);
          const fehlen = nochNichtGelesen(p, teamIds).length;
          return (
            <li key={p.id} className={`list__item${neu ? ' teamprotokoll--neu' : ''}`}>
              <div className="list__main">
                <button type="button" className="list__title linklike" onClick={() => setLesen(p.id)}>{p.titel}</button>
                <div className="list__meta">
                  <span>{ARTEN[p.art].icon} {ARTEN[p.art].label}</span>
                  <span>{formatDatum(p.datum)}</span>
                  {neu && <Badge ton="warning">ungelesen</Badge>}
                  {verwaltung && <span>{fehlen === 0 ? 'von allen gelesen' : `${fehlen} noch nicht gelesen`}</span>}
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
        <FormularSheet treffId={t.id} vorhanden={formular.vorhanden} team={mitglieder} schliessen={() => setFormular(null)} gespeichert={() => liste.neuLaden()} />
      )}
    </div>
  );
}
