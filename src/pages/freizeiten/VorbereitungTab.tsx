import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import type { FreizeitDetailDaten } from '../../freizeiten/api';
import { formatKurz, heuteIso } from '../../freizeiten/logik';
import { ladeCheckliste, legeEigenenAn, loescheEigenen, setzeStatus, setzeTermin, setzeThemen } from '../../checkliste/api';
import {
  AUTOMATIK, faelligRelativ, gruppeVon, standVon, TERMIN_ART, terminAusEingabe, terminText, validiereEigenen, ZIELE, erfuellt,
  type EigenerEingabe, type Gruppe, type Punkt, type PunktStatus,
} from '../../checkliste/logik';
import { sendePush } from '../../mitteilungen/senden';
import { Alert, Badge, Button, Card, Spinner, TextField } from '../../components/ui';

const GRUPPEN: { gruppe: Exclude<Gruppe, 'fertig'>; titel: string }[] = [
  { gruppe: 'ueberfaellig', titel: 'Überfällig' },
  { gruppe: 'bald', titel: 'In den nächsten 7 Tagen' },
  { gruppe: 'spaeter', titel: 'Später' },
];

type Ausfuehren = (fn: () => Promise<unknown>) => void;

/**
 * Termin eines Punktes (Vortreffen, Vorgespräch): eintragen, ändern, löschen. Die Datenbank legt dazu einen Hinweis für das Team bzw.
 * eine Absprache mit der Freizeitenkoordination an; die Betroffenen bekommen wie gewohnt eine Mitteilung.
 */
function TerminBereich({ p, ausfuehren, arbeitet }: { p: Punkt; ausfuehren: Ausfuehren; arbeitet: boolean }) {
  const [offen, setOffen] = useState(false);
  const vorher = p.termin ? new Date(p.termin) : null;
  const zweistellig = (n: number) => String(n).padStart(2, '0');
  const [datum, setDatum] = useState(vorher ? `${vorher.getFullYear()}-${zweistellig(vorher.getMonth() + 1)}-${zweistellig(vorher.getDate())}` : '');
  const [uhrzeit, setUhrzeit] = useState(vorher ? `${zweistellig(vorher.getHours())}:${zweistellig(vorher.getMinutes())}` : '');
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const art = p.termin_art!;

  const eintragen = () => {
    const wann = terminAusEingabe(datum, uhrzeit);
    if (!wann) { setFehler('Bitte Datum und Uhrzeit angeben.'); return; }
    setFehler(null);
    ausfuehren(async () => {
      const notiz = await setzeTermin(p, wann, text);
      if (notiz) sendePush(TERMIN_ART[art].push, notiz);
      setOffen(false); setText('');
    });
  };

  if (p.termin && !offen) {
    return (
      <div className="checkliste__termin">
        <strong>Termin: {terminText(p.termin)}</strong>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <Button klein disabled={arbeitet} onClick={() => setOffen(true)}>Termin ändern</Button>
          <Button klein variante="ghost" disabled={arbeitet} onClick={() => { if (window.confirm('Den Termin löschen? Der Eintrag dazu wird ebenfalls entfernt.')) ausfuehren(() => setzeTermin(p, null)); }}>Termin löschen</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="checkliste__termin">
      {!offen && <Button klein variante="primary" onClick={() => setOffen(true)}>Termin eintragen</Button>}
      {offen && (
        <>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 150px' }}><TextField label="Datum" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} /></div>
            <div style={{ flex: '1 1 110px' }}><TextField label="Uhrzeit" type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} /></div>
            <div style={{ flex: '2 1 200px' }}><TextField label="Ort / Info (optional)" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} /></div>
          </div>
          {fehler && <Alert ton="error">{fehler}</Alert>}
          <p className="field__hint">{TERMIN_ART[art].folge}{p.termin ? ' Der bisherige Eintrag wird ersetzt.' : ''}</p>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            <Button klein variante="primary" laedt={arbeitet} onClick={eintragen}>Termin speichern</Button>
            <Button klein onClick={() => { setOffen(false); setFehler(null); }}>Abbrechen</Button>
          </div>
        </>
      )}
    </div>
  );
}

