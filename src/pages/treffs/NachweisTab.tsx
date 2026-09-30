import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum, formatKurz, heuteIso } from '../../freizeiten/logik';
import {
  befuelleNachweis, holeTreffTeam, legeNachweisAn, listeNachweise, loescheNachweis, loescheZeile, setzeNachweisStatus, speichereUnterschrift, speichereZeile,
  type TreffDetailDaten, type TreffTeamMitglied,
} from '../../treffs/api';
import { monatErster, monatText, monatVersatz } from '../../treffs/dienstplan';
import {
  darfEigenenNachweisFuehren, darfEinreichen, darfFreigabeAufheben, darfFreigeben, darfNachweisLoeschen, darfZeilenBearbeiten, darfZurueckgeben, dateiname,
  parseZeiten, sortiereZeilen, STATUS_LABEL, stundenWert, summe, validiereZeile, type Nachweis, type NachweisStatus, type NachweisZeile,
} from '../../treffs/nachweis';
import type { RolleInTreff } from '../../lib/rollen';
import { sendePush } from '../../mitteilungen/senden';
import { Alert, Badge, Button, Card, Spinner, TextField } from '../../components/ui';

const TON: Record<NachweisStatus, 'neutral' | 'warning' | 'success'> = { entwurf: 'neutral', eingereicht: 'warning', freigegeben: 'success' };
const QUELLE: Record<NachweisZeile['quelle'], string> = { dienst: 'Dienst', abwesenheit: 'Abwesenheit', manuell: '' };
const stundenText = (h: number | null) => (h === null ? '–' : h.toLocaleString('de-DE', { maximumFractionDigits: 2 }));

interface ZeilenFormProps {
  monat: string;
  anfang?: NachweisZeile;
  speichern: (w: { datum: string; zeiten: string | null; stunden: number | null }) => Promise<void>;
  abbrechen?: () => void;
}

/** Eine Zeile anlegen oder ändern. Aus „14:00 - 17:30“ werden die Stunden berechnet, solange man sie nicht selbst überschreibt. */
function ZeilenFormular({ monat, anfang, speichern, abbrechen }: ZeilenFormProps) {
  const [datum, setDatum] = useState(anfang?.datum ?? '');
  const [zeiten, setZeiten] = useState(anfang?.zeiten ?? '');
  const [std, setStd] = useState(anfang?.stunden != null ? String(anfang.stunden).replace('.', ',') : '');
  const [fehler, setFehler] = useState<{ datum?: string; stunden?: string }>({});
  const [arbeitet, setArbeitet] = useState(false);

  function zeitenAendern(text: string) {
    setZeiten(text);
    const p = parseZeiten(text);
    if (p) setStd(String(p.stunden).replace('.', ','));
  }

  async function absenden(e: FormEvent) {
    e.preventDefault();
    const f = validiereZeile({ datum, zeiten, stunden: std }, monat);
    setFehler(f);
    if (f.datum || f.stunden) return;
    setArbeitet(true);
    try {
      await speichern({ datum, zeiten: zeiten.trim() || null, stunden: stundenWert(std) });
      if (!anfang) { setDatum(''); setZeiten(''); setStd(''); }
    } catch { /* Fehler zeigt die Seite; die Eingaben bleiben stehen. */ } finally { setArbeitet(false); }
  }

  return (
    <form onSubmit={(e) => void absenden(e)} noValidate>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 150px' }}><TextField label="Tag" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} fehler={fehler.datum} /></div>
        <div style={{ flex: '2 1 200px' }}><TextField label="Zeiten" value={zeiten} onChange={(e) => zeitenAendern(e.target.value)} placeholder="14:00 - 17:30" maxLength={120} /></div>
        <div style={{ flex: '1 1 110px' }}><TextField label="Stunden" inputMode="decimal" value={std} onChange={(e) => setStd(e.target.value)} fehler={fehler.stunden} /></div>
      </div>
      <div className="row">
        <Button variante="primary" type="submit" laedt={arbeitet}>{anfang ? 'Zeile speichern' : 'Zeile hinzufügen'}</Button>
        {abbrechen && <Button onClick={abbrechen}>Abbrechen</Button>}
      </div>
    </form>
  );
}

