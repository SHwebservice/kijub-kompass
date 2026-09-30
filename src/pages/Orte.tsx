import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { listeOrte, loescheOrt, speichereOrt, type Ort } from '../freizeiten/api';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, TextField } from '../components/ui';

const leer = { name: '', adresse: '', lieferstelle_nr: '' };

/** Koordination: Orte (Veranstaltungsorte) verwalten. */
export function Orte() {
  const orte = useLaden(listeOrte, 'orte');
  const [bearbeite, setBearbeite] = useState<string | 'neu' | null>(null);
  const [form, setForm] = useState(leer);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const oeffnen = (o?: Ort) => {
    setFehler(null);
    setBearbeite(o ? o.id : 'neu');
    setForm(o ? { name: o.name, adresse: o.adresse ?? '', lieferstelle_nr: o.lieferstelle_nr ?? '' } : leer);
  };

  async function speichern(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFehler('Bitte einen Namen eingeben.'); return; }
    setArbeitet(true); setFehler(null);
    try {
      await speichereOrt(bearbeite === 'neu' ? null : bearbeite, form);
      setBearbeite(null); orte.neuLaden();
    } catch (err) { setFehler(fehlerText(err, 'Der Ort konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  async function loeschen(o: Ort) {
    if (!window.confirm(`Ort „${o.name}" löschen?`)) return;
    setFehler(null);
    try { await loescheOrt(o.id); orte.neuLaden(); }
    catch (err) { setFehler(fehlerText(err, 'Der Ort konnte nicht gelöscht werden.')); }
  }

  return (
    <>
      <p><Link to="/mehr">← Mehr</Link></p>
      <PageHeader titel="Orte">
        <Button variante="primary" onClick={() => oeffnen()}>Neuer Ort</Button>
      </PageHeader>
      {(orte.fehler || fehler) && <Alert ton="error">{orte.fehler ?? fehler}</Alert>}

      {bearbeite && (
        <Card>
          <form onSubmit={(e) => void speichern(e)} noValidate>
            <h2>{bearbeite === 'neu' ? 'Neuer Ort' : 'Ort bearbeiten'}</h2>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <TextField label="Adresse" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} autoComplete="off" />
            <TextField label="Lieferstelle (Nr.)" value={form.lieferstelle_nr} onChange={(e) => setForm({ ...form, lieferstelle_nr: e.target.value })} />
            <div className="row">
              <Button variante="primary" type="submit" laedt={arbeitet}>Speichern</Button>
              <Button onClick={() => setBearbeite(null)}>Abbrechen</Button>
            </div>
          </form>
        </Card>
      )}

      {orte.laedt && <Spinner />}
      {!orte.laedt && orte.daten?.length === 0 && <EmptyState icon="📍" titel="Noch keine Orte" />}
      <ul className="list" style={{ marginTop: 'var(--space-4)' }}>
        {(orte.daten ?? []).map((o) => (
          <li key={o.id} className="list__item">
            <div className="list__main">
              <div className="list__title">{o.name}</div>
              <div className="list__meta">
                {o.adresse && <span>{o.adresse}</span>}
                {o.lieferstelle_nr && <Badge>Lieferstelle {o.lieferstelle_nr}</Badge>}
                <Badge>{o.freizeiten} {o.freizeiten === 1 ? 'Freizeit' : 'Freizeiten'}</Badge>
                {o.treffs > 0 && <Badge>{o.treffs} {o.treffs === 1 ? 'Treff' : 'Treffs'}</Badge>}
              </div>
            </div>
            <div className="row" style={{ gap: 'var(--space-2)' }}>
              <Button klein onClick={() => oeffnen(o)}>Bearbeiten</Button>
              <Button klein variante="danger" disabled={o.freizeiten + o.treffs > 0} title={o.freizeiten + o.treffs > 0 ? 'Der Ort wird noch verwendet' : undefined}
                onClick={() => void loeschen(o)}>Löschen</Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
