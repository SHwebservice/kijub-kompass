import { useEffect, useState, type FormEvent } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { heuteIso } from '../../freizeiten/logik';
import { ortszeit } from '../../tagesprotokoll/logik';
import type { TreffTeamMitglied } from '../../treffs/api';
import { meldeAenderung, speichereTeamprotokoll } from '../../teamprotokolle/api';
import {
  ARTEN, eingabeAus, hatFehler, leererAbschnitt, leeresProtokoll, MAX_ABSCHNITTE, MAX_AUFGABEN, MAX_TEXT, validiere, verschiebe,
  type Abschnitt, type Fehler, type Teamprotokoll, type TeamprotokollArt, type TeamprotokollEingabe,
} from '../../teamprotokolle/logik';
import { Sheet } from '../../components/Sheet';
import { Alert, Button, SelectField, TextField } from '../../components/ui';

/* Ungespeicherte Eingaben bleiben auf dem Gerät, bis gespeichert ist – falls das Fenster versehentlich zugeht. */
interface Zwischenstand { e: TeamprotokollEingabe; am: string }
const schluessel = (treffId: string, id: string | null) => `kompass-teamprotokoll-${treffId}-${id ?? 'neu'}`;
function liesZwischenstand(k: string): Zwischenstand | null {
  try { const s = window.localStorage.getItem(k); return s ? (JSON.parse(s) as Zwischenstand) : null; } catch { return null; }
}
function schreibeZwischenstand(k: string, e: TeamprotokollEingabe | null) {
  try {
    if (e) window.localStorage.setItem(k, JSON.stringify({ e, am: new Date().toISOString() } satisfies Zwischenstand));
    else window.localStorage.removeItem(k);
  } catch { /* ohne Speicher gibt es eben keine Zwischenspeicherung */ }
}

const name = (m: TreffTeamMitglied) => `${m.vorname} ${m.nachname}`;
type Modus = 'veroeffentlichen' | 'entwurf' | 'speichern';

/**
 * Protokoll anlegen oder bearbeiten (Treffleitung, Treffkoordination): Abschnitte mit Überschrift und Ergebnis, am Ende nächstes Treffen
 * sowie Aufgaben und Ziele. Neu oder als Entwurf: „Als Entwurf speichern“ (ohne Mitteilung) oder „Veröffentlichen“ (das Team wird informiert).
 * Ein veröffentlichtes Protokoll lässt sich mit oder ohne Meldung ans Team ändern.
 */