interface EditorProps {
  treff: TreffDetailDaten;
  monat: string;
  nachweis: Nachweis;
  person: TreffTeamMitglied | undefined;
  rolle: RolleInTreff;
  istEigener: boolean;
  aktualisieren: () => void;
  geloescht: () => void;
}

function NachweisEditor({ treff: t, monat, nachweis: n, person, rolle, istEigener, aktualisieren, geloescht }: EditorProps) {
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [unterschrift, setUnterschrift] = useState(n.unterschrift ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const zeilen = sortiereZeilen(n.zeilen);
  const bearbeitbar = darfZeilenBearbeiten(n.status, rolle, istEigener);
  const vorname = person?.vorname ?? '';
  const nachname = person?.nachname ?? '';
  const titel = dateiname(monat, vorname, nachname);

  async function lauf(fn: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await fn(); aktualisieren(); } catch (e) { setFehler(fehlerText(e)); throw e; } finally { setArbeitet(false); }
  }
  const still = (p: Promise<void>) => p.catch(() => undefined);

  function drucken() {
    const vorher = document.title;
    document.title = titel;              // der Browser schlägt den Titel als Dateinamen vor
    window.print();
    document.title = vorher;
  }

  return (
    <Card>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>{vorname} {nachname} · {monatText(monat)}</h2>
        <Badge ton={TON[n.status]}>{STATUS_LABEL[n.status]}</Badge>
      </div>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {n.status === 'eingereicht' && istEigener && <Alert ton="info">Eingereicht – die Treffleitung prüft und gibt den Nachweis frei.</Alert>}
      {n.status === 'freigegeben' && <Alert ton="success">Freigegeben. Der Nachweis ist gesperrt.</Alert>}

      <table className="tabelle">
        <thead><tr><th scope="col">Tag</th><th scope="col">Zeiten</th><th scope="col">Stunden</th><th scope="col"><span className="sr-only">Aktionen</span></th></tr></thead>
        <tbody>
          {zeilen.length === 0 && <tr><td colSpan={4}>Noch keine Zeilen.</td></tr>}
          {zeilen.map((z) => (bearbeite === z.id ? (
            <tr key={z.id}>
              <td colSpan={4}>
                <ZeilenFormular monat={monat} anfang={z} abbrechen={() => setBearbeite(null)}
                  speichern={async (w) => { await lauf(() => speichereZeile(n.id, z.id, w)); setBearbeite(null); }} />
              </td>
            </tr>
          ) : (
            <tr key={z.id}>
              <td>{formatKurz(z.datum)}</td>
              <td>{z.zeiten ?? ''}{QUELLE[z.quelle] && <> <Badge>{QUELLE[z.quelle]}</Badge></>}</td>
              <td>{stundenText(z.stunden)}</td>
              <td>
                {bearbeitbar && (
                  <span className="row" style={{ gap: 'var(--space-1)', flexWrap: 'nowrap' }}>
                    <Button klein variante="ghost" aria-label={`Zeile vom ${formatDatum(z.datum)} bearbeiten`} onClick={() => setBearbeite(z.id)}>✎</Button>
                    <Button klein variante="ghost" aria-label={`Zeile vom ${formatDatum(z.datum)} löschen`} disabled={arbeitet} onClick={() => void still(lauf(() => loescheZeile(z.id)))}>🗑</Button>
                  </span>
                )}
              </td>
            </tr>
          )))}
        </tbody>
        <tfoot><tr><th scope="row" colSpan={2}>Summe</th><td colSpan={2}><strong>{stundenText(summe(zeilen))} Stunden</strong></td></tr></tfoot>
      </table>

      {bearbeitbar && (
        <>
          <h3>Zeile hinzufügen</h3>
          <ZeilenFormular monat={monat} speichern={(w) => lauf(() => speichereZeile(n.id, null, w))} />
          <p>
            <Button klein disabled={arbeitet} onClick={() => void still(lauf(() => befuelleNachweis(n.id)))}>Aus Dienstplan aktualisieren</Button>
          </p>
          <p className="field__hint">
            Das ersetzt die automatisch erzeugten Zeilen (Dienste, Abwesenheiten). Zeilen, die du selbst angelegt oder geändert hast, bleiben erhalten –
            entferne dann gegebenenfalls doppelte Zeilen.
          </p>
        </>
      )}

      <h3>Unterschrift</h3>
      {n.status === 'entwurf' && istEigener ? (
        <TextField label="Name als Unterschrift" value={unterschrift} onChange={(e) => setUnterschrift(e.target.value)} maxLength={100}
          hinweis="Mit dem Einreichen bestätigst du die Richtigkeit der Angaben." />
      ) : <p>{n.unterschrift ?? <span className="field__hint">Noch nicht unterschrieben.</span>}</p>}

      <div className="row">
        {darfEinreichen(n.status, istEigener) && (
          <Button variante="primary" disabled={arbeitet || !unterschrift.trim()} onClick={() => void still(lauf(async () => { await setzeNachweisStatus(n.id, 'eingereicht', unterschrift); sendePush('nachweis_eingereicht', n.id); }))}>Einreichen</Button>
        )}
        {darfFreigeben(n.status, rolle) && <Button variante="primary" disabled={arbeitet} onClick={() => void still(lauf(() => setzeNachweisStatus(n.id, 'freigegeben')))}>Freigeben</Button>}
        {darfZurueckgeben(n.status, rolle) && <Button disabled={arbeitet} onClick={() => void still(lauf(() => setzeNachweisStatus(n.id, 'entwurf')))}>Zur Überarbeitung zurückgeben</Button>}
        {darfFreigabeAufheben(n.status, rolle) && <Button disabled={arbeitet} onClick={() => void still(lauf(() => setzeNachweisStatus(n.id, 'eingereicht')))}>Freigabe aufheben</Button>}
        {istEigener && n.status === 'entwurf' && unterschrift.trim() !== (n.unterschrift ?? '') && (
          <Button disabled={arbeitet} onClick={() => void still(lauf(() => speichereUnterschrift(n.id, unterschrift)))}>Unterschrift speichern</Button>
        )}
        <Button onClick={drucken}>Als PDF speichern / drucken</Button>
        {darfNachweisLoeschen(n.status, rolle, istEigener) && (
          <Button variante="danger" disabled={arbeitet}
            onClick={() => { if (window.confirm('Diesen Nachweis mit allen Zeilen löschen?')) void still(lauf(async () => { await loescheNachweis(n.id); geloescht(); })); }}>Löschen</Button>
        )}
      </div>

      {/* Druckvorlage (A4): nur beim Drucken sichtbar */}
      <div className="nachweis-druck" aria-hidden="true">
        <h1>Nachweis der Teilzeitkräfte</h1>
        <p><strong>{vorname} {nachname}</strong> · {t.name} · {monatText(monat)}</p>
        <table>
          <thead><tr><th>Tag</th><th>Zeiten</th><th>Stunden</th></tr></thead>
          <tbody>
            {zeilen.map((z) => <tr key={z.id}><td>{formatKurz(z.datum)}</td><td>{z.zeiten ?? ''}</td><td>{stundenText(z.stunden)}</td></tr>)}
          </tbody>
          <tfoot><tr><th colSpan={2}>Summe</th><td>{stundenText(summe(zeilen))} Stunden</td></tr></tfoot>
        </table>
        <p>Unterschrift: {n.unterschrift ?? '________________'}</p>
        <p>Status: {STATUS_LABEL[n.status]}</p>
      </div>
    </Card>
  );
}

