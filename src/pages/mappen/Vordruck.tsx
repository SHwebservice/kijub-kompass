import { formatDatum } from '../../freizeiten/logik';
import {
  leereStundenZeile, neueAnwesenheitZeile, statusWert, stundenSumme, tagEntfernen, tagHinzufuegen,
  type Anwesenheit, type Bescheinigung, type FormularDaten, type FormularTyp, type Stundenmeldung, type Tagesbericht, type Unfallbericht,
} from '../../formulare/typen';
import { Button } from '../../components/ui';

type Aendere<T> = (neu: T) => void;

function Text({ label, wert, aendere, typ = 'text' }: { label: string; wert: string; aendere: (v: string) => void; typ?: 'text' | 'date' }) {
  return (
    <div className="field">
      <label className="field__label">{label}
        <input className="input" type={typ} value={wert} onChange={(e) => aendere(e.target.value)} />
      </label>
    </div>
  );
}

function Mehrzeilig({ label, wert, aendere, zeilen = 4 }: { label: string; wert: string; aendere: (v: string) => void; zeilen?: number }) {
  return (
    <div className="field">
      <label className="field__label">{label}
        <textarea className="input" rows={zeilen} value={wert} style={{ padding: 'var(--space-3)' }} onChange={(e) => aendere(e.target.value)} />
      </label>
    </div>
  );
}

