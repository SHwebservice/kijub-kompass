import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { listeOrte } from '../../freizeiten/api';
import { holeTreff, loescheTreff, speichereTreff, type TreffFormular } from '../../treffs/api';
import { leereTage, STANDARD_BIS, STANDARD_VON, tageAusOeffnungszeiten, validiereTreff, WOCHENTAGE, wochentagName } from '../../treffs/logik';
import { nameBestaetigt } from '../PersonEntfernen';
import { Alert, Button, Card, PageHeader, SelectField, Spinner, TextField } from '../../components/ui';

/** Koordination: Treff anlegen, ändern (mit Öffnungszeiten) oder endgültig löschen. */
export function TreffForm() {
  const { id } = useParams();
  const vorhanden = useLaden(async () => (id ? holeTreff(id) : null), `treffform-${id ?? 'neu'}`);
  if (!id) return <FormInhalt id={null} start={{ name: '', ort_id: '', adresse_abw: '', tage: leereTage() }} />;
  if (vorhanden.fehler) return <Alert ton="error">{vorhanden.fehler}</Alert>;
  if (vorhanden.laedt) return <Spinner />;
  if (!vorhanden.daten) return <Alert ton="error">Der Treff wurde nicht gefunden.</Alert>;
  const d = vorhanden.daten;
  return <FormInhalt key={id} id={id} start={{ name: d.name, ort_id: d.ort_id ?? '', adresse_abw: d.adresse_abw ?? '', tage: tageAusOeffnungszeiten(d.oeffnungszeiten) }} />;
}

function FormInhalt({ id, start }: { id: string | null; start: TreffFormular }) {
  const navigate = useNavigate();
  const neu = id === null;
  const orte = useLaden(listeOrte, 'orte');
  const [f, setF] = useState<TreffFormular>(start);
  const [fehler, setFehler] = useState<{ name?: string; tage?: string }>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [loeschen, setLoeschen] = useState(false);
  const [bestaetigung, setBestaetigung] = useState('');

  const set = <K extends keyof TreffFormular>(k: K, v: TreffFormular[K]) => setF((x) => ({ ...x, [k]: v }));
  const setTag = (w: number, teil: Partial<TreffFormular['tage'][number]>) => setF((x) => ({ ...x, tage: { ...x.tage, [w]: { ...x.tage[w]!, ...teil } } }));

  // Ein Ort gehört höchstens einem Treff.
  const freieOrte = (orte.daten ?? []).filter((o) => o.treffs === 0 || o.id === start.ort_id);

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const probleme = validiereTreff(f);
    setFehler(probleme); setMeldung(null);
    if (Object.keys(probleme).length > 0) return;
    setArbeitet(true);
    try {
      const tid = await speichereTreff(id, f);
      navigate(`/treffs/${tid}`);
    } catch (err) {
      setMeldung(fehlerText(err, 'Der Treff konnte nicht gespeichert werden.'));
    } finally { setArbeitet(false); }
  }

  async function endgueltigLoeschen() {
    if (!id) return;
    setArbeitet(true); setMeldung(null);
    try { await loescheTreff(id); navigate('/treffs', { replace: true }); }
    catch (err) { setMeldung(fehlerText(err, 'Der Treff konnte nicht gelöscht werden.')); setArbeitet(false); }
  }

  return (
    <>
      <p><Link to={neu ? '/treffs' : `/treffs/${id}`}>← Zurück</Link></p>
      <PageHeader titel={neu ? 'Neuer Treff' : 'Treff bearbeiten'} />
      {meldung && <Alert ton="error">{meldung}</Alert>}

      <form onSubmit={(e) => void speichern(e)} noValidate className="stack">
        <Card>
          <TextField label="Name" value={f.name} onChange={(e) => set('name', e.target.value)} fehler={fehler.name} required />
          <SelectField label="Ort" value={f.ort_id} onChange={(e) => set('ort_id', e.target.value)}
            hinweis={'Ein Ort gehört höchstens einem Treff. Neue Orte legst du unter „Mehr → Orte“ an.'}>
            <option value="">– kein Ort –</option>
            {freieOrte.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </SelectField>
          <TextField label="Abweichende Adresse (optional)" value={f.adresse_abw} onChange={(e) => set('adresse_abw', e.target.value)}
            hinweis="Nur nötig, wenn die Adresse des Ortes nicht passt." />
        </Card>

        <Card>
          <h2>Öffnungszeiten</h2>
          <p className="field__hint">Aus den Öffnungszeiten werden Dienstzeiten und Stunden berechnet.</p>
          {fehler.tage && <Alert ton="error">{fehler.tage}</Alert>}
          <ul className="list">
            {WOCHENTAGE.map((w) => {
              const t = f.tage[w]!;
              return (
                <li key={w} className="list__item">
                  <label className="option" style={{ minWidth: 130 }}>
                    <input type="checkbox" checked={t.an} onChange={(e) => setTag(w, { an: e.target.checked, von: t.von || STANDARD_VON, bis: t.bis || STANDARD_BIS })} />
                    <span>{wochentagName(w)}</span>
                  </label>
                  {t.an && (
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      <input className="input" type="time" aria-label={`${wochentagName(w)} von`} value={t.von} onChange={(e) => setTag(w, { von: e.target.value })} style={{ width: 'auto' }} />
                      <span>bis</span>
                      <input className="input" type="time" aria-label={`${wochentagName(w)} bis`} value={t.bis} onChange={(e) => setTag(w, { bis: e.target.value })} style={{ width: 'auto' }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>{neu ? 'Treff anlegen' : 'Änderungen speichern'}</Button>
          <Link className="btn" to={neu ? '/treffs' : `/treffs/${id}`}>Abbrechen</Link>
        </div>
      </form>

      {!neu && (
        <Card className="gefahr">
          <h2>Treff löschen</h2>
          {!loeschen ? (
            <>
              <p>Löscht den Treff endgültig – mit Team-Zuordnung, Öffnungszeiten, Wochenprogramm, Dienstplan, Absprachen und Nachweisen.</p>
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