/** Nachweis der Teilzeitkräfte: TZK führen ihren eigenen Nachweis, Treffleitung und Koordination prüfen und geben frei. */
export function NachweisTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const { ich } = useAuth();
  const [monat, setMonat] = useState(() => monatErster(heuteIso()));
  const [offen, setOffen] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const nachweise = useLaden(() => listeNachweise(t.id, monat), `nachweise-${t.id}-${monat}`);
  if (!ich) return null;

  const eigen = darfEigenenNachweisFuehren(ich.kategorie, rolle);
  const verwaltung = rolle === 'treffleitung' || rolle === 'koordination';
  const mitglieder = team.daten ?? [];
  const alle = nachweise.daten ?? [];
  const eigener = alle.find((n) => n.person_id === ich.id);
  const gewaehlt = offen ?? (!verwaltung && eigener ? eigener.id : null);
  const aktiv = alle.find((n) => n.id === gewaehlt) ?? null;
  const tzk = mitglieder.filter((m) => m.kategorie === 'TZK');
  const ladefehler = team.fehler ?? nachweise.fehler;

  async function anlegen() {
    setFehler(null); setArbeitet(true);
    try { const id = await legeNachweisAn(t.id, ich!.id, monat); setOffen(id); nachweise.neuLaden(); }
    catch (e) { setFehler(fehlerText(e, 'Der Nachweis konnte nicht angelegt werden.')); } finally { setArbeitet(false); }
  }

  const blaettern = (n: number) => { setMonat(monatVersatz(monat, n)); setOffen(null); setFehler(null); };

  return (
    <div className="stack">
      {(ladefehler || fehler) && <Alert ton="error">{ladefehler ?? fehler}</Alert>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Button aria-label="Vorheriger Monat" onClick={() => blaettern(-1)}>←</Button>
        <strong>{monatText(monat)}</strong>
        <Button aria-label="Nächster Monat" onClick={() => blaettern(1)}>→</Button>
      </div>

      {nachweise.laedt && <Spinner />}

      {!nachweise.laedt && !verwaltung && !eigen && (
        <Alert ton="info">Den Nachweis führen Teilzeitkräfte (TZK). Für deine Kategorie gibt es hier nichts zu tun.</Alert>
      )}

      {!nachweise.laedt && eigen && !eigener && (
        <Card>
          <h2>Dein Nachweis für {monatText(monat)}</h2>
          <p>Noch nicht angelegt. Die Zeilen werden aus dem Dienstplan und deinen Abwesenheiten vorbefüllt.</p>
          <Button variante="primary" laedt={arbeitet} onClick={() => void anlegen()}>Nachweis anlegen</Button>
        </Card>
      )}

      {verwaltung && !nachweise.laedt && (
        <Card>
          <h2>Teilzeitkräfte im {monatText(monat)}</h2>
          {tzk.length === 0 && <p>Im Team ist niemand in der Kategorie TZK.</p>}
          <ul className="list">
            {tzk.map((m) => {
              const n = alle.find((x) => x.person_id === m.person_id);
              return (
                <li key={m.person_id} className="list__item">
                  <div className="list__main">
                    <div className="list__title">{m.vorname} {m.nachname}</div>
                    <div className="list__meta">
                      {n ? <><Badge ton={TON[n.status]}>{STATUS_LABEL[n.status]}</Badge><span>{stundenText(summe(n.zeilen))} Stunden</span></> : <span>Noch kein Nachweis</span>}
                    </div>
                  </div>
                  {n && <Button klein aria-pressed={gewaehlt === n.id} onClick={() => setOffen(gewaehlt === n.id ? null : n.id)}>{gewaehlt === n.id ? 'Schließen' : 'Öffnen'}</Button>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {aktiv && (
        <NachweisEditor key={aktiv.id} treff={t} monat={monat} nachweis={aktiv} person={mitglieder.find((m) => m.person_id === aktiv.person_id)}
          rolle={rolle} istEigener={aktiv.person_id === ich.id} aktualisieren={() => nachweise.neuLaden()} geloescht={() => setOffen(null)} />
      )}
    </div>
  );
}
