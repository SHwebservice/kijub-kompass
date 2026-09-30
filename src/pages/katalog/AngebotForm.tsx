import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { listeKatalog, reicheVorschlagEin, speichereAngebot } from '../../katalog/api';
import { ausWordHtml } from '../../katalog/import';
import { formularAus, leeresAngebot, validiereAngebot, type AngebotFormular } from '../../katalog/logik';
import { wordZuHtml } from '../../katalog/word';
import { Alert, Button, Card, PageHeader, Spinner } from '../../components/ui';
import { AngebotFelder } from './AngebotFelder';

type Modus = 'neu' | 'bearbeiten' | 'vorschlag';

/** Programmpunkt anlegen oder bearbeiten (Koordination) bzw. vorschlagen (alle). Word-Plan-Dateien füllen das Formular vor. */
export function AngebotForm({ modus }: { modus: Modus }) {
  const { id } = useParams();
  const katalog = useLaden(listeKatalog, 'katalog');
  if (modus === 'bearbeiten') {
    if (katalog.fehler) return <Alert ton="error">{katalog.fehler}</Alert>;
    if (katalog.laedt) return <Spinner />;
    const a = katalog.daten?.find((x) => x.id === id);
    if (!a) return <Alert ton="error">Der Programmpunkt wurde nicht gefunden.</Alert>;
    return <FormInhalt key={a.id} modus={modus} id={a.id} start={formularAus(a)} />;
  }
  return <FormInhalt modus={modus} id={null} start={leeresAngebot()} />;
}

function FormInhalt({ modus, id, start }: { modus: Modus; id: string | null; start: AngebotFormular }) {
  const { ich } = useAuth();
  const navigate = useNavigate();
  const [w, setW] = useState<AngebotFormular>(start);
  const [fehler, setFehler] = useState<{ name?: string; kategorie?: string; lang?: string }>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [wordStatus, setWordStatus] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  if (!ich) return null;

  const titel = modus === 'neu' ? 'Neuer Programmpunkt' : modus === 'bearbeiten' ? 'Programmpunkt bearbeiten' : 'Programmpunkt vorschlagen';

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const probleme = validiereAngebot(w);
    setFehler(probleme); setMeldung(null);
    if (Object.keys(probleme).length > 0) return;
    setArbeitet(true);
    try {
      if (modus === 'vorschlag') {
        const vorschlagId = await reicheVorschlagEin(ich!.id, w);
        if (vorschlagId) sendePush('vorschlag', vorschlagId);
        navigate('/katalog/vorschlaege', { replace: true, state: { eingereicht: true } });
      } else {
        const neu = await speichereAngebot(id, w);
        navigate(`/katalog/${neu}`, { replace: true });
      }
    } catch (err) {
      setMeldung(fehlerText(err, 'Das Speichern hat nicht geklappt.'));
    } finally { setArbeitet(false); }
  }

  async function wordLesen(datei: File | undefined) {
    if (!datei) return;
    setWordStatus('Datei wird gelesen …');
    try {
      const teil = ausWordHtml(await wordZuHtml(datei), datei.name);
      setW((alt) => ({ ...alt, ...teil, alter_gruppen: alt.alter_gruppen }));
      setWordStatus('Übernommen – bitte die Angaben prüfen und fehlende ergänzen.');
    } catch {
      setWordStatus('Die Datei konnte nicht gelesen werden. Es funktionieren nur Word-Dateien (.docx).');
    }
  }

  return (
    <>
      <p><Link to={id ? `/katalog/${id}` : '/katalog'}>← Zurück</Link></p>
      <PageHeader titel={titel} />
      {modus === 'vorschlag' && <Alert ton="info">Dein Vorschlag geht an die Koordination. Sie prüft ihn und übernimmt ihn in den Katalog.</Alert>}
      {meldung && <Alert ton="error">{meldung}</Alert>}

      <form onSubmit={(e) => void speichern(e)} noValidate className="stack">
        <Card>
          <div className="field">
            <label className="field__label" htmlFor="word-datei">Aus einem Word-Plan vorbefüllen (optional)</label>
            <input id="word-datei" type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => { void wordLesen(e.target.files?.[0]); e.target.value = ''; }} />
            {wordStatus && <span className="field__hint" role="status">{wordStatus}</span>}
          </div>
        </Card>
        <Card>
          <AngebotFelder wert={w} aendere={setW} fehler={fehler} />
        </Card>
        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>{modus === 'vorschlag' ? 'Vorschlag einreichen' : 'Speichern'}</Button>
          <Link className="btn" to={id ? `/katalog/${id}` : '/katalog'}>Abbrechen</Link>
        </div>
      </form>
    </>
  );
}
