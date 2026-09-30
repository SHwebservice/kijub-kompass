import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, wochentagLang } from '../../freizeiten/logik';
import { dienstSicherstellen, setzeZuteilung, speichereSonderdienst, loescheDienst, type TreffTeamMitglied } from '../../treffs/api';
import { abwesendeAm, validiereSonderdienst, zuteilungsAenderung, type Abwesenheit, type Dienst, type Feiertag } from '../../treffs/dienstplan';
import { sortiereTreffTeam, STANDARD_BIS, STANDARD_VON } from '../../treffs/logik';
import { Sheet } from '../../components/Sheet';
import { Alert, Button, TextField } from '../../components/ui';

const ABWESEND = { urlaub: 'Urlaub', krank: 'krank' } as const;

interface AuswahlProps {
  team: TreffTeamMitglied[];
  gewaehlt: string[];
  aendere: (neu: string[]) => void;
  /** Abwesenheiten des Tages (werden hinter dem Namen angezeigt). */
  abwesend?: Abwesenheit[];
  /** Personen, die diesen Dienst gewünscht haben. */
  wuenschen?: string[];
}

/** Personen des Treffs zum Ankreuzen; Treffleitung zuerst. Abwesende werden markiert, aber nicht gesperrt. */
export function ZuteilungsAuswahl({ team, gewaehlt, aendere, abwesend = [], wuenschen = [] }: AuswahlProps) {
  return (
    <fieldset className="optionen">
      <legend className="field__label">Eingeteilt</legend>
      {sortiereTreffTeam(team).map((m) => {
        const weg = abwesend.find((a) => a.person_id === m.person_id);
        return (
          <label key={m.person_id} className="option">
            <input type="checkbox" checked={gewaehlt.includes(m.person_id)}
              onChange={(e) => aendere(e.target.checked ? [...gewaehlt, m.person_id] : gewaehlt.filter((p) => p !== m.person_id))} />
            <span>
              {m.vorname} {m.nachname}
              {m.rolle === 'treffleitung' && ' (Treffleitung)'}
              {weg && <em> – abwesend: {ABWESEND[weg.typ]}</em>}
              {wuenschen.includes(m.person_id) && <em> – wünscht den Dienst</em>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

interface ZuteilenProps {
  treffId: string;
  datum: string;
  dienst: Dienst | null;
  team: TreffTeamMitglied[];
  abwesenheiten: Abwesenheit[];
  feiertag: Feiertag | null;
  schliessen: () => void;
  geaendert: () => void;
}

/** Zuteilung für den regulären Dienst eines Öffnungstags. Der Dienst wird erst beim Speichern angelegt. */
export function ZuteilenSheet({ treffId, datum, dienst, team, abwesenheiten, feiertag, schliessen, geaendert }: ZuteilenProps) {
  const alt = dienst?.personen ?? [];
  const [gewaehlt, setGewaehlt] = useState(alt);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function speichern() {
    setArbeitet(true); setFehler(null);
    try {
      const id = dienst?.id ?? await dienstSicherstellen(treffId, datum);
      const { hinzu, weg } = zuteilungsAenderung(alt, gewaehlt);
      await setzeZuteilung(id, hinzu, weg);
      geaendert(); schliessen();
    } catch (e) { setFehler(fehlerText(e, 'Die Zuteilung konnte nicht gespeichert werden.')); setArbeitet(false); }
  }

  return (
    <Sheet titel={`Dienst am ${wochentagLang(datum)}, ${formatDatum(datum)}`} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {feiertag && <Alert ton="warning">Feiertag: {feiertag.bezeichnung}</Alert>}
      <ZuteilungsAuswahl team={team} gewaehlt={gewaehlt} aendere={setGewaehlt} abwesend={abwesendeAm(datum, abwesenheiten)}
        wuenschen={(dienst?.wuensche ?? []).filter((w) => w.status === 'offen').map((w) => w.person_id)} />
      <div className="row">
        <Button variante="primary" laedt={arbeitet} onClick={() => void speichern()}>Speichern</Button>
        <Button onClick={schliessen}>Abbrechen</Button>
      </div>
    </Sheet>
  );
}

interface SonderProps {
  treffId: string;
  /** null = neu anlegen */
  dienst: Dienst | null;
  startDatum: string;
  team: TreffTeamMitglied[];
  abwesenheiten: Abwesenheit[];
  schliessen: () => void;
  geaendert: () => void;
}

/** Sonderdienst („außerordentlicher Dienst“): Datum, Zeit, Bezeichnung und Personen. */
export function SonderdienstSheet({ treffId, dienst, startDatum, team, abwesenheiten, schliessen, geaendert }: SonderProps) {
  const alt = dienst?.personen ?? [];
  const [datum, setDatum] = useState(dienst?.datum ?? startDatum);
  const [von, setVon] = useState(dienst?.von ?? STANDARD_VON);
  const [bis, setBis] = useState(dienst?.bis ?? STANDARD_BIS);
  const [bezeichnung, setBezeichnung] = useState(dienst?.bezeichnung ?? '');
  const [gewaehlt, setGewaehlt] = useState(alt);
  const [feld, setFeld] = useState<{ datum?: string; zeit?: string; bezeichnung?: string }>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function ausfuehren(aktion: () => Promise<void>) {
    setArbeitet(true); setFehler(null);
    try { await aktion(); geaendert(); schliessen(); } catch (e) { setFehler(fehlerText(e, 'Das hat nicht geklappt.')); setArbeitet(false); }
  }

  function speichern() {
    const f = validiereSonderdienst({ datum, von, bis, bezeichnung });
    setFeld(f);
    if (f.datum || f.zeit || f.bezeichnung) return;
    void ausfuehren(() => speichereSonderdienst(treffId, dienst?.id ?? null, { datum, von, bis, bezeichnung }, gewaehlt, alt));
  }

  return (
    <Sheet titel={dienst ? 'Sonderdienst bearbeiten' : 'Neuer Sonderdienst'} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <TextField label="Bezeichnung" value={bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} fehler={feld.bezeichnung}
        hinweis={'z. B. „Sommerfest“ oder „Aufbau“'} maxLength={100} />
      <TextField label="Datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} fehler={feld.datum} />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 130px' }}><TextField label="Von" type="time" value={von} onChange={(e) => setVon(e.target.value)} /></div>
        <div style={{ flex: '1 1 130px' }}><TextField label="Bis" type="time" value={bis} onChange={(e) => setBis(e.target.value)} fehler={feld.zeit} /></div>
      </div>
      <ZuteilungsAuswahl team={team} gewaehlt={gewaehlt} aendere={setGewaehlt} abwesend={abwesendeAm(datum, abwesenheiten)} />
      <div className="row">
        <Button variante="primary" laedt={arbeitet} onClick={speichern}>Speichern</Button>
        <Button onClick={schliessen}>Abbrechen</Button>
        {dienst && (
          <Button variante="danger" disabled={arbeitet}
            onClick={() => { if (window.confirm('Diesen Sonderdienst löschen?')) void ausfuehren(() => loescheDienst(dienst.id)); }}>Löschen</Button>
        )}
      </div>
    </Sheet>
  );
}
