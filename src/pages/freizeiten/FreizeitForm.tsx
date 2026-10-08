import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import {
  holeFreizeit, listeOrte, listeTags, loescheFreizeit, speichereFreizeit, type FreizeitFormular,
} from '../../freizeiten/api';
import { leeresFormular, formularAusDetail, validiereFreizeit, type Fehlerliste } from '../../freizeiten/formular';
import { FERIEN_LABEL, FREIZEIT_FARBEN, FREIZEIT_TYPEN, MAX_FERIENWOCHEN, freizeitFarbe, type Ferienzeitraum, type FreizeitTyp } from '../../freizeiten/logik';
import { nameBestaetigt } from '../PersonEntfernen';
import { Alert, Button, Card, PageHeader, SelectField, Spinner, TextField } from '../../components/ui';

const zahl = (v: string): number | '' => (v === '' ? '' : Number(v));

/** Koordination: Freizeit anlegen, ändern oder endgültig löschen. Lädt die Daten und übergibt sie an das Formular. */
export function FreizeitForm() {
  const { id } = useParams();
  const vorhanden = useLaden(async () => (id ? holeFreizeit(id) : null), `form-${id ?? 'neu'}`);
  if (!id) return <FormInhalt id={null} start={leeresFormular()} />;
  if (vorhanden.fehler) return <Alert ton="error">{vorhanden.fehler}</Alert>;
  if (vorhanden.laedt) return <Spinner />;
  if (!vorhanden.daten) return <Alert ton="error">Die Freizeit wurde nicht gefunden.</Alert>;
  return <FormInhalt key={id} id={id} start={formularAusDetail(vorhanden.daten)} />;
}

