import { useState, type FormEvent } from 'react';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, wochentagLang } from '../../freizeiten/logik';
import { legeAufgabeAn, loescheProtokoll, speichereProtokoll } from '../../tagesprotokoll/api';
import {
  aendereAnzahl, ARTEN, eingabeAus, gesamt, leeresProtokoll, liesAnzahl, MAX_TEXT, validiereAufgabe, validiereProtokoll, waehlbareTage, leereAufgabe,
  type AufgabeArt, type Protokoll, type ProtokollEingabe,
} from '../../tagesprotokoll/logik';
import { Sheet } from '../../components/Sheet';
import { Alert, Button, SelectField, TextField } from '../../components/ui';

type Feld = 'anz_m' | 'anz_w' | 'anz_d';
const ZAEHLER: { feld: Feld; label: string }[] = [
  { feld: 'anz_m', label: 'männlich' },
  { feld: 'anz_w', label: 'weiblich' },
  { feld: 'anz_d', label: 'divers' },
];

/** Ein Zähler mit −, Zahlenfeld und +: am Handy ohne Tippen bedienbar. */
function Zaehler({ label, wert, aendere }: { label: string; wert: number; aendere: (n: number) => void }) {
  const [text, setText] = useState<string | null>(null);      // solange getippt wird, der Rohtext (damit „leer“ möglich bleibt)
  return (
    <div className="zaehler" role="group" aria-label={label}>
      <span className="field__label">{label}</span>
      <div className="zaehler__reihe">
        <button type="button" className="btn btn--sm" aria-label={`${label} verringern`} onClick={() => { setText(null); aendere(aendereAnzahl(wert, -1)); }} disabled={wert <= 0}>−</button>
        <input className="input zaehler__wert" inputMode="numeric" aria-label={`Anzahl ${label}`} value={text ?? String(wert)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => { setText(e.target.value); const n = liesAnzahl(e.target.value); if (n !== null) aendere(n); }}
          onBlur={() => setText(null)} />
        <button type="button" className="btn btn--sm" aria-label={`${label} erhöhen`} onClick={() => { setText(null); aendere(aendereAnzahl(wert, 1)); }}>+</button>
      </div>
    </div>
  );
}

interface Props {
  treffId: string;
  /** Vorgewählter Tag; leer = auswählen lassen (nur bei neuen Protokollen). */
  datum: string | null;
  vorhanden: Protokoll | null;
  /** Protokolle, die es schon gibt (für die Tagesauswahl). */
  belegt: Pick<Protokoll, 'datum'>[];
  heute: string;
  zuletztVon: string | null;
  darfLoeschen: boolean;
  schliessen: () => void;
  gespeichert: () => void;
}

const tagText = (d: string, heute: string) => `${wochentagLang(d)}, ${formatDatum(d)}${d === heute ? ' (heute)' : ''}`;