export function TeamprotokollFormular({ treffId, vorhanden, team, schliessen, gespeichert }: {
  treffId: string; vorhanden: Teamprotokoll | null; team: TreffTeamMitglied[]; schliessen: () => void; gespeichert: () => void;
}) {
  const k = schluessel(treffId, vorhanden?.id ?? null);
  const [anfang] = useState(() => (vorhanden ? eingabeAus(vorhanden) : leeresProtokoll(heuteIso())));
  const [e, setE] = useState<TeamprotokollEingabe>(anfang);
  const [gemerkt, setGemerkt] = useState<Zwischenstand | null>(() => {
    const z = liesZwischenstand(k);
    return z && JSON.stringify(z.e) !== JSON.stringify(anfang) ? z : null;
  });
  const [fehler, setFehler] = useState<Fehler>({});
  const [melden, setMelden] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState<Modus | null>(null);
  const veroeffentlicht = !!vorhanden && !vorhanden.entwurf;

  // Zwischenstand merken, sobald sich etwas geändert hat (nicht, solange die Frage nach dem alten Stand offen ist)
  useEffect(() => {
    if (gemerkt) return;
    schreibeZwischenstand(k, JSON.stringify(e) === JSON.stringify(anfang) ? null : e);
  }, [e, anfang, k, gemerkt]);

  const setAbschnitt = (i: number, a: Partial<Abschnitt>) => setE({ ...e, abschnitte: e.abschnitte.map((x, j) => (j === i ? { ...x, ...a } : x)) });

  async function speichern(modus: Modus) {
    const entwurf = modus === 'entwurf';
    const f = validiere(e, entwurf);
    setFehler(f);
    if (hatFehler(f)) return;
    setArbeitet(modus); setMeldung(null);
    try {
      const id = await speichereTeamprotokoll(treffId, vorhanden?.id ?? null, e, entwurf);
      if (modus === 'veroeffentlichen') sendePush('teamprotokoll', id);
      if (modus === 'speichern' && melden) { await meldeAenderung(id); sendePush('teamprotokoll_geaendert', id); }
      schreibeZwischenstand(k, null);
      gespeichert(); schliessen();
    } catch (x) { setMeldung(fehlerText(x, 'Das Protokoll konnte nicht gespeichert werden.')); setArbeitet(null); }
  }

  const absenden = (ev: FormEvent) => { ev.preventDefault(); void speichern(veroeffentlicht ? 'speichern' : 'veroeffentlichen'); };

  return (
    <Sheet titel={vorhanden ? (vorhanden.entwurf ? 'Entwurf bearbeiten' : 'Teamprotokoll bearbeiten') : 'Neues Teamprotokoll'} schliessen={schliessen}>
      <form onSubmit={absenden} noValidate>
        {meldung && <Alert ton="error">{meldung}</Alert>}
        {gemerkt && (
          <Alert ton="warning">
            <p>Auf diesem Gerät gibt es ungespeicherte Eingaben vom {ortszeit(gemerkt.am)}.</p>
            <div className="row">
              <Button klein variante="primary" onClick={() => { setE(gemerkt.e); setGemerkt(null); }}>Wiederherstellen</Button>
              <Button klein onClick={() => { schreibeZwischenstand(k, null); setGemerkt(null); }}>Verwerfen</Button>
            </div>
          </Alert>
        )}
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 170px' }}>
            <SelectField label="Art" value={e.art} onChange={(x) => setE({ ...e, art: x.target.value as TeamprotokollArt })}>
              {(Object.keys(ARTEN) as TeamprotokollArt[]).map((a) => <option key={a} value={a}>{ARTEN[a].label}</option>)}
            </SelectField>
          </div>
          <div style={{ flex: '1 1 150px' }}><TextField label="Datum" type="date" value={e.datum} onChange={(x) => setE({ ...e, datum: x.target.value })} fehler={fehler.datum} /></div>
        </div>
        <TextField label="Titel" value={e.titel} maxLength={200} onChange={(x) => setE({ ...e, titel: x.target.value })} fehler={fehler.titel} />

        <fieldset className="teamprotokoll__bearbeiten">
          <legend className="field__label">Protokoll</legend>
          <p className="field__hint">Je Thema eine Überschrift und darunter das Ergebnis. Zeilen mit „- “ am Anfang werden zur Aufzählung. Beim Lesen lassen sich die Überschriften auf- und zuklappen.</p>
          {e.abschnitte.map((a, i) => (
            <div key={i} className="teamprotokoll__abschnitt-form">
              <TextField label={`Überschrift ${i + 1}`} value={a.titel} maxLength={201} placeholder="z. B. Termine, Kasse, Programm" onChange={(x) => setAbschnitt(i, { titel: x.target.value })}
                fehler={fehler.abschnitte?.[i]} />
              <div className="field">
                <label className="field__label" htmlFor={`tp-ergebnis-${i}`}>{`Ergebnis ${i + 1}`}</label>
                <textarea id={`tp-ergebnis-${i}`} className="input" rows={4} value={a.text} maxLength={MAX_TEXT} style={{ padding: 'var(--space-3)' }}
                  onChange={(x) => setAbschnitt(i, { text: x.target.value })} />
              </div>
              <div className="row" style={{ gap: 'var(--space-1)' }}>
                <Button klein variante="ghost" disabled={i === 0} aria-label={`Abschnitt ${i + 1} nach oben`} onClick={() => setE({ ...e, abschnitte: verschiebe(e.abschnitte, i, -1) })}>↑</Button>
                <Button klein variante="ghost" disabled={i === e.abschnitte.length - 1} aria-label={`Abschnitt ${i + 1} nach unten`}
                  onClick={() => setE({ ...e, abschnitte: verschiebe(e.abschnitte, i, 1) })}>↓</Button>
                <Button klein variante="ghost" disabled={e.abschnitte.length === 1} aria-label={`Abschnitt ${i + 1} entfernen`}
                  onClick={() => setE({ ...e, abschnitte: e.abschnitte.filter((_, j) => j !== i) })}>Entfernen</Button>
              </div>
            </div>
          ))}
          <Button klein disabled={e.abschnitte.length >= MAX_ABSCHNITTE} onClick={() => setE({ ...e, abschnitte: [...e.abschnitte, leererAbschnitt()] })}>+ Überschrift hinzufügen</Button>
          {fehler.inhalt && <p className="field__error" role="alert">{fehler.inhalt}</p>}
        </fieldset>

        <fieldset className="teamprotokoll__bearbeiten">
          <legend className="field__label">Zum Schluss (optional)</legend>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 150px' }}><TextField label="Nächstes Treffen" type="date" value={e.naechstes_datum} onChange={(x) => setE({ ...e, naechstes_datum: x.target.value })} /></div>
            <div style={{ flex: '1 1 110px' }}>
              <TextField label="Uhrzeit" type="time" value={e.naechstes_zeit} disabled={!e.naechstes_datum} onChange={(x) => setE({ ...e, naechstes_zeit: x.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="tp-aufgaben">Aufgaben und Ziele</label>
            <textarea id="tp-aufgaben" className="input" rows={3} value={e.aufgaben} maxLength={MAX_AUFGABEN + 1} style={{ padding: 'var(--space-3)' }}
              placeholder="- Lea: Flyer drucken bis Freitag" aria-invalid={fehler.aufgaben ? true : undefined} onChange={(x) => setE({ ...e, aufgaben: x.target.value })} />
            {fehler.aufgaben && <span className="field__error">{fehler.aufgaben}</span>}
          </div>
        </fieldset>

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

        {veroeffentlicht ? (
          <label className="option" style={{ marginBottom: 'var(--space-3)' }}>
            <input type="checkbox" checked={melden} onChange={(x) => setMelden(x.target.checked)} />
            <span>Änderung ans Team melden – alle bekommen eine Mitteilung und lesen das Protokoll erneut</span>
          </label>
        ) : (
          <p className="field__hint">Ein Entwurf ist nur für Treffleitung und Koordination sichtbar. Beim Veröffentlichen bekommt das ganze Team eine Mitteilung.</p>
        )}
        <div className="row">
          {veroeffentlicht
            ? <Button variante="primary" type="submit" laedt={arbeitet === 'speichern'} disabled={!!arbeitet}>{melden ? 'Speichern und melden' : 'Speichern'}</Button>
            : (
              <>
                <Button variante="primary" type="submit" laedt={arbeitet === 'veroeffentlichen'} disabled={!!arbeitet}>Veröffentlichen und Team informieren</Button>
                <Button laedt={arbeitet === 'entwurf'} disabled={!!arbeitet} onClick={() => void speichern('entwurf')}>{vorhanden ? 'Entwurf speichern' : 'Als Entwurf speichern'}</Button>
              </>
            )}
          <Button onClick={() => {
            // „Abbrechen“ verwirft bewusst (nach Rückfrage); schließt sich das Fenster anders, bleibt der Zwischenstand auf dem Gerät
            if (JSON.stringify(e) !== JSON.stringify(anfang) && !window.confirm('Die Eingaben verwerfen?')) return;
            if (!gemerkt) schreibeZwischenstand(k, null);      // ein älterer, noch nicht beantworteter Zwischenstand bleibt
            schliessen();
          }}>Abbrechen</Button>
        </div>
      </form>
    </Sheet>
  );
}
