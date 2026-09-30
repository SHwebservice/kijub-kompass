import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import {
  aendereEingang, aendereVerbrauch, listeEingaenge, listeVerbrauch, loescheEingang, loescheVerbrauch, trageEingangEin, trageVerbrauchEin,
  type FreizeitDetailDaten,
} from '../../freizeiten/api';
import { formatDatum, formatKurz, heuteIso, tageVonBis } from '../../freizeiten/logik';
import { artikelListe, formatMenge, parseMenge, standardTag, type Artikel } from '../../freizeiten/lebensmittel';
import { sendePush } from '../../mitteilungen/senden';
import { Alert, Badge, Button, Card, EmptyState, Spinner, TextField } from '../../components/ui';

/** Führt eine Änderung aus und lädt neu; liefert true bei Erfolg (Fehler zeigt die Seite oben an). */
type Ausfuehren = (aktion: () => Promise<void>) => Promise<boolean>;

/** Eine Buchung (Eingang oder Verbrauch) mit Ändern und Löschen. */
function BuchungZeile({ datum, menge, einheit, tage, speichern, loeschen, bezeichnung }: {
  datum: string; menge: number; einheit: string; tage?: string[]; bezeichnung: string;
  speichern: (menge: number, datum: string) => Promise<boolean>; loeschen: () => Promise<boolean>;
}) {
  const [bearbeite, setBearbeite] = useState(false);
  const [text, setText] = useState(formatMenge(menge));
  const [tag, setTag] = useState(datum);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!bearbeite) {
    return (
      <li className="list__item">
        <span>{formatDatum(datum)} · <strong>{formatMenge(menge)} {einheit}</strong></span>
        <span className="row" style={{ gap: 'var(--space-2)' }}>
          <Button klein aria-label={`${bezeichnung} vom ${formatDatum(datum)} ändern`}
            onClick={() => { setText(formatMenge(menge)); setTag(datum); setFehler(null); setBearbeite(true); }}>Ändern</Button>
          <Button klein variante="danger" aria-label={`${bezeichnung} vom ${formatDatum(datum)} löschen`}
            onClick={() => { if (window.confirm('Diese Buchung löschen?')) void loeschen(); }}>Löschen</Button>
        </span>
      </li>
    );
  }
  return (
    <li className="list__item" style={{ display: 'block' }}>
      <form className="row" style={{ alignItems: 'flex-end' }} noValidate onSubmit={(e) => {
        e.preventDefault();
        const m = parseMenge(text);
        if (m === null) { setFehler('Bitte eine Menge größer 0 eingeben.'); return; }
        setFehler(null);
        void speichern(m, tag).then((ok) => { if (ok) setBearbeite(false); });
      }}>
        <div style={{ flex: '1 1 110px' }}>
          <TextField label={`Menge (${bezeichnung} vom ${formatDatum(datum)})`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} fehler={fehler} />
        </div>
        {tage && (
          <div className="field" style={{ flex: '1 1 130px' }}>
            <label className="field__label" htmlFor={`bz-tag-${bezeichnung}-${datum}-${menge}`}>Tag</label>
            <select id={`bz-tag-${bezeichnung}-${datum}-${menge}`} className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
              {tage.map((t) => <option key={t} value={t}>{formatKurz(t)}</option>)}
            </select>
          </div>
        )}
        <div className="field row"><Button variante="primary" type="submit">Speichern</Button><Button onClick={() => setBearbeite(false)}>Abbrechen</Button></div>
      </form>
    </li>
  );
}