/** Protokoll eines Tages anlegen oder bearbeiten – alle im Team dürfen jederzeit. */
export function ProtokollSheet({ treffId, datum, vorhanden, belegt, heute, zuletztVon, darfLoeschen, schliessen, gespeichert }: Props) {
  const wahl = waehlbareTage(belegt, heute);
  const [tag, setTag] = useState(vorhanden?.datum ?? datum ?? wahl[0] ?? heute);
  const [e, setE] = useState<ProtokollEingabe>(vorhanden ? eingabeAus(vorhanden) : leeresProtokoll());
  const [fehler, setFehler] = useState<string | null>(null);
  const [fehlerFelder, setFehlerFelder] = useState<ReturnType<typeof validiereProtokoll>>({});
  const [arbeitet, setArbeitet] = useState(false);

  const [art, setArt] = useState<AufgabeArt>('todo');
  const [notiz, setNotiz] = useState('');
  const [notizFehler, setNotizFehler] = useState<string | null>(null);
  const [angelegt, setAngelegt] = useState<string[]>([]);

  const auswahlTage = vorhanden ? [] : [...new Set([tag, ...wahl])].sort((a, b) => b.localeCompare(a));

  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    const f = validiereProtokoll(e);
    setFehlerFelder(f);
    if (Object.keys(f).length) return;
    setArbeitet(true); setFehler(null);
    try { await speichereProtokoll(treffId, tag, e); gespeichert(); schliessen(); }
    catch (x) { setFehler(fehlerText(x, 'Das Protokoll konnte nicht gespeichert werden.')); setArbeitet(false); }
  }

  async function loeschen() {
    if (!vorhanden || !window.confirm(`Das Protokoll vom ${formatDatum(vorhanden.datum)} wirklich löschen?`)) return;
    setArbeitet(true); setFehler(null);
    try { await loescheProtokoll(vorhanden.id); gespeichert(); schliessen(); }
    catch (x) { setFehler(fehlerText(x, 'Das Protokoll konnte nicht gelöscht werden.')); setArbeitet(false); }
  }

  async function notizAnlegen() {
    const eingabe = { ...leereAufgabe(art), text: notiz };
    const f = validiereAufgabe(eingabe);
    if (f.text) { setNotizFehler(f.text); return; }
    setNotizFehler(null);
    try { await legeAufgabeAn(treffId, eingabe, tag); setAngelegt((l) => [...l, notiz.trim()]); setNotiz(''); }
    catch (x) { setNotizFehler(fehlerText(x, 'Die Notiz konnte nicht gespeichert werden.')); }
  }

  return (
    <Sheet titel={vorhanden ? `Protokoll · ${tagText(vorhanden.datum, heute)}` : 'Neues Tagesprotokoll'} schliessen={schliessen}>
      <form onSubmit={(ev) => void speichern(ev)} noValidate>
        {fehler && <Alert ton="error">{fehler}</Alert>}
        {!vorhanden && (
          <SelectField label="Tag" value={tag} onChange={(ev) => setTag(ev.target.value)}>
            {auswahlTage.map((d) => <option key={d} value={d}>{tagText(d, heute)}</option>)}
          </SelectField>
        )}
        {vorhanden && zuletztVon && <p className="field__hint">Zuletzt bearbeitet von {zuletztVon} am {formatDatum(vorhanden.updated_at.slice(0, 10))} um {vorhanden.updated_at.slice(11, 16)} Uhr.</p>}

        <fieldset className="zaehler-gruppe">
          <legend className="field__label">Wie viele Kinder waren da?</legend>
          <div className="zaehler-reihe">
            {ZAEHLER.map((z) => <Zaehler key={z.feld} label={z.label} wert={e[z.feld]} aendere={(n) => setE((x) => ({ ...x, [z.feld]: n }))} />)}
          </div>
          <p className="zaehler__gesamt" aria-live="polite">Gesamt: <strong>{gesamt(e)}</strong></p>
          {fehlerFelder.anzahl && <span className="field__error">{fehlerFelder.anzahl}</span>}
        </fieldset>

        <div className="field">
          <label className="field__label" htmlFor="protokoll-verlauf">Was war los? (Programm, Stimmung, Stand der Dinge)</label>
          <textarea id="protokoll-verlauf" className="input" rows={4} value={e.verlauf} maxLength={MAX_TEXT + 1}
            onChange={(ev) => setE((x) => ({ ...x, verlauf: ev.target.value }))} aria-invalid={fehlerFelder.verlauf ? true : undefined} style={{ padding: 'var(--space-3)' }} />
          {fehlerFelder.verlauf && <span className="field__error">{fehlerFelder.verlauf}</span>}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="protokoll-vorkommnisse">Besondere Vorkommnisse</label>
          <textarea id="protokoll-vorkommnisse" className="input" rows={3} value={e.vorkommnisse} maxLength={MAX_TEXT + 1}
            onChange={(ev) => setE((x) => ({ ...x, vorkommnisse: ev.target.value }))} aria-invalid={fehlerFelder.vorkommnisse ? true : undefined} aria-describedby="protokoll-vorkommnisse-h" style={{ padding: 'var(--space-3)' }} />
          <span className="field__hint" id="protokoll-vorkommnisse-h">Streit, Verletzungen, Schäden, Gespräche mit Eltern … Das ganze Team liest das. Bitte keine Namen von Kindern eintragen.</span>
          {fehlerFelder.vorkommnisse && <span className="field__error">{fehlerFelder.vorkommnisse}</span>}
        </div>

        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>Speichern</Button>
          <Button onClick={schliessen}>Abbrechen</Button>
          {vorhanden && darfLoeschen && <Button variante="danger" onClick={() => void loeschen()} disabled={arbeitet}>Löschen</Button>}
        </div>
      </form>

      <section className="stack" aria-label="Notiz anlegen" style={{ marginTop: 'var(--space-5)' }}>
        <h3>Nebenbei: Notiz für das Team</h3>
        <p className="field__hint">Zum Beispiel etwas einkaufen oder klären. Die Notiz wird sofort gespeichert und steht unter „Notizen“.</p>
        {notizFehler && <Alert ton="error">{notizFehler}</Alert>}
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <SelectField label="Art" value={art} onChange={(ev) => setArt(ev.target.value as AufgabeArt)}>
            {ARTEN.map((a) => <option key={a.art} value={a.art}>{a.label}</option>)}
          </SelectField>
          <div style={{ flex: 1, minWidth: '12rem' }}>
            <TextField label="Notiz" value={notiz} onChange={(ev) => setNotiz(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void notizAnlegen(); } }} />
          </div>
          <Button onClick={() => void notizAnlegen()}>Notiz hinzufügen</Button>
        </div>
        {angelegt.length > 0 && <ul aria-label="Neu angelegte Notizen">{angelegt.map((t, i) => <li key={i}>✔ {t}</li>)}</ul>}
      </section>
    </Sheet>
  );
}
