import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import { holeTreffTeam, listeFeiertage, loescheFeiertag, speichereFeiertag, type TreffDetailDaten } from '../../treffs/api';
import { addTage } from '../../treffs/dienstplan';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, Button, Card, Spinner, TextField } from '../../components/ui';
import { AbwesenheitenListe } from './AbwesenheitenListe';

const ZEITRAUM_TAGE = 365;

/** Treffleitung/Koordination: Urlaub und Krankheit der Personen und Feiertage des Treffs eintragen. Schließzeiten stehen seit 2026-10 im Dienstplan. */
export function VerwaltungTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const heute = heuteIso();
  const bis = addTage(heute, ZEITRAUM_TAGE);
  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const feiertage = useLaden(() => listeFeiertage(t.id, heute, bis), `feiertage-verw-${t.id}`);

  const [f, setF] = useState({ datum: '', bezeichnung: '', alle: false });
  const [fFehler, setFFehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function aktion(fn: () => Promise<void>, danach: () => void) {
    setFehler(null); setArbeitet(true);
    try { await fn(); danach(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  function feiertagSpeichern(e: FormEvent) {
    e.preventDefault();
    if (!f.datum || !f.bezeichnung.trim()) { setFFehler('Bitte Datum und Bezeichnung angeben.'); return; }
    setFFehler(null);
    void aktion(() => speichereFeiertag(f.alle ? null : t.id, f.datum, f.bezeichnung), () => { setF({ datum: '', bezeichnung: '', alle: false }); feiertage.neuLaden(); });
  }


  return (
    <div className="stack">
      {(team.fehler || feiertage.fehler || fehler) && (
        <Alert ton="error">{team.fehler ?? feiertage.fehler ?? fehler}</Alert>
      )}

      <Card>
        <h2>Urlaub, Krankheit und Sonstiges</h2>
        <p className="field__hint">
          Abwesende werden im Dienstplan markiert und im Nachweis mit den üblichen Stunden vermerkt. Gilt für alle Treffs und Freizeiten der Person.
          Eintragen und ändern geht auch direkt im <Link to={`/treffs/${t.id}/dienstplan`}>Dienstplan</Link> – dort siehst du gleich, welche Dienste betroffen sind.
        </p>
        <AbwesenheitenListe treffId={t.id} team={team.daten ?? []} heute={heute} />
      </Card>

      <Card>
        <h2>Feiertage</h2>
        <p className="field__hint">Schließzeiten (z. B. Sommerpause) trägst du direkt im <Link to={`/treffs/${t.id}/dienstplan?ansicht=monat`}>Dienstplan</Link> ein: „Schließzeiten …“ über der Tabelle oder im Tagesfenster.</p>
        <p className="field__hint">An Feiertagen ist der Treff geschlossen wie in einer Schließzeit: kein Einteilen, kein Wünschen, kein Tagesprotokoll. Im Nachweis werden sie vermerkt.</p>
        <form onSubmit={feiertagSpeichern} noValidate>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 150px' }}><TextField label="Datum" type="date" value={f.datum} onChange={(e) => setF({ ...f, datum: e.target.value })} /></div>
            <div style={{ flex: '2 1 200px' }}><TextField label="Bezeichnung" value={f.bezeichnung} onChange={(e) => setF({ ...f, bezeichnung: e.target.value })} maxLength={100} fehler={fFehler ?? undefined} /></div>
          </div>
          {rolle === 'koordination' && (
            <label className="option">
              <input type="checkbox" checked={f.alle} onChange={(e) => setF({ ...f, alle: e.target.checked })} />
              <span>Gilt für alle Treffs</span>
            </label>
          )}
          <Button variante="primary" type="submit" laedt={arbeitet}>Feiertag eintragen</Button>
        </form>

        <h3>Kommende Feiertage</h3>
        {feiertage.laedt && <Spinner />}
        {!feiertage.laedt && (feiertage.daten?.length ?? 0) === 0 && <p>Keine Feiertage eingetragen.</p>}
        <ul className="list">
          {(feiertage.daten ?? []).map((x) => (
            <li key={x.id} className="list__item">
              <div className="list__main">
                <div className="list__title">{x.bezeichnung}</div>
                <div className="list__meta"><span>{formatDatum(x.datum)}</span>{x.treff_id === null && <Badge>Alle Treffs</Badge>}</div>
              </div>
              {(x.treff_id !== null || rolle === 'koordination') && (
                <Button klein variante="danger" disabled={arbeitet} aria-label={`Feiertag ${x.bezeichnung} löschen`}
                  onClick={() => void aktion(() => loescheFeiertag(x.id), () => feiertage.neuLaden())}>Löschen</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
