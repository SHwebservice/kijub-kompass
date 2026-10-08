import { useState, type FormEvent } from 'react';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { listeVorlage, loescheVorlagePunkt, ordneVorlage, setzeVorlageAktiv, speichereVorlagePunkt } from '../checkliste/api';
import {
  AUTOMATIK, TERMIN_ART, validiereVorlage, vorlageFaelligText, ZIELE, type Automatik, type Bezug, type TerminArt, type VorlageEingabe, type VorlagePunkt, type Ziel,
} from '../checkliste/logik';
import { Alert, Badge, Button, Card, PageHeader, SelectField, Spinner, TextField } from '../components/ui';
import { Sheet } from '../components/Sheet';

const LEER: VorlageEingabe = { titel: '', beschreibung: '', bezug: 'start', tage: -14, ziel: '', automatik: '', termin_art: '', themen: '' };
const eingabeAus = (p: VorlagePunkt): VorlageEingabe => ({
  titel: p.titel, beschreibung: p.beschreibung, bezug: p.bezug, tage: p.tage, ziel: p.ziel ?? '', automatik: p.automatik ?? '',
  termin_art: p.termin_art ?? '', themen: (p.themen ?? []).join('\n'),
});

/** Formular für einen Punkt der Standard-Checkliste. Die Fälligkeit wird als „Tage vor/nach Beginn bzw. Ende“ eingegeben. */
function PunktFormular({ punkt, position, schliessen, gespeichert }: { punkt: VorlagePunkt | null; position: number; schliessen: () => void; gespeichert: () => void }) {
  const [e, setE] = useState<VorlageEingabe>(punkt ? eingabeAus(punkt) : LEER);
  const [richtung, setRichtung] = useState<'vor' | 'nach'>(punkt && punkt.tage > 0 ? 'nach' : 'vor');
  const [fehler, setFehler] = useState<ReturnType<typeof validiereVorlage>>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const betrag = e.tage === '' ? '' : Math.abs(e.tage);
  const setzeTage = (n: number | '', r = richtung) => setE((x) => ({ ...x, tage: n === '' ? '' : r === 'vor' ? -Math.abs(n) : Math.abs(n) }));

  async function speichern(ev: FormEvent) {
    ev.preventDefault();
    const f = validiereVorlage(e);
    setFehler(f);
    if (Object.keys(f).length) return;
    setArbeitet(true); setMeldung(null);
    try { await speichereVorlagePunkt(punkt?.id ?? null, e, position); gespeichert(); schliessen(); }
    catch (x) { setMeldung(fehlerText(x, 'Der Punkt konnte nicht gespeichert werden.')); setArbeitet(false); }
  }

  return (
    <Sheet titel={punkt ? 'Punkt bearbeiten' : 'Neuer Punkt'} schliessen={schliessen}>
      <form onSubmit={(ev) => void speichern(ev)} noValidate>
        {meldung && <Alert ton="error">{meldung}</Alert>}
        <TextField label="Titel" value={e.titel} maxLength={200} onChange={(ev) => setE({ ...e, titel: ev.target.value })} fehler={fehler.titel} />
        <TextField label="Beschreibung (optional)" value={e.beschreibung} maxLength={2000} onChange={(ev) => setE({ ...e, beschreibung: ev.target.value })} />
        <fieldset className="optionen">
          <legend className="field__label">Fällig</legend>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 90px' }}>
              <TextField label="Tage" type="number" min={0} max={365} value={betrag} fehler={fehler.tage}
                onChange={(ev) => setzeTage(ev.target.value === '' ? '' : Number(ev.target.value))} />
            </div>
            <div style={{ flex: '1 1 110px' }}>
              <SelectField label="vor oder nach" value={richtung} onChange={(ev) => { const r = ev.target.value as 'vor' | 'nach'; setRichtung(r); setzeTage(betrag, r); }}>
                <option value="vor">vor</option>
                <option value="nach">nach</option>
              </SelectField>
            </div>
            <div style={{ flex: '1 1 130px' }}>
              <SelectField label="Bezug" value={e.bezug} onChange={(ev) => setE({ ...e, bezug: ev.target.value as Bezug })}>
                <option value="start">Beginn der Freizeit</option>
                <option value="ende">Ende der Freizeit</option>
                <option value="ferien">Ferienbeginn</option>
              </SelectField>
            </div>
          </div>
          {e.tage !== '' && <p className="field__hint">= {vorlageFaelligText(e.tage, e.bezug)}</p>}
          {e.bezug === 'ferien' && <p className="field__hint">Ferienbeginn = Montag der Ferienwoche 1 (aus der Ferienwoche der Freizeit berechnet; ohne Ferienwoche der Beginn der Freizeit).</p>}
        </fieldset>
        <SelectField label="Führt zu (optional)" value={e.ziel} onChange={(ev) => setE({ ...e, ziel: ev.target.value as Ziel | '' })}
          hinweis="Ein Knopf am Punkt öffnet diese Stelle der App, an der man ihn erledigt.">
          <option value="">– keine Stelle –</option>
          {(Object.keys(ZIELE) as Ziel[]).map((z) => <option key={z} value={z}>{ZIELE[z].name}</option>)}
        </SelectField>
        <SelectField label="Termin vereinbaren mit (optional)" value={e.termin_art ?? ''} onChange={(ev) => setE({ ...e, termin_art: ev.target.value as TerminArt | '' })}
          hinweis="Der Punkt bekommt ein Termin-Feld; beim Eintragen entsteht ein Hinweis für das Team bzw. eine Absprache mit der Freizeitenkoordination.">
          <option value="">– kein Termin –</option>
          {(Object.keys(TERMIN_ART) as TerminArt[]).map((t) => <option key={t} value={t}>{TERMIN_ART[t].mit}</option>)}
        </SelectField>
        <div className="field">
          <label className="field__label" htmlFor="vorlage-themen">Themen, die dabei besprochen werden (optional, eins je Zeile)</label>
          <textarea id="vorlage-themen" className="input" rows={3} value={e.themen ?? ''} onChange={(ev) => setE({ ...e, themen: ev.target.value })} style={{ padding: 'var(--space-3)' }} />
          {fehler.themen && <span className="field__error">{fehler.themen}</span>}
        </div>
        <SelectField label="Automatisch abhaken, wenn … (optional)" value={e.automatik} fehler={fehler.automatik} onChange={(ev) => setE({ ...e, automatik: ev.target.value as Automatik | '' })}>
          <option value="">– nur von Hand –</option>
          {(Object.keys(AUTOMATIK) as Automatik[]).map((a) => <option key={a} value={a}>{AUTOMATIK[a]}</option>)}
        </SelectField>
        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>Speichern</Button>
          <Button onClick={schliessen}>Abbrechen</Button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Freizeitenkoordination: die Standard-Checkliste für die Vorbereitung aller Freizeiten. Änderungen gelten sofort für alle Freizeiten;
 * deaktivierte Punkte verschwinden aus den Listen, ihr Stand bleibt erhalten. Leitungen ergänzen eigene Punkte in ihrer Freizeit.
 */
export function ChecklisteVorlage() {
  const liste = useLaden(listeVorlage, 'checkliste-vorlage');
  const [offen, setOffen] = useState<{ punkt: VorlagePunkt | null } | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const punkte = liste.daten ?? [];

  async function aktion(fn: () => Promise<void>) {
    setArbeitet(true); setFehler(null);
    try { await fn(); liste.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }
  const verschiebe = (i: number, n: number) => {
    const neu = [...punkte];
    const [p] = neu.splice(i, 1);
    neu.splice(i + n, 0, p!);
    void aktion(() => ordneVorlage(neu));
  };

  return (
    <>
      <PageHeader titel="Checkliste für Freizeiten" />
      <div className="stack">
        <Card>
          <p>Diese Punkte stehen in jeder Freizeit im Reiter „Vorbereitung“. Die Leitung hakt sie ab, setzt sie auf „nicht relevant“ oder ergänzt eigene.
            Am Tag der Fälligkeit bekommen die Leitungen eine Mitteilung.</p>
          <Button variante="primary" onClick={() => setOffen({ punkt: null })}>+ Neuer Punkt</Button>
        </Card>
        {fehler && <Alert ton="error">{fehler}</Alert>}
        {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
        {liste.laedt && <Spinner />}
        <ul className="list" aria-label="Standard-Checkliste">
          {punkte.map((p, i) => (
            <li key={p.id} className="list__item">
              <div className="list__main">
                <div className="list__title" style={{ whiteSpace: 'normal' }}>{p.titel}</div>
                <div className="list__meta">
                  <span>{vorlageFaelligText(p.tage, p.bezug)}</span>
                  {p.ziel && <Badge>{ZIELE[p.ziel].label}</Badge>}
                  {p.automatik && <Badge ton="success">automatisch: {AUTOMATIK[p.automatik]}</Badge>}
                  {p.termin_art && <Badge ton="accent">Termin mit {p.termin_art === 'hinweis' ? 'dem Team' : 'der Freizeitenkoordination'}</Badge>}
                  {!p.aktiv && <Badge ton="warning">deaktiviert</Badge>}
                </div>
                {p.beschreibung && <p className="checkliste__text">{p.beschreibung}</p>}
                {(p.themen ?? []).length > 0 && <p className="checkliste__text">Themen: {p.themen.join(' · ')}</p>}
              </div>
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                <Button klein disabled={arbeitet || i === 0} aria-label={`„${p.titel}“ nach oben`} onClick={() => verschiebe(i, -1)}>↑</Button>
                <Button klein disabled={arbeitet || i === punkte.length - 1} aria-label={`„${p.titel}“ nach unten`} onClick={() => verschiebe(i, 1)}>↓</Button>
                <Button klein aria-label={`„${p.titel}“ bearbeiten`} onClick={() => setOffen({ punkt: p })}>Bearbeiten</Button>
                <Button klein disabled={arbeitet} onClick={() => void aktion(() => setzeVorlageAktiv(p.id, !p.aktiv))}>{p.aktiv ? 'Deaktivieren' : 'Aktivieren'}</Button>
                <Button klein variante="danger" disabled={arbeitet} aria-label={`„${p.titel}“ löschen`}
                  onClick={() => { if (window.confirm(`„${p.titel}“ endgültig löschen? Der Stand dieses Punktes in allen Freizeiten geht verloren. Zum Ausblenden lieber „Deaktivieren“.`)) void aktion(() => loescheVorlagePunkt(p.id)); }}>Löschen</Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {offen && (
        <PunktFormular punkt={offen.punkt} position={(punkte.at(-1)?.position ?? 0) + 10} schliessen={() => setOffen(null)} gespeichert={() => liste.neuLaden()} />
      )}
    </>
  );
}