function AnwesenheitForm({ d, aendere }: { d: Anwesenheit; aendere: Aendere<Anwesenheit> }) {
  return (
    <>
      <Text label="für die Maßnahme" wert={d.massnahme} aendere={(v) => aendere({ ...d, massnahme: v })} />
      <Text label="Teamer/Gruppe" wert={d.teamerGruppe} aendere={(v) => aendere({ ...d, teamerGruppe: v })} />
      <div className="tabelle-wrap">
        <table className="tabelle">
          <thead>
            <tr>
              <th scope="col">Name, Vorname</th>
              {d.days.map((t, i) => (
                <th key={i} scope="col">
                  <input className="input" aria-label={`Tag ${i + 1}`} value={t} style={{ minWidth: 56, textAlign: 'center' }}
                    onChange={(e) => aendere({ ...d, days: d.days.map((x, j) => (j === i ? e.target.value : x)) })} />
                </th>
              ))}
              <th scope="col"><span className="sr-only">Aktionen</span></th>
            </tr>
          </thead>
          <tbody>
            {d.rows.map((r, ri) => (
              <tr key={ri}>
                <td><input className="input" aria-label={`Name ${ri + 1}`} value={r.name} onChange={(e) => aendere({ ...d, rows: d.rows.map((x, j) => (j === ri ? { ...x, name: e.target.value } : x)) })} /></td>
                {r.status.map((st, si) => (
                  <td key={si}>
                    <input className="input" aria-label={`Status ${ri + 1}, Tag ${si + 1}`} value={st} maxLength={2} style={{ textAlign: 'center', minWidth: 48 }}
                      onChange={(e) => aendere({ ...d, rows: d.rows.map((x, j) => (j === ri ? { ...x, status: x.status.map((y, k) => (k === si ? statusWert(e.target.value) : y)) } : x)) })} />
                  </td>
                ))}
                <td><Button klein variante="ghost" aria-label={`Zeile ${ri + 1} entfernen`} disabled={d.rows.length <= 1} onClick={() => aendere({ ...d, rows: d.rows.filter((_, j) => j !== ri) })}>🗑</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row">
        <Button klein onClick={() => aendere({ ...d, rows: [...d.rows, neueAnwesenheitZeile(d.days)] })}>+ Teilnehmer/in hinzufügen</Button>
        <Button klein onClick={() => aendere(tagHinzufuegen(d))}>+ Tag hinzufügen</Button>
        <Button klein disabled={d.days.length <= 1} onClick={() => aendere(tagEntfernen(d, d.days.length - 1))}>Letzten Tag entfernen</Button>
      </div>
      <p className="field__hint">X = anwesend, E = entschuldigt, U = unentschuldigt. Diese Liste enthält Namen von Kindern und wird deshalb nicht gespeichert – nach dem Schließen der Seite ist sie weg. Drucke oder speichere sie vorher als PDF.</p>
    </>
  );
}

function TagesberichtForm({ d, aendere }: { d: Tagesbericht; aendere: Aendere<Tagesbericht> }) {
  return (
    <>
      <Text label="Freizeit/Gruppe" wert={d.freizeitGruppe} aendere={(v) => aendere({ ...d, freizeitGruppe: v })} />
      <Text label="Teamer/in" wert={d.teamer} aendere={(v) => aendere({ ...d, teamer: v })} />
      <Text label="Datum" typ="date" wert={d.datum} aendere={(v) => aendere({ ...d, datum: v })} />
      <Mehrzeilig label="Zeitraum – Tagesprogramm – besondere Vorkommnisse – Einkäufe" zeilen={10} wert={d.bericht} aendere={(v) => aendere({ ...d, bericht: v })} />
      <Text label="Fehlende Kinder" wert={d.fehlendeKinder} aendere={(v) => aendere({ ...d, fehlendeKinder: v })} />
      <Text label="Unterschrift Teamer" wert={d.unterschrift} aendere={(v) => aendere({ ...d, unterschrift: v })} />
    </>
  );
}

function UnfallberichtForm({ d, aendere }: { d: Unfallbericht; aendere: Aendere<Unfallbericht> }) {
  return (
    <>
      <Text label="Datum des Vorfalls" typ="date" wert={d.datum} aendere={(v) => aendere({ ...d, datum: v })} />
      <Mehrzeilig label="Betroffene (Kinder / Dritte, möglichst mit Adresse)" zeilen={3} wert={d.betroffene} aendere={(v) => aendere({ ...d, betroffene: v })} />
      <Text label="Betreuungskraft" wert={d.betreuungskraft} aendere={(v) => aendere({ ...d, betreuungskraft: v })} />
      <Text label="Ort / Uhrzeit" wert={d.ortUhrzeit} aendere={(v) => aendere({ ...d, ortUhrzeit: v })} />
      <Mehrzeilig label="Schäden (Personen-/Sachschäden bzw. Auswirkungen)" zeilen={3} wert={d.schaeden} aendere={(v) => aendere({ ...d, schaeden: v })} />
      <Mehrzeilig label="Kurze Schilderung des Vorfalls" zeilen={5} wert={d.schilderung} aendere={(v) => aendere({ ...d, schilderung: v })} />
      <Text label="Unterschrift" wert={d.unterschrift} aendere={(v) => aendere({ ...d, unterschrift: v })} />
    </>
  );
}

function BescheinigungForm({ d, aendere }: { d: Bescheinigung; aendere: Aendere<Bescheinigung> }) {
  return (
    <>
      <Text label="Mein Sohn/meine Tochter (Name, Vorname)" wert={d.kind} aendere={(v) => aendere({ ...d, kind: v })} />
      <fieldset className="optionen">
        <legend className="field__label">Abholregelung</legend>
        <label className="option">
          <input type="radio" name="regelung" checked={d.regelung === 'allein'} onChange={() => aendere({ ...d, regelung: 'allein' })} />
          <span>darf alleine von der Freizeit nach Hause gehen</span>
        </label>
        {d.regelung === 'allein' && <Text label="Name der Freizeit" wert={d.alleinFreizeit} aendere={(v) => aendere({ ...d, alleinFreizeit: v })} />}
        <label className="option">
          <input type="radio" name="regelung" checked={d.regelung === 'abgeholt'} onChange={() => aendere({ ...d, regelung: 'abgeholt' })} />
          <span>wird von der Maßnahme abgeholt</span>
        </label>
      </fieldset>
      <Mehrzeilig label="Folgende Personen sind ebenfalls zur Abholung unseres Kindes berechtigt" zeilen={3} wert={d.weitereAbholberechtigte} aendere={(v) => aendere({ ...d, weitereAbholberechtigte: v })} />
      <p className="field__hint">Ich bin darüber informiert, dass seitens der Stadt Frankenthal keine Weghaftung besteht.</p>
      <Text label="Ort, Datum" wert={d.ortDatum} aendere={(v) => aendere({ ...d, ortDatum: v })} />
      <Text label="Unterschrift des/der Erziehungsberechtigten" wert={d.unterschrift} aendere={(v) => aendere({ ...d, unterschrift: v })} />
    </>
  );
}

function StundenForm({ d, aendere }: { d: Stundenmeldung; aendere: Aendere<Stundenmeldung> }) {
  const zeile = (i: number, teil: Partial<Stundenmeldung['rows'][number]>) => aendere({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...teil } : r)) });
  return (
    <>
      <Text label="Datum" typ="date" wert={d.datum} aendere={(v) => aendere({ ...d, datum: v })} />
      <Text label="Freizeit" wert={d.freizeit} aendere={(v) => aendere({ ...d, freizeit: v })} />
      <Text label="Zeitraum" wert={d.zeitraum} aendere={(v) => aendere({ ...d, zeitraum: v })} />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 160px' }}><Text label="Nachname" wert={d.nachname} aendere={(v) => aendere({ ...d, nachname: v })} /></div>
        <div style={{ flex: '1 1 160px' }}><Text label="Vorname" wert={d.vorname} aendere={(v) => aendere({ ...d, vorname: v })} /></div>
      </div>
      <div className="tabelle-wrap">
        <table className="tabelle">
          <thead><tr><th scope="col">Datum</th><th scope="col">Vormittag (Beginn–Ende)</th><th scope="col">Nachmittag (Beginn–Ende)</th><th scope="col">Stunden</th><th scope="col">Zwischensumme</th><th scope="col"><span className="sr-only">Aktionen</span></th></tr></thead>
          <tbody>
            {d.rows.map((r, i) => (
              <tr key={i}>
                <td><input className="input" aria-label={`Datum ${i + 1}`} value={r.datum} style={{ minWidth: 70 }} onChange={(e) => zeile(i, { datum: e.target.value })} /></td>
                <td><input className="input" aria-label={`Vormittag ${i + 1}`} value={r.vormittag} onChange={(e) => zeile(i, { vormittag: e.target.value })} /></td>
                <td><input className="input" aria-label={`Nachmittag ${i + 1}`} value={r.nachmittag} onChange={(e) => zeile(i, { nachmittag: e.target.value })} /></td>
                <td><input className="input" aria-label={`Stunden ${i + 1}`} value={r.stunden} style={{ minWidth: 64 }} inputMode="decimal" onChange={(e) => zeile(i, { stunden: e.target.value })} /></td>
                <td><input className="input" aria-label={`Zwischensumme ${i + 1}`} value={r.zwischensumme} style={{ minWidth: 64 }} onChange={(e) => zeile(i, { zwischensumme: e.target.value })} /></td>
                <td><Button klein variante="ghost" aria-label={`Zeile ${i + 1} entfernen`} disabled={d.rows.length <= 1} onClick={() => aendere({ ...d, rows: d.rows.filter((_, j) => j !== i) })}>🗑</Button></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><th scope="row" colSpan={3}>Endsumme</th><td colSpan={3}><strong>{stundenSumme(d.rows).toLocaleString('de-DE')}</strong></td></tr></tfoot>
        </table>
      </div>
      <p><Button klein onClick={() => aendere({ ...d, rows: [...d.rows, leereStundenZeile()] })}>+ Tag hinzufügen</Button></p>
      <Text label="Unterschrift Betreuer" wert={d.unterschriftBetreuer} aendere={(v) => aendere({ ...d, unterschriftBetreuer: v })} />
      <Text label="Unterschrift Leitung Freizeit" wert={d.unterschriftLeitung} aendere={(v) => aendere({ ...d, unterschriftLeitung: v })} />
    </>
  );
}

/** Eingabemaske eines Vordrucks. */
export function Vordruck({ typ, daten, aendere }: { typ: FormularTyp; daten: FormularDaten[FormularTyp]; aendere: (neu: FormularDaten[FormularTyp]) => void }) {
  switch (typ) {
    case 'anwesenheit': return <AnwesenheitForm d={daten as Anwesenheit} aendere={aendere} />;
    case 'tagesbericht': return <TagesberichtForm d={daten as Tagesbericht} aendere={aendere} />;
    case 'unfallbericht': return <UnfallberichtForm d={daten as Unfallbericht} aendere={aendere} />;
    case 'bescheinigung': return <BescheinigungForm d={daten as Bescheinigung} aendere={aendere} />;
    case 'stundenmeldung': return <StundenForm d={daten as Stundenmeldung} aendere={aendere} />;
  }
}

const Wert = ({ label, wert }: { label: string; wert: string }) => (wert ? <p><strong>{label}:</strong> <span style={{ whiteSpace: 'pre-line' }}>{wert}</span></p> : <p><strong>{label}:</strong> ______________________</p>);
const Tag = (d: string) => (d ? formatDatum(d) : '');

/** Druckvorlage (A4) – nur beim Drucken sichtbar; zeigt die Werte als Text statt in Eingabefeldern. */
export function VordruckDruck({ typ, daten }: { typ: FormularTyp; daten: FormularDaten[FormularTyp] }) {
  const kopf = <div className="formular-druck__kopf"><span>Stadt Frankenthal (Pfalz)</span><span>Kinder- und Jugendbüro</span></div>;
  if (typ === 'anwesenheit') {
    const d = daten as Anwesenheit;
    return (
      <div className="formular-druck" aria-hidden="true">
        {kopf}<h1>Anwesenheitsliste</h1>
        <Wert label="für die Maßnahme" wert={d.massnahme} /><Wert label="Teamer/Gruppe" wert={d.teamerGruppe} />
        <table><thead><tr><th>Name, Vorname</th>{d.days.map((t, i) => <th key={i}>{t}</th>)}</tr></thead>
          <tbody>{d.rows.map((r, i) => <tr key={i}><td>{r.name}</td>{r.status.map((s, j) => <td key={j}>{s}</td>)}</tr>)}</tbody></table>
      </div>
    );
  }
  if (typ === 'tagesbericht') {
    const d = daten as Tagesbericht;
    return (
      <div className="formular-druck" aria-hidden="true">
        {kopf}<h1>Tagesbericht</h1>
        <Wert label="Freizeit/Gruppe" wert={d.freizeitGruppe} /><Wert label="Teamer/in" wert={d.teamer} /><Wert label="Datum" wert={Tag(d.datum)} />
        <Wert label="Zeitraum – Tagesprogramm – besondere Vorkommnisse – Einkäufe" wert={d.bericht} />
        <Wert label="Fehlende Kinder" wert={d.fehlendeKinder} /><Wert label="Unterschrift Teamer" wert={d.unterschrift} />
      </div>
    );
  }
  if (typ === 'unfallbericht') {
    const d = daten as Unfallbericht;
    return (
      <div className="formular-druck" aria-hidden="true">
        {kopf}<h1>Unfallbericht</h1>
        <Wert label="Datum des Vorfalls" wert={Tag(d.datum)} /><Wert label="Betroffene" wert={d.betroffene} /><Wert label="Betreuungskraft" wert={d.betreuungskraft} />
        <Wert label="Ort / Uhrzeit" wert={d.ortUhrzeit} /><Wert label="Schäden" wert={d.schaeden} /><Wert label="Schilderung des Vorfalls" wert={d.schilderung} /><Wert label="Unterschrift" wert={d.unterschrift} />
      </div>
    );
  }
  if (typ === 'bescheinigung') {
    const d = daten as Bescheinigung;
    return (
      <div className="formular-druck" aria-hidden="true">
        {kopf}<h1>Bescheinigung</h1>
        <Wert label="Mein Sohn/meine Tochter" wert={d.kind} />
        <p><strong>Abholregelung:</strong> {d.regelung === 'allein' ? `darf alleine von der Freizeit ${d.alleinFreizeit} nach Hause gehen.` : 'wird von der Maßnahme abgeholt.'}</p>
        <Wert label="Ebenfalls zur Abholung berechtigt" wert={d.weitereAbholberechtigte} />
        <p>Ich bin darüber informiert, dass seitens der Stadt Frankenthal keine Weghaftung besteht.</p>
        <Wert label="Ort, Datum" wert={d.ortDatum} /><Wert label="Unterschrift des/der Erziehungsberechtigten" wert={d.unterschrift} />
      </div>
    );
  }
  const d = daten as Stundenmeldung;
  return (
    <div className="formular-druck" aria-hidden="true">
      <div className="formular-druck__kopf"><span>über Kinder- und Jugendbüro · am Bereich Zentrale Dienste, Abt. Personal</span><span>Datum: {Tag(d.datum)}</span></div>
      <h1>Stundenmeldung</h1>
      <Wert label="Freizeit" wert={d.freizeit} /><Wert label="Zeitraum" wert={d.zeitraum} /><Wert label="Nachname" wert={d.nachname} /><Wert label="Vorname" wert={d.vorname} />
      <table><thead><tr><th>Datum</th><th>Vormittag</th><th>Nachmittag</th><th>Stunden</th><th>Zwischensumme</th></tr></thead>
        <tbody>{d.rows.map((r, i) => <tr key={i}><td>{r.datum}</td><td>{r.vormittag}</td><td>{r.nachmittag}</td><td>{r.stunden}</td><td>{r.zwischensumme}</td></tr>)}</tbody>
        <tfoot><tr><th colSpan={3}>Endsumme</th><td colSpan={2}>{stundenSumme(d.rows).toLocaleString('de-DE')}</td></tr></tfoot></table>
      <Wert label="Unterschrift Betreuer" wert={d.unterschriftBetreuer} /><Wert label="Unterschrift Leitung Freizeit" wert={d.unterschriftLeitung} />
    </div>
  );
}