function ArtikelKarte({ a, tage, standard, ortId, freizeitId, ausfuehren }: {
  a: Artikel; tage: string[]; standard: string; ortId: string; freizeitId: string; ausfuehren: Ausfuehren;
}) {
  const [menge, setMenge] = useState('');
  const [tag, setTag] = useState(standard);
  const [fehler, setFehler] = useState<string | null>(null);
  const ton = a.status === 'leer' ? 'danger' : a.status === 'knapp' ? 'warning' : 'success';

  function verbrauchen(e: FormEvent) {
    e.preventDefault();
    const m = parseMenge(menge);
    if (m === null) { setFehler('Bitte eine Menge größer 0 eingeben.'); return; }
    setFehler(null);
    void ausfuehren(async () => { await trageVerbrauchEin(ortId, freizeitId, { name: a.name, menge: m, datum: tag }); sendePush('lebensmittel', ortId, { name: a.name }); }).then((ok) => { if (ok) setMenge(''); });
  }

  return (
    <li className="list__item" style={{ display: 'block' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong>{a.name}</strong>
        <span>
          {a.status !== 'ok' && <Badge ton={ton}>{a.status === 'leer' ? 'Leer' : 'Bald leer'}</Badge>}{' '}
          <strong>{formatMenge(Math.max(0, a.rest))} {a.einheit}</strong> noch da
        </span>
      </div>
      <div className="balken" role="progressbar" aria-label={`Bestand ${a.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.prozent}>
        <div className={`balken__fuell balken__fuell--${a.status}`} style={{ width: `${a.prozent}%` }} />
      </div>
      <div className="list__meta">
        <span>Erhalten: {formatMenge(a.erhalten)} {a.einheit}</span><span>Verbraucht: {formatMenge(a.verbraucht)} {a.einheit}</span>
      </div>
      {a.prognose && (
        <p className={a.prognose.reicht ? 'field__hint' : 'hinweis-warnung'} style={{ margin: 'var(--space-2) 0 0' }}>
          {a.prognose.reicht ? '📈' : '⚠️'} Hochrechnung: etwa {formatMenge(a.prognose.bedarf)} {a.einheit} für die restlichen {a.prognose.resttage} {a.prognose.resttage === 1 ? 'Tag' : 'Tage'}
          {a.prognose.reicht ? '.' : ' – reicht voraussichtlich nicht.'}
        </p>
      )}

      <details style={{ marginTop: 'var(--space-3)' }}>
        <summary>Buchungen von „{a.name}“</summary>
        <form className="row" style={{ alignItems: 'flex-end', margin: 'var(--space-3) 0' }} onSubmit={verbrauchen} noValidate>
          <div style={{ flex: '1 1 110px' }}>
            <TextField label={`Verbrauch von ${a.name}`} inputMode="decimal" value={menge} onChange={(e) => setMenge(e.target.value)} fehler={fehler} placeholder={a.einheit || 'Menge'} />
          </div>
          <div className="field" style={{ flex: '1 1 130px' }}>
            <label className="field__label" htmlFor={`verbrauch-tag-${a.name}`}>Tag</label>
            <select id={`verbrauch-tag-${a.name}`} className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
              {tage.map((t) => <option key={t} value={t}>{formatKurz(t)}</option>)}
            </select>
          </div>
          <div className="field"><Button variante="primary" type="submit">Verbrauch eintragen</Button></div>
        </form>

        <h3>Verbrauch</h3>
        {a.verbrauch.length === 0 ? <p className="field__hint">Noch nichts verbraucht.</p> : (
          <ul className="list" aria-label={`Verbrauchsbuchungen von ${a.name}`}>
            {a.verbrauch.map((v) => (
              <BuchungZeile key={v.id} datum={v.datum} menge={v.menge} einheit={a.einheit} bezeichnung="Verbrauch"
                tage={[...new Set([...tage, v.datum])].sort()}
                speichern={(m, d) => ausfuehren(() => aendereVerbrauch(v.id, { menge: m, datum: d }))}
                loeschen={() => ausfuehren(() => loescheVerbrauch(v.id))} />
            ))}
          </ul>
        )}
        <h3>Wareneingang</h3>
        <ul className="list" aria-label={`Wareneingänge von ${a.name}`}>
          {a.eingaenge.map((e) => (
            <BuchungZeile key={e.id} datum={e.datum} menge={e.menge} einheit={e.einheit ?? a.einheit} bezeichnung="Eingang"
              speichern={(m) => ausfuehren(() => aendereEingang(e.id, m))}
              loeschen={() => ausfuehren(() => loescheEingang(e.id))} />
          ))}
        </ul>
      </details>
    </li>
  );
}

/**
 * Lebensmittelbestand der Freizeit. Der Bestand wird am ORT geführt: Freizeiten, die nacheinander am selben Ort stattfinden,
 * führen ihn automatisch fort. Nur für Leitung und Koordination.
 */
export function LebensmittelTab({ freizeit: f }: { freizeit: FreizeitDetailDaten }) {
  const ortId = f.ort_id;
  const eingaenge = useLaden(async () => (ortId ? listeEingaenge(ortId) : []), `eingaenge-${ortId}`);
  const verbrauch = useLaden(async () => (ortId ? listeVerbrauch(ortId) : []), `verbrauch-${ortId}`);
  useLive(['lebensmittel_eingang', 'lebensmittel_verbrauch'], () => { eingaenge.neuLaden(); verbrauch.neuLaden(); });
  const [fehler, setFehler] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', menge: '', einheit: '' });
  const [formFehler, setFormFehler] = useState<string | null>(null);

  if (!ortId) {
    return (
      <EmptyState icon="📍" titel="Dieser Freizeit ist noch kein Ort zugeordnet">
        Der Lebensmittelbestand wird am Ort geführt. Bitte die Koordination, der Freizeit einen Ort zuzuordnen.
      </EmptyState>
    );
  }

  const heute = heuteIso();
  const tage = tageVonBis(f.start_datum, f.ende_datum);
  const standard = standardTag(f, heute);
  const artikel = artikelListe(eingaenge.daten ?? [], verbrauch.daten ?? [], f);

  const ausfuehren: Ausfuehren = async (aktion) => {
    setFehler(null);
    try { await aktion(); eingaenge.neuLaden(); verbrauch.neuLaden(); return true; }
    catch (e) { setFehler(fehlerText(e)); return false; }
  };

  async function wareneingang(e: FormEvent) {
    e.preventDefault();
    const m = parseMenge(form.menge);
    if (!form.name.trim()) { setFormFehler('Bitte ein Lebensmittel angeben.'); return; }
    if (m === null) { setFormFehler('Bitte eine Menge größer 0 eingeben.'); return; }
    setFormFehler(null);
    const einheit = form.einheit.trim() || (artikel.find((a) => a.name.toLowerCase() === form.name.trim().toLowerCase())?.einheit ?? '');
    const ok = await ausfuehren(() => trageEingangEin(ortId!, f.id, { name: form.name, menge: m, einheit, datum: heute }));
    if (ok) setForm({ name: '', menge: '', einheit: '' });
  }

  const kritisch = artikel.filter((a) => a.status !== 'ok');

  return (
    <div className="stack">
      {(eingaenge.fehler || verbrauch.fehler || fehler) && <Alert ton="error">{eingaenge.fehler ?? verbrauch.fehler ?? fehler}</Alert>}
      <p className="field__hint" style={{ margin: 0 }}>Der Bestand gilt für den Ort „{f.ort_name}“ und wird von allen Freizeiten dort gemeinsam geführt.</p>

      {kritisch.length > 0 && (
        <Alert ton="warning">
          <strong>Achtung:</strong> {kritisch.map((a) => `${a.name} (${a.status === 'leer' ? 'leer' : 'bald leer'})`).join(', ')}
        </Alert>
      )}

      <Card>
        <h2>Wareneingang</h2>
        <form onSubmit={(e) => void wareneingang(e)} noValidate>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '2 1 180px' }}>
              <TextField label="Lebensmittel" list="lm-namen" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="off" />
              <datalist id="lm-namen">{artikel.map((a) => <option key={a.name} value={a.name} />)}</datalist>
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <TextField label="Menge" inputMode="decimal" value={form.menge} onChange={(e) => setForm({ ...form, menge: e.target.value })} />
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <TextField label="Einheit" value={form.einheit} onChange={(e) => setForm({ ...form, einheit: e.target.value })} placeholder="kg, l, Stück …" />
            </div>
          </div>
          {formFehler && <Alert ton="error">{formFehler}</Alert>}
          <Button variante="primary" type="submit">Eingang eintragen</Button>
        </form>
      </Card>

      {(eingaenge.laedt || verbrauch.laedt) && <Spinner />}
      {!eingaenge.laedt && !verbrauch.laedt && artikel.length === 0 && (
        <EmptyState icon="🥛" titel="Noch keine Lebensmittel eingetragen">Trage oben den ersten Wareneingang ein.</EmptyState>
      )}
      <ul className="list">
        {artikel.map((a) => (
          <ArtikelKarte key={a.name} a={a} tage={tage} standard={standard} ortId={ortId} freizeitId={f.id} ausfuehren={ausfuehren} />
        ))}
      </ul>
    </div>
  );
}