/** Themen eines Punktes zum Abhaken (z. B. beim Vortreffen besprochen). */
function ThemenListe({ p, ausfuehren, arbeitet }: { p: Punkt; ausfuehren: Ausfuehren; arbeitet: boolean }) {
  const themen = p.themen ?? [];
  const erledigt = p.themen_erledigt ?? [];
  if (themen.length === 0) return null;
  return (
    <fieldset className="checkliste__themen">
      <legend className="field__label">Dabei besprechen ({erledigt.length} von {themen.length})</legend>
      {themen.map((t, i) => (
        <label key={t} className="option">
          <input type="checkbox" checked={erledigt.includes(i + 1)} disabled={arbeitet}
            onChange={(e) => ausfuehren(() => setzeThemen(p, e.target.checked ? [...erledigt, i + 1] : erledigt.filter((x) => x !== i + 1)))} />
          <span>{t}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Ein Punkt der Checkliste: abhaken, Link zur passenden Stelle der App, „nicht relevant“, Notiz; eigene Punkte lassen sich löschen. */
function PunktZeile({ p, heute, aendern, ausfuehren, arbeitet }: {
  p: Punkt; heute: string; aendern: (p: Punkt, status: PunktStatus | 'loeschen', notiz?: string) => void; ausfuehren: Ausfuehren; arbeitet: boolean;
}) {
  const [notizOffen, setNotizOffen] = useState(false);
  const [notiz, setNotiz] = useState(p.notiz);
  const fertig = erfuellt(p);
  const auto = p.status === 'offen' && p.auto_erfuellt;
  const gruppe = gruppeVon(p, heute);
  const ziel = p.ziel ? ZIELE[p.ziel] : null;

  return (
    <li className={`list__item checkliste__punkt${p.status === 'nicht_relevant' ? ' checkliste__punkt--aus' : ''}`}>
      <label className="checkliste__haken">
        <input type="checkbox" checked={fertig} disabled={auto || p.status === 'nicht_relevant' || arbeitet}
          onChange={(e) => aendern(p, e.target.checked ? 'erledigt' : 'offen')} />
        <span className="sr-only">{p.titel} erledigt</span>
      </label>
      <div className="list__main">
        <div className="list__title checkliste__titel">{p.titel}</div>
        <div className="list__meta">
          {p.faellig && <span className={gruppe === 'ueberfaellig' ? 'checkliste__ueberfaellig' : undefined}>{formatKurz(p.faellig)}{!fertig && p.status !== 'nicht_relevant' ? ` · ${faelligRelativ(p.faellig, heute)}` : ''}</span>}
          {auto && p.automatik && <Badge ton="success">automatisch erkannt: {AUTOMATIK[p.automatik]}</Badge>}
          {p.status === 'nicht_relevant' && <Badge>nicht relevant</Badge>}
          {p.art === 'eigen' && <Badge ton="accent">eigener Punkt</Badge>}
        </div>
        {p.beschreibung && <p className="checkliste__text">{p.beschreibung}</p>}
        {p.art === 'vorlage' && p.termin_art && p.status !== 'nicht_relevant' && <TerminBereich p={p} ausfuehren={ausfuehren} arbeitet={arbeitet} />}
        {p.status !== 'nicht_relevant' && <ThemenListe p={p} ausfuehren={ausfuehren} arbeitet={arbeitet} />}
        {!auto && p.status === 'offen' && p.automatik && <p className="field__hint">Wird automatisch abgehakt, sobald gilt: {AUTOMATIK[p.automatik]}.</p>}
        {p.notiz && !notizOffen && <p className="checkliste__notiz">Notiz: {p.notiz}</p>}
        {notizOffen && (
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '12rem' }}><TextField label={`Notiz zu „${p.titel}“`} value={notiz} maxLength={1000} onChange={(e) => setNotiz(e.target.value)} /></div>
            <Button klein variante="primary" disabled={arbeitet} onClick={() => { aendern(p, p.status, notiz); setNotizOffen(false); }}>Notiz speichern</Button>
          </div>
        )}
        <div className="row checkliste__aktionen">
          {ziel && <Link className="btn btn--sm" to={ziel.pfad(p.freizeit_id)}>{ziel.label} →</Link>}
          {!notizOffen && <Button klein variante="ghost" onClick={() => setNotizOffen(true)}>{p.notiz ? 'Notiz ändern' : 'Notiz'}</Button>}
          {p.status !== 'nicht_relevant'
            ? !fertig && <Button klein variante="ghost" disabled={arbeitet} onClick={() => aendern(p, 'nicht_relevant')}>Nicht relevant</Button>
            : <Button klein variante="ghost" disabled={arbeitet} onClick={() => aendern(p, 'offen')}>Wieder aufnehmen</Button>}
          {p.art === 'eigen' && <Button klein variante="ghost" disabled={arbeitet} aria-label={`Punkt „${p.titel}“ löschen`} onClick={() => aendern(p, 'loeschen')}>Löschen</Button>}
        </div>
      </div>
    </li>
  );
}

/**
 * Vorbereitung einer Freizeit (Leitung und Freizeitenkoordination): die Checkliste mit Fälligkeiten. Viele Punkte führen direkt an die
 * Stelle der App, an der man sie erledigt; manche hakt die App selbst ab, sobald sie erfüllt sind (z. B. „Wochenplan steht“).
 */
export function VorbereitungTab({ freizeit: f }: { freizeit: FreizeitDetailDaten }) {
  const heute = heuteIso();
  const liste = useLaden(() => ladeCheckliste([f.id]), `checkliste-${f.id}`);
  useLive(['freizeit_team', 'plan_eintraege', 'notizen', 'notiz_bestaetigungen'], () => liste.neuLaden());
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [neu, setNeu] = useState<EigenerEingabe>({ titel: '', beschreibung: '', faellig_am: '' });
  const [neuFehler, setNeuFehler] = useState<string | null>(null);

  const punkte = liste.daten ?? [];
  const stand = standVon(punkte, heute);
  const fertig = punkte.filter((p) => gruppeVon(p, heute) === 'fertig');

  async function aendern(p: Punkt, status: PunktStatus | 'loeschen', notiz?: string) {
    if (status === 'loeschen' && !window.confirm(`Den Punkt „${p.titel}“ löschen?`)) return;
    setArbeitet(true); setFehler(null);
    try {
      if (status === 'loeschen') await loescheEigenen(p.id); else await setzeStatus(p, status, notiz);
      liste.neuLaden();
    } catch (e) { setFehler(fehlerText(e, 'Die Änderung konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  async function hinzufuegen(ev: FormEvent) {
    ev.preventDefault();
    const probleme = validiereEigenen(neu);
    setNeuFehler(probleme.titel ?? null);
    if (probleme.titel) return;
    setArbeitet(true); setFehler(null);
    try { await legeEigenenAn(f.id, neu); setNeu({ titel: '', beschreibung: '', faellig_am: '' }); liste.neuLaden(); }
    catch (e) { setFehler(fehlerText(e, 'Der Punkt konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  /** Termin und Themen: ausführen, Fehler zeigen, danach neu laden. */
  async function ausfuehren(fn: () => Promise<unknown>) {
    setArbeitet(true); setFehler(null);
    try { await fn(); liste.neuLaden(); }
    catch (e) { setFehler(fehlerText(e, 'Die Änderung konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  const zeile = (p: Punkt) => (
    <PunktZeile key={`${p.art}-${p.id}-${p.status}-${p.notiz}-${p.termin ?? ''}`} p={p} heute={heute} aendern={(x, s, n) => void aendern(x, s, n)}
      ausfuehren={(fn) => void ausfuehren(fn)} arbeitet={arbeitet} />
  );

  return (
    <div className="stack">
      <Card>
        <h2>Vorbereitung</h2>
        {liste.laedt && <Spinner />}
        {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
        {!liste.laedt && !liste.fehler && (
          <>
            <p><strong>{stand.erledigt} von {stand.gesamt}</strong> Punkten erledigt
              {stand.ueberfaellig > 0 && <> · <span className="checkliste__ueberfaellig">{stand.ueberfaellig} überfällig</span></>}
              {stand.bald > 0 && <> · {stand.bald} in den nächsten 7 Tagen</>}</p>
            <progress className="checkliste__fortschritt" max={Math.max(stand.gesamt, 1)} value={stand.erledigt} aria-label="Fortschritt der Vorbereitung" />
            <p className="field__hint">Mit „Zum …“ kommst du direkt an die Stelle, an der du den Punkt erledigst. Manche Punkte hakt die App selbst ab, sobald sie erfüllt sind.</p>
          </>
        )}
        {fehler && <Alert ton="error">{fehler}</Alert>}
      </Card>

      {GRUPPEN.map(({ gruppe, titel }) => {
        const l = punkte.filter((p) => gruppeVon(p, heute) === gruppe);
        if (l.length === 0) return null;
        return (
          <Card key={gruppe}>
            <h3>{titel} <span className="field__hint">({l.length})</span></h3>
            <ul className="list" aria-label={titel}>{l.map(zeile)}</ul>
          </Card>
        );
      })}

      {fertig.length > 0 && (
        <Card>
          <details>
            <summary><h3 style={{ display: 'inline' }}>Erledigt und nicht relevant</h3> <span className="field__hint">({fertig.length})</span></summary>
            <ul className="list" aria-label="Erledigt und nicht relevant">{fertig.map(zeile)}</ul>
          </details>
        </Card>
      )}

      <Card>
        <h3>Eigenen Punkt hinzufügen</h3>
        <p className="field__hint">Für alles, was nur diese Freizeit betrifft, z. B. „Kanus reservieren“.</p>
        <form onSubmit={(e) => void hinzufuegen(e)} noValidate>
          <TextField label="Was ist zu tun?" value={neu.titel} maxLength={200} onChange={(e) => setNeu({ ...neu, titel: e.target.value })} fehler={neuFehler ?? undefined} />
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 160px' }}><TextField label="Fällig am (optional)" type="date" value={neu.faellig_am} onChange={(e) => setNeu({ ...neu, faellig_am: e.target.value })} /></div>
            <div style={{ flex: '2 1 240px' }}><TextField label="Beschreibung (optional)" value={neu.beschreibung} maxLength={2000} onChange={(e) => setNeu({ ...neu, beschreibung: e.target.value })} /></div>
          </div>
          <Button variante="primary" type="submit" laedt={arbeitet}>Hinzufügen</Button>
        </form>
      </Card>
    </div>
  );
}