function FormInhalt({ id, start }: { id: string | null; start: FreizeitFormular }) {
  const navigate = useNavigate();
  const neu = id === null;
  const orte = useLaden(listeOrte, 'orte');
  const tags = useLaden(listeTags, 'tags');
  const [f, setF] = useState<FreizeitFormular>(start);
  const [fehler, setFehler] = useState<Fehlerliste>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [bestaetigung, setBestaetigung] = useState('');

  const set = <K extends keyof FreizeitFormular>(k: K, v: FreizeitFormular[K]) => setF((x) => ({ ...x, [k]: v }));

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const probleme = validiereFreizeit(f);
    setFehler(probleme); setMeldung(null);
    if (Object.keys(probleme).length > 0) return;
    setArbeitet(true);
    try {
      const fid = await speichereFreizeit(id, f);
      navigate(`/freizeiten/${fid}`);
    } catch (err) {
      setMeldung(fehlerText(err, 'Die Freizeit konnte nicht gespeichert werden.'));
    } finally { setArbeitet(false); }
  }

  async function endgueltigLoeschen() {
    if (!id) return;
    setArbeitet(true); setMeldung(null);
    try { await loescheFreizeit(id); navigate('/freizeiten', { replace: true }); }
    catch (err) { setMeldung(fehlerText(err, 'Die Freizeit konnte nicht gelöscht werden.')); setArbeitet(false); }
  }

  const maxWoche = f.ferienzeitraum ? MAX_FERIENWOCHEN[f.ferienzeitraum] : 6;

  return (
    <>
      <p><Link to={neu ? '/freizeiten' : `/freizeiten/${id}`}>← Zurück</Link></p>
      <PageHeader titel={neu ? 'Neue Freizeit' : 'Freizeit bearbeiten'} />
      {meldung && <Alert ton="error">{meldung}</Alert>}

      <form onSubmit={(e) => void speichern(e)} noValidate className="stack">
        <Card>
          <TextField label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} fehler={fehler.name} required />
          <SelectField label="Status" value={f.status} onChange={(e) => set('status', e.target.value as 'geplant' | 'abgesagt')}>
            <option value="geplant">Geplant</option>
            <option value="abgesagt">Abgesagt</option>
          </SelectField>
          <SelectField label="Typ" value={String(f.typ)} onChange={(e) => set('typ', e.target.value === '' ? '' : (Number(e.target.value) as FreizeitTyp))}
            hinweis="Nur Übernachtungsfreizeiten (Typ 4) haben im Wochenplan einen Abend-Abschnitt.">
            <option value="">– noch nicht festgelegt –</option>
            {(Object.keys(FREIZEIT_TYPEN) as unknown as FreizeitTyp[]).map((t) => <option key={t} value={t}>{`Typ ${t} · ${FREIZEIT_TYPEN[t]}`}</option>)}
          </SelectField>
          <label className="option">
            <input type="checkbox" checked={f.bewerbung_offen} onChange={(e) => set('bewerbung_offen', e.target.checked)} />
            <span>Bewerbungen möglich <span className="field__hint">(abschalten, wenn die Freizeit voll besetzt ist – sie steht dann als „voll“ in der Liste)</span></span>
          </label>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 160px' }}>
              <TextField label="Start" type="date" value={f.start_datum} onChange={(e) => set('start_datum', e.target.value)} fehler={fehler.start_datum} required />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <TextField label="Ende" type="date" value={f.ende_datum} onChange={(e) => set('ende_datum', e.target.value)} fehler={fehler.ende_datum} required />
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 160px' }}>
              <SelectField label="Ferienzeit" value={f.ferienzeitraum}
                onChange={(e) => setF((x) => ({ ...x, ferienzeitraum: e.target.value as Ferienzeitraum | '', ferienwoche: '' }))}>
                <option value="">– keine –</option>
                {(Object.keys(FERIEN_LABEL) as Ferienzeitraum[]).map((k) => <option key={k} value={k}>{FERIEN_LABEL[k]}</option>)}
              </SelectField>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <SelectField label="Ferienwoche" value={String(f.ferienwoche)} onChange={(e) => set('ferienwoche', zahl(e.target.value))} fehler={fehler.ferienwoche}
                disabled={!f.ferienzeitraum}>
                <option value="">– keine –</option>
                {Array.from({ length: maxWoche }, (_, i) => <option key={i + 1} value={i + 1}>Woche {i + 1}</option>)}
              </SelectField>
            </div>
          </div>
        </Card>

        <Card>
          <fieldset className="optionen">
            <legend className="field__label">Farbe</legend>
            <p className="field__hint">Zum Wiedererkennen in Listen, auf der Startseite und in der Zuordnung.</p>
            <div className="farbwahl">
              <label className="farbwahl__option">
                <input type="radio" name="farbe" checked={f.farbe === ''} onChange={() => set('farbe', '')} />
                <span className="fz-punkt" aria-hidden="true" style={{ background: id ? freizeitFarbe(id) : 'var(--border-strong)' }} />
                <span>Automatisch</span>
              </label>
              {FREIZEIT_FARBEN.map((c) => (
                <label key={c.id} className="farbwahl__option">
                  <input type="radio" name="farbe" checked={f.farbe === c.id} onChange={() => set('farbe', c.id)} />
                  <span className="fz-punkt" aria-hidden="true" style={{ background: c.wert }} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card>
          <h2>Ort</h2>
          <SelectField label="Ort" value={f.ort_id} onChange={(e) => set('ort_id', e.target.value)}
            hinweis={'Die Adresse kommt vom Ort. Neue Orte legst du unter „Mehr → Orte" an.'}>
            <option value="">– kein Ort –</option>
            {(orte.daten ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
        </Card>

        <Card>
          <h2>Weitere Angaben</h2>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 130px' }}>
              <TextField label="Arbeitsbeginn" type="time" value={f.arbeitsbeginn} onChange={(e) => set('arbeitsbeginn', e.target.value)} />
            </div>
            <div style={{ flex: '1 1 130px' }}>
              <TextField label="Arbeitsende" type="time" value={f.arbeitsende} onChange={(e) => set('arbeitsende', e.target.value)} fehler={fehler.arbeitsende} />
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 110px' }}>
              <TextField label="Alter von" type="number" min={0} value={f.alter_von} onChange={(e) => set('alter_von', zahl(e.target.value))} fehler={fehler.alter_von} />
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <TextField label="Alter bis" type="number" min={0} value={f.alter_bis} onChange={(e) => set('alter_bis', zahl(e.target.value))} fehler={fehler.alter_bis} />
            </div>
            <div style={{ flex: '1 1 150px' }}>
              <TextField label="Max. Teilnehmende" type="number" min={1} value={f.max_teilnehmende} onChange={(e) => set('max_teilnehmende', zahl(e.target.value))} fehler={fehler.max_teilnehmende} />
            </div>
          </div>
          <fieldset className="optionen">
            <legend className="field__label">Schlagworte</legend>
            {(tags.daten ?? []).map((t) => (
              <label key={t} className="option">
                <input type="checkbox" checked={f.tags.includes(t)}
                  onChange={(e) => set('tags', e.target.checked ? [...f.tags, t] : f.tags.filter((x) => x !== t))} />
                <span>{t}</span>
              </label>
            ))}
          </fieldset>
        </Card>

        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>{neu ? 'Freizeit anlegen' : 'Änderungen speichern'}</Button>
          <Link className="btn" to={neu ? '/freizeiten' : `/freizeiten/${id}`}>Abbrechen</Link>
        </div>
      </form>

      {!neu && (
        <Card className="gefahr" >
          <h2>Freizeit löschen</h2>
          {!loeschen ? (
            <>
              <p>Löscht die Freizeit endgültig – mit Team-Zuordnung, Wochenplan, Hinweisen, Absprachen und Bewerbungen. Lebensmittelbestände bleiben am Ort erhalten.
                Wenn sie nur nicht stattfindet, setze den Status stattdessen auf „Abgesagt".</p>
              <Button variante="danger" onClick={() => setLoeschen(true)}>Löschen …</Button>
            </>
          ) : (
            <>
              <Alert ton="error">Das lässt sich nicht rückgängig machen.</Alert>
              <TextField label={`Zur Bestätigung den Namen eingeben: ${f.name}`} value={bestaetigung} onChange={(e) => setBestaetigung(e.target.value)} autoComplete="off" />
              <div className="row">
                <Button variante="danger" laedt={arbeitet} disabled={!nameBestaetigt(bestaetigung, f.name)} onClick={() => void endgueltigLoeschen()}>Endgültig löschen</Button>
                <Button onClick={() => { setLoeschen(false); setBestaetigung(''); }}>Abbrechen</Button>
              </div>
            </>
          )}
        </Card>
      )}
    </>
  );
}
