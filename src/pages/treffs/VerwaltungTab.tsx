import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import {
  holeTreffTeam, listeAbwesenheiten, listeFeiertage, loescheAbwesenheiten, loescheFeiertag, speichereAbwesenheit, speichereFeiertag,
  type TreffDetailDaten,
} from '../../treffs/api';
import { abwesenheitsBloecke, addTage, tageImZeitraum, validiereAbwesenheit } from '../../treffs/dienstplan';
import { sortiereTreffTeam } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, Button, Card, SelectField, Spinner, TextField } from '../../components/ui';

const ZEITRAUM_TAGE = 365;
const zeitraum = (von: string, bis: string) => (von === bis ? formatDatum(von) : `${formatDatum(von)} – ${formatDatum(bis)}`);

/** Treffleitung/Koordination: Urlaub und Krankheit der Personen sowie Feiertage des Treffs eintragen. */
export function VerwaltungTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const heute = heuteIso();
  const bis = addTage(heute, ZEITRAUM_TAGE);
  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const abwesenheiten = useLaden(() => listeAbwesenheiten(heute, bis), `abwesenheiten-verw-${t.id}`);
  const feiertage = useLaden(() => listeFeiertage(t.id, heute, bis), `feiertage-verw-${t.id}`);

  const [a, setA] = useState({ person_id: '', von: '', bis: '', typ: 'urlaub' as 'urlaub' | 'krank', notiz: '' });
  const [aFehler, setAFehler] = useState<{ person?: string; zeitraum?: string }>({});
  const [f, setF] = useState({ datum: '', bezeichnung: '', alle: false });
  const [fFehler, setFFehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const mitglieder = sortiereTreffTeam(team.daten ?? []);
  const namen = Object.fromEntries(mitglieder.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const name = (id: string) => namen[id] ?? 'Jemand';
  // Nur Personen dieses Treffs sind hier relevant (die Datenbank liefert ggf. auch Abwesenheiten aus anderen gemeinsamen Treffs).
  const bloecke = abwesenheitsBloecke((abwesenheiten.daten ?? []).filter((x) => x.person_id in namen));

  async function aktion(fn: () => Promise<void>, danach: () => void) {
    setFehler(null); setArbeitet(true);
    try { await fn(); danach(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  function abwesenheitSpeichern(e: FormEvent) {
    e.preventDefault();
    const probleme = validiereAbwesenheit(a);
    setAFehler(probleme);
    if (probleme.person || probleme.zeitraum) return;
    void aktion(() => speichereAbwesenheit(a.person_id, tageImZeitraum(a.von, a.bis), a.typ, a.notiz),
      () => { setA({ person_id: a.person_id, von: '', bis: '', typ: a.typ, notiz: '' }); abwesenheiten.neuLaden(); });
  }

  function feiertagSpeichern(e: FormEvent) {
    e.preventDefault();
    if (!f.datum || !f.bezeichnung.trim()) { setFFehler('Bitte Datum und Bezeichnung angeben.'); return; }
    setFFehler(null);
    void aktion(() => speichereFeiertag(f.alle ? null : t.id, f.datum, f.bezeichnung), () => { setF({ datum: '', bezeichnung: '', alle: false }); feiertage.neuLaden(); });
  }

  return (
    <div className="stack">
      {(team.fehler || abwesenheiten.fehler || feiertage.fehler || fehler) && <Alert ton="error">{team.fehler ?? abwesenheiten.fehler ?? feiertage.fehler ?? fehler}</Alert>}

      <Card>
        <h2>Urlaub und Krankheit</h2>
        <p className="field__hint">Abwesende werden im Dienstplan markiert und im Nachweis mit den üblichen Stunden vermerkt. Gilt für alle Treffs und Freizeiten der Person.</p>
        <form onSubmit={abwesenheitSpeichern} noValidate>
          <SelectField label="Person" value={a.person_id} onChange={(e) => setA({ ...a, person_id: e.target.value })} fehler={aFehler.person}>
            <option value="">– bitte wählen –</option>
            {mitglieder.map((m) => <option key={m.person_id} value={m.person_id}>{m.nachname}, {m.vorname}</option>)}
          </SelectField>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 150px' }}><TextField label="Von" type="date" value={a.von} onChange={(e) => setA({ ...a, von: e.target.value, bis: a.bis || e.target.value })} /></div>
            <div style={{ flex: '1 1 150px' }}><TextField label="Bis" type="date" value={a.bis} onChange={(e) => setA({ ...a, bis: e.target.value })} fehler={aFehler.zeitraum} /></div>
            <div style={{ flex: '1 1 130px' }}>
              <SelectField label="Art" value={a.typ} onChange={(e) => setA({ ...a, typ: e.target.value as 'urlaub' | 'krank' })}>
                <option value="urlaub">Urlaub</option>
                <option value="krank">Krank</option>
              </SelectField>
            </div>
          </div>
          <TextField label="Notiz (optional)" value={a.notiz} onChange={(e) => setA({ ...a, notiz: e.target.value })} maxLength={200} />
          <Button variante="primary" type="submit" laedt={arbeitet}>Eintragen</Button>
        </form>

        <h3>Kommende Abwesenheiten</h3>
        {abwesenheiten.laedt && <Spinner />}
        {!abwesenheiten.laedt && bloecke.length === 0 && <p>Keine Abwesenheiten eingetragen.</p>}
        <ul className="list">
          {bloecke.map((b) => (
            <li key={`${b.person_id}-${b.typ}-${b.von}`} className="list__item">
              <div className="list__main">
                <div className="list__title">{name(b.person_id)}</div>
                <div className="list__meta"><Badge ton={b.typ === 'krank' ? 'danger' : 'neutral'}>{b.typ === 'krank' ? 'Krank' : 'Urlaub'}</Badge><span>{zeitraum(b.von, b.bis)}</span></div>
              </div>
              <Button klein variante="danger" disabled={arbeitet} aria-label={`Abwesenheit von ${name(b.person_id)} (${zeitraum(b.von, b.bis)}) löschen`}
                onClick={() => void aktion(() => loescheAbwesenheiten(b.ids), () => abwesenheiten.neuLaden())}>Löschen</Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2>Feiertage</h2>
        <p className="field__hint">Feiertage werden im Dienstplan angezeigt und im Nachweis vermerkt.</p>
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
