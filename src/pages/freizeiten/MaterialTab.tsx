import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import {
  aendereMaterial, gibMateriallisteAb, holeMaterialAbgabe, holeNamen, legeMaterialAn, listeMaterialliste, loescheMaterial,
  type FreizeitDetailDaten, type MaterialEingabe, type MaterialPosten,
} from '../../freizeiten/api';
import { Alert, Button, Card, EmptyState, Spinner, TextField } from '../../components/ui';

const LEER: MaterialEingabe = { name: '', menge: '', notiz: '' };
const zeitText = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Eine Zeile der Materialliste: anzeigen oder bearbeiten. */
function PostenZeile({ m, arbeitet, ausfuehren }: { m: MaterialPosten; arbeitet: boolean; ausfuehren: (fn: () => Promise<void>) => void }) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [e, setE] = useState<MaterialEingabe>({ name: m.name, menge: m.menge, notiz: m.notiz });
  if (bearbeiten) {
    return (
      <li className="list__item">
        <div className="row" style={{ alignItems: 'flex-end', flex: 1 }}>
          <div style={{ flex: '2 1 160px' }}><TextField label={`Was (${m.name})`} value={e.name} maxLength={200} onChange={(x) => setE({ ...e, name: x.target.value })} /></div>
          <div style={{ flex: '1 1 90px' }}><TextField label="Menge" value={e.menge} maxLength={100} onChange={(x) => setE({ ...e, menge: x.target.value })} /></div>
          <div style={{ flex: '2 1 160px' }}><TextField label="Notiz" value={e.notiz} maxLength={500} onChange={(x) => setE({ ...e, notiz: x.target.value })} /></div>
          <Button klein variante="primary" disabled={arbeitet || !e.name.trim()} onClick={() => ausfuehren(async () => { await aendereMaterial(m.id, e); setBearbeiten(false); })}>Speichern</Button>
          <Button klein onClick={() => { setE({ name: m.name, menge: m.menge, notiz: m.notiz }); setBearbeiten(false); }}>Abbrechen</Button>
        </div>
      </li>
    );
  }
  return (
    <li className="list__item">
      <div className="list__main">
        <div className="list__title" style={{ whiteSpace: 'normal' }}>{m.name}{m.menge && <span className="field__hint"> · {m.menge}</span>}</div>
        {m.notiz && <div className="list__meta"><span>{m.notiz}</span></div>}
      </div>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        <Button klein aria-label={`${m.name} bearbeiten`} onClick={() => setBearbeiten(true)}>Bearbeiten</Button>
        <Button klein variante="ghost" disabled={arbeitet} aria-label={`${m.name} löschen`} onClick={() => ausfuehren(() => loescheMaterial(m.id))}>Löschen</Button>
      </div>
    </li>
  );
}

/**
 * Materialliste der Freizeit (Leitung und Freizeitenkoordination): was gebraucht wird, mit Menge und Notiz. Die Leitung gibt die Liste
 * an die Freizeitenkoordination ab (Mitteilung); das hakt den Punkt der Checkliste ab. Nach Änderungen lässt sie sich erneut abgeben.
 */
export function MaterialTab({ freizeit: f }: { freizeit: FreizeitDetailDaten }) {
  const liste = useLaden(() => listeMaterialliste(f.id), `materialliste-${f.id}`);
  const abgabe = useLaden(() => holeMaterialAbgabe(f.id), `materialabgabe-${f.id}`);
  const von = abgabe.daten?.abgegeben_von ?? null;
  const namen = useLaden(async (): Promise<Record<string, string>> => (von ? holeNamen([von]) : {}), `materialabgabe-name-${von}`);
  const [neu, setNeu] = useState<MaterialEingabe>(LEER);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const posten = liste.daten ?? [];
  const geaendertNachAbgabe = !!abgabe.daten && posten.some((m) => m.created_at > abgabe.daten!.abgegeben_am);

  async function ausfuehren(fn: () => Promise<void>) {
    setArbeitet(true); setFehler(null); setErfolg(null);
    try { await fn(); liste.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  function hinzufuegen(ev: FormEvent) {
    ev.preventDefault();
    if (!neu.name.trim()) { setFehler('Bitte angeben, was gebraucht wird.'); return; }
    void ausfuehren(async () => { await legeMaterialAn(f.id, neu); setNeu(LEER); });
  }

  async function abgeben() {
    if (!window.confirm(`Die Materialliste (${posten.length} ${posten.length === 1 ? 'Position' : 'Positionen'}) an die Freizeitenkoordination abgeben?`)) return;
    setArbeitet(true); setFehler(null); setErfolg(null);
    try {
      await gibMateriallisteAb(f.id);
      sendePush('materialliste', f.id);
      setErfolg('Die Materialliste ist abgegeben. Die Freizeitenkoordination hat eine Mitteilung bekommen.');
      abgabe.neuLaden();
    } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  return (
    <div className="stack">
      <Card>
        <h2>Materialliste</h2>
        <p className="field__hint">Was wird für die Freizeit gebraucht? Schreibe die Liste hier und gib sie an die Freizeitenkoordination ab – spätestens 4 Wochen vor Beginn.</p>
        {(liste.fehler || abgabe.fehler) && <Alert ton="error">{liste.fehler ?? abgabe.fehler}</Alert>}
        {fehler && <Alert ton="error">{fehler}</Alert>}
        {erfolg && <Alert ton="success">{erfolg}</Alert>}
        {abgabe.daten && (
          <p role="status"><strong>Abgegeben</strong> am {zeitText(abgabe.daten.abgegeben_am)}{von && namen.daten?.[von] ? ` von ${namen.daten[von]}` : ''}.
            {geaendertNachAbgabe && <span className="checkliste__ueberfaellig"> Seitdem sind neue Positionen dazugekommen – bitte erneut abgeben.</span>}</p>
        )}
        {liste.laedt && <Spinner />}
        {!liste.laedt && posten.length === 0 && <EmptyState icon="🎒" titel="Noch kein Material eingetragen" />}
        <ul className="list" aria-label="Materialliste">
          {posten.map((m) => <PostenZeile key={`${m.id}-${m.name}-${m.menge}-${m.notiz}`} m={m} arbeitet={arbeitet} ausfuehren={(fn) => void ausfuehren(fn)} />)}
        </ul>
        {posten.length > 0 && (
          <p style={{ marginTop: 'var(--space-3)' }}>
            <Button variante="primary" laedt={arbeitet} onClick={() => void abgeben()}>{abgabe.daten ? 'Erneut an die Freizeitenkoordination abgeben' : 'An die Freizeitenkoordination abgeben'}</Button>
          </p>
        )}
      </Card>

      <Card>
        <h3>Position hinzufügen</h3>
        <form onSubmit={hinzufuegen} noValidate>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '2 1 180px' }}><TextField label="Was wird gebraucht?" value={neu.name} maxLength={200} onChange={(e) => setNeu({ ...neu, name: e.target.value })} /></div>
            <div style={{ flex: '1 1 100px' }}><TextField label="Menge (optional)" value={neu.menge} maxLength={100} onChange={(e) => setNeu({ ...neu, menge: e.target.value })} /></div>
            <div style={{ flex: '2 1 180px' }}><TextField label="Notiz (optional)" value={neu.notiz} maxLength={500} onChange={(e) => setNeu({ ...neu, notiz: e.target.value })} /></div>
          </div>
          <Button variante="primary" type="submit" laedt={arbeitet}>Hinzufügen</Button>
        </form>
      </Card>
    </div>
  );
}
