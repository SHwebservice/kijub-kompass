import { useState } from 'react';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { ladeHerunter, dateiName } from '../../lib/datei';
import { formatDatum, formatKurz, heuteIso, wochentagLang } from '../../freizeiten/logik';
import { holeNamen } from '../../freizeiten/api';
import { listeFeiertage, listeSchliesszeiten, type TreffDetailDaten } from '../../treffs/api';
import { addTage, tageImZeitraum } from '../../treffs/dienstplan';
import { listeProtokolle, listeProtokolleImZeitraum, listeProtokollZahlen, listeVorlagen } from '../../tagesprotokoll/api';
import {
  anteil, auswertungNachMonat, csvProtokolle, fehlendeTage, gesamt, hatOeffnung, summeAuswertung, type Protokoll,
} from '../../tagesprotokoll/logik';
import { monatText } from '../../treffs/dienstplan';
import type { RolleInTreff } from '../../lib/rollen';
import { baueProtokollSammlung, protokollPdfName, speichereProtokollPdf } from '../../tagesprotokoll/protokollPdf';
import { Alert, Badge, Button, Card, EmptyState, Spinner, TextField } from '../../components/ui';
import { ProtokollSheet } from './ProtokollSheet';
import { ProtokollVorlagen } from './ProtokollVorlagen';

const auszug = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n).trimEnd()} …` : t);

/** Auswertung für Treffleitung und Koordination: Kinder je Monat nach m/w/d, dazu der Export als CSV. */
function Auswertung({ treff }: { treff: TreffDetailDaten }) {
  const jetzt = new Date().getFullYear();
  const [jahr, setJahr] = useState(jetzt);
  const von = `${jahr}-01-01`; const bis = `${jahr}-12-31`;
  const zahlen = useLaden(() => listeProtokollZahlen(treff.id, von, bis), `protokoll-zahlen-${treff.id}-${jahr}`);
  useLive(['treff_protokolle'], () => zahlen.neuLaden());
  const [fehler, setFehler] = useState<string | null>(null);
  const zeilen = auswertungNachMonat(zahlen.daten ?? []);
  const summe = summeAuswertung(zahlen.daten ?? []);

  async function exportieren() {
    setFehler(null);
    try {
      const l = await listeProtokolleImZeitraum(treff.id, von, bis);
      ladeHerunter(`Tagesprotokolle-${dateiName(treff.name)}-${jahr}.csv`, csvProtokolle(l, treff.name, { zeitraum: String(jahr), erstellt: new Date() }));
    } catch (e) { setFehler(fehlerText(e, 'Der Export ist fehlgeschlagen.')); }
  }

  return (
    <Card>
      <h2>Auswertung</h2>
      <div className="row">
        <Button klein onClick={() => setJahr(jahr - 1)} aria-label="Vorheriges Jahr">←</Button>
        <strong aria-live="polite">{jahr}</strong>
        <Button klein onClick={() => setJahr(jahr + 1)} disabled={jahr >= jetzt} aria-label="Nächstes Jahr">→</Button>
        <Button klein onClick={() => void exportieren()}>Als CSV exportieren</Button>
      </div>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {zahlen.fehler && <Alert ton="error">{zahlen.fehler}</Alert>}
      {zahlen.laedt && <Spinner />}
      {!zahlen.laedt && zeilen.length === 0 && <p>Für {jahr} gibt es noch keine Protokolle.</p>}
      {zeilen.length > 0 && (
        <div className="tabelle-wrap">
          <table className="tabelle">
            <caption className="sr-only">Kinder je Monat, {jahr}</caption>
            <thead><tr><th scope="col">Monat</th><th scope="col">Tage</th><th scope="col">m</th><th scope="col">w</th><th scope="col">d</th><th scope="col">Gesamt</th><th scope="col">Ø je Tag</th></tr></thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.monat}><th scope="row">{monatText(z.monat)}</th><td>{z.tage}</td><td>{z.m}</td><td>{z.w}</td><td>{z.d}</td><td>{z.gesamt}</td><td>{z.schnitt.toLocaleString('de-DE')}</td></tr>
              ))}
            </tbody>
            <tfoot>
              <tr><th scope="row">Summe {jahr}</th><td>{summe.tage}</td><td>{summe.m}</td><td>{summe.w}</td><td>{summe.d}</td><td>{summe.gesamt}</td><td>{summe.schnitt.toLocaleString('de-DE')}</td></tr>
            </tfoot>
          </table>
        </div>
      )}
      {summe.gesamt > 0 && <p className="field__hint">Anteile {jahr}: männlich {anteil(summe.m, summe.gesamt)} %, weiblich {anteil(summe.w, summe.gesamt)} %, divers {anteil(summe.d, summe.gesamt)} %. „Tage“ sind die Tage mit Protokoll.</p>}
    </Card>
  );
}

/** Sammlung der Tagesprotokolle eines frei wählbaren Zeitraums als PDF (Treffleitung und Koordination). */
function PdfExport({ treff }: { treff: TreffDetailDaten }) {
  const heute = heuteIso();
  const [von, setVon] = useState(`${heute.slice(0, 7)}-01`);
  const [bis, setBis] = useState(heute);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const ungueltig = !von || !bis || von > bis;

  async function exportieren() {
    setFehler(null); setArbeitet(true);
    try {
      const l = await listeProtokolleImZeitraum(treff.id, von, bis);
      if (l.length === 0) { setFehler('In diesem Zeitraum gibt es keine Protokolle.'); return; }
      const ids = [...new Set(l.map((p) => p.bearbeitet_von).filter((x): x is string => !!x))];
      const namen = await holeNamen(ids);
      await speichereProtokollPdf(baueProtokollSammlung({ treffName: treff.name, von, bis, protokolle: l, namen }), protokollPdfName(treff.name, von, bis));
    } catch (e) { setFehler(fehlerText(e, 'Das PDF konnte nicht erstellt werden.')); } finally { setArbeitet(false); }
  }

  return (
    <Card>
      <h2>Protokolle als PDF</h2>
      <p>Alle Tagesprotokolle eines Zeitraums in einem Dokument – zum Ablegen, Weitergeben oder Drucken.</p>
      <div className="row">
        <div style={{ flex: '1 1 150px' }}><TextField label="Von" type="date" value={von} max={bis || undefined} onChange={(e) => setVon(e.target.value)} /></div>
        <div style={{ flex: '1 1 150px' }}><TextField label="Bis" type="date" value={bis} min={von || undefined} onChange={(e) => setBis(e.target.value)}
          fehler={von && bis && von > bis ? '„Bis“ muss nach „Von“ liegen.' : undefined} /></div>
      </div>
      <div className="row">
        <Button klein disabled={arbeitet || ungueltig} laedt={arbeitet} onClick={() => void exportieren()}>Als PDF speichern</Button>
      </div>
      {fehler && <Alert ton="error">{fehler}</Alert>}
    </Card>
  );
}

/** Tagesprotokoll eines Treffs: Anwesenheit (m/w/d), Verlauf und Vorkommnisse. Das ganze Team darf lesen und bearbeiten. */
export function ProtokollTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const heute = heuteIso();
  const protokolle = useLaden(() => listeProtokolle(t.id), `protokolle-${t.id}`);
  const feiertage = useLaden(() => listeFeiertage(t.id, addTage(heute, -30), heute), `protokoll-feiertage-${t.id}-${heute}`);
  const schliesszeiten = useLaden(() => listeSchliesszeiten(t.id, addTage(heute, -30), heute), `protokoll-schliesszeiten-${t.id}-${heute}`);
  const vorlagen = useLaden(() => listeVorlagen(t.id), `protokoll-vorlagen-${t.id}`);
  useLive(['treff_protokolle'], () => protokolle.neuLaden());
  const ids = [...new Set((protokolle.daten ?? []).map((p) => p.bearbeitet_von).filter((x): x is string => !!x))].sort();
  const namen = useLaden(() => holeNamen(ids), `protokoll-namen-${t.id}-${ids.join(',')}`);
  const [offen, setOffen] = useState<{ datum: string | null; vorhanden: Protokoll | null } | null>(null);

  const liste = protokolle.daten ?? [];
  const heutiges = liste.find((p) => p.datum === heute) ?? null;
  // Kein Protokoll nötig an Feiertagen und in Schließzeiten
  const zuTage = [...(feiertage.daten ?? []).map((f) => f.datum), ...(schliesszeiten.daten ?? []).flatMap((s) => tageImZeitraum(s.von, s.bis))];
  const offeneTage = fehlendeTage(t.oeffnungszeiten, liste, heute, 14, zuTage);
  const leitung = rolle === 'treffleitung' || rolle === 'koordination';

  return (
    <div className="stack">
      <Card>
        <h2>Tagesprotokoll</h2>
        <p>Was war los, wie viele Kinder waren da? Das ganze Team kann Protokolle schreiben und ergänzen.</p>
        <div className="row">
          {heutiges
            ? <Button variante="primary" onClick={() => setOffen({ datum: heute, vorhanden: heutiges })}>Heutiges Protokoll bearbeiten</Button>
            : <Button variante="primary" onClick={() => setOffen({ datum: heute, vorhanden: null })}>Protokoll für heute schreiben</Button>}
          <Button onClick={() => setOffen({ datum: null, vorhanden: null })}>Anderen Tag nachtragen</Button>
        </div>
        {!heutiges && hatOeffnung(heute, t.oeffnungszeiten) && <p className="field__hint">Heute ist geöffnet – das Protokoll fehlt noch.</p>}
      </Card>

      {protokolle.fehler && <Alert ton="error">{protokolle.fehler}</Alert>}

      {offeneTage.filter((d) => d !== heute).length > 0 && (
        <Alert ton="warning">
          <strong>Es fehlen Protokolle</strong> für diese Öffnungstage der letzten zwei Wochen:
          <ul aria-label="Fehlende Protokolle" className="list" style={{ marginTop: 'var(--space-2)' }}>
            {offeneTage.filter((d) => d !== heute).map((d) => (
              <li key={d} className="list__item list__item--klickbar">
                <span>{wochentagLang(d)}, {formatDatum(d)}</span>
                <Button klein className="streck" onClick={() => setOffen({ datum: d, vorhanden: null })}>Nachtragen</Button>
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <Card>
        <h2>Protokolle</h2>
        {protokolle.laedt && <Spinner />}
        {!protokolle.laedt && liste.length === 0 && <EmptyState icon="📒" titel="Noch keine Protokolle">Schreibe das erste Protokoll mit „Protokoll für heute schreiben“.</EmptyState>}
        <ul className="list" aria-label="Protokolle">
          {liste.map((p) => (
            <li key={p.id} className="list__item list__item--klickbar">
              <div className="list__main" style={{ flex: 1 }}>
                <button type="button" className="list__title linklike" onClick={() => setOffen({ datum: p.datum, vorhanden: p })}>
                  {formatKurz(p.datum)} {p.datum.slice(0, 4)}
                </button>
                <div className="list__meta">
                  <span>m {p.anz_m} · w {p.anz_w} · d {p.anz_d}</span>
                  {p.vorkommnisse.trim() && <Badge ton="warning">Vorkommnis</Badge>}
                </div>
                {p.verlauf.trim() && <div className="list__meta"><span>{auszug(p.verlauf)}</span></div>}
              </div>
              <Badge ton="accent">{gesamt(p)} {gesamt(p) === 1 ? 'Kind' : 'Kinder'}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      {leitung && <Auswertung treff={t} />}
      {leitung && <PdfExport treff={t} />}
      {leitung && !vorlagen.laedt && (
        <ProtokollVorlagen treffId={t.id} oeffnungszeiten={t.oeffnungszeiten} vorlagen={vorlagen.daten ?? []} geaendert={() => vorlagen.neuLaden()} />
      )}
      {vorlagen.fehler && <Alert ton="error">{vorlagen.fehler}</Alert>}

      {offen && (
        <ProtokollSheet
          key={offen.vorhanden?.id ?? offen.datum ?? 'neu'}
          treffId={t.id} datum={offen.datum} vorhanden={offen.vorhanden} belegt={liste} heute={heute}
          namen={namen.daten ?? {}}
          darfLoeschen={leitung} vorlagen={vorlagen.daten ?? []}
          schliessen={() => setOffen(null)} gespeichert={() => protokolle.neuLaden()} />
      )}
    </div>
  );
}
