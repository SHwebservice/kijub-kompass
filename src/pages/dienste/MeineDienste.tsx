import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { supabaseUrl } from '../../lib/supabase';
import { formatDatum, formatKurz, heuteIso } from '../../freizeiten/logik';
import {
  kalenderLinkEntfernen, kalenderLinkErneuern, kalenderLinkSeit, listeMeineDienste, listeMeineWuensche, listeVeroeffentlicht, meineDiensteIcs, type MeinDienst,
} from '../../treffs/api';
import { addTage, dienstZeit, istNeu, monatErster, monatText, stundenSumme, stundenText } from '../../treffs/dienstplan';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { useLetzterBesuchDienste } from './gesehen';

/** Wie weit „Meine Dienste“ vorausschaut. */
export const VORSCHAU_TAGE = 120;

/** Dienste nach Monat gruppiert (Monate in zeitlicher Reihenfolge). */
export function nachMonat(dienste: MeinDienst[]): { monat: string; dienste: MeinDienst[] }[] {
  const gruppen = new Map<string, MeinDienst[]>();
  for (const d of dienste) gruppen.set(monatErster(d.datum), [...(gruppen.get(monatErster(d.datum)) ?? []), d]);
  return [...gruppen].sort(([a], [b]) => a.localeCompare(b)).map(([monat, liste]) => ({ monat, dienste: liste }));
}

/** Link für Kalender-Apps (Edge Function „kalender“). */
export const kalenderUrl = (schluessel: string) => `${supabaseUrl}/functions/v1/kalender?t=${schluessel}`;

/**
 * „Meine Dienste“: alle eigenen Dienste über alle Treffs, nach Monaten, mit Zeit, Sonderdiensten, Stunden je Monat, „neu“ seit dem
 * letzten Besuch und „vorläufig“ für Monate, die noch in Planung sind. Dazu offene Wünsche und die Übernahme in den eigenen Kalender.
 */
export function MeineDienste() {
  const { ich } = useAuth();
  const heute = heuteIso();
  const bis = addTage(heute, VORSCHAU_TAGE);
  const dienste = useLaden(async () => (ich ? (await listeMeineDienste(ich.id, heute, bis)) ?? [] : []), `meine-dienste-${ich?.id}-${heute}`);
  const wuensche = useLaden(async () => (ich ? (await listeMeineWuensche(ich.id, heute)) ?? [] : []), `meine-wuensche-${ich?.id}-${heute}`);
  const treffIds = [...new Set((dienste.daten ?? []).map((d) => d.treff_id))].sort();
  const fest = useLaden(async () => (await listeVeroeffentlicht(treffIds, heute, bis)) ?? [], `meine-veroeffentlicht-${treffIds.join(',')}-${heute}`);
  const letzterBesuch = useLetzterBesuchDienste(ich?.id);
  if (!ich) return null;

  const istFest = (d: MeinDienst) => (fest.daten ?? []).some((m) => m.treff_id === d.treff_id && m.monat === monatErster(d.datum));
  const gruppen = nachMonat(dienste.daten ?? []);
  const neue = (dienste.daten ?? []).filter((d) => istNeu(d.eingeteilt_am, letzterBesuch)).length;
  const offeneWuensche = (wuensche.daten ?? []).filter((w) => w.status === 'offen');

  return (
    <>
      <PageHeader titel="Meine Dienste" />
      <div className="stack">
        {(dienste.fehler || wuensche.fehler) && <Alert ton="error">{dienste.fehler ?? wuensche.fehler}</Alert>}
        {dienste.laedt && <Spinner />}
        {neue > 0 && <Alert ton="info">{neue === 1 ? 'Ein Dienst ist' : `${neue} Dienste sind`} seit deinem letzten Besuch neu eingeteilt (markiert mit „neu“).</Alert>}

        {!dienste.laedt && gruppen.length === 0 && (
          <EmptyState icon="🗓️" titel="Keine Dienste eingeteilt">In den nächsten {VORSCHAU_TAGE} Tagen stehst du in keinem Dienstplan. Wünschen kannst du dir Dienste im Dienstplan deines Treffs.</EmptyState>
        )}

        {gruppen.map((g) => (
          <Card key={g.monat}>
            <h2>{monatText(g.monat)}</h2>
            <p className="list__meta"><span><strong>{g.dienste.length === 1 ? 'Ein Dienst' : `${g.dienste.length} Dienste`}</strong></span><span>{stundenText(stundenSumme(g.dienste))}</span></p>
            <ul className="list" aria-label={`Meine Dienste im ${monatText(g.monat)}`}>
              {g.dienste.map((d) => (
                <li key={d.id} className={`list__item${d.datum === heute ? ' list__item--heute' : ''}`}>
                  <div className="list__main">
                    <Link className="list__title" to={`/treffs/${d.treff_id}/dienstplan?datum=${d.datum}`}>
                      {formatKurz(d.datum)}{d.datum === heute ? ' · heute' : ''}{dienstZeit(d) ? ` · ${dienstZeit(d)} Uhr` : ''}
                    </Link>
                    <div className="list__meta">
                      <span>{d.treff_name}</span>
                      {d.ist_sonder && <Badge ton="warning">Sonderdienst: {d.bezeichnung}</Badge>}
                      {istNeu(d.eingeteilt_am, letzterBesuch) && <Badge ton="accent">neu</Badge>}
                      {!fest.laedt && !istFest(d) && <Badge>vorläufig</Badge>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}

        {offeneWuensche.length > 0 && (
          <Card>
            <h2>Offene Wünsche</h2>
            <ul className="list" aria-label="Meine offenen Wünsche">
              {offeneWuensche.map((w) => (
                <li key={w.dienst_id} className="list__item">
                  <div className="list__main">
                    <Link className="list__title" to={`/treffs/${w.treff_id}/dienstplan?datum=${w.datum}`}>{formatKurz(w.datum)}{dienstZeit(w) ? ` · ${dienstZeit(w)} Uhr` : ''}</Link>
                    <div className="list__meta"><span>{w.treff_name}</span><Badge ton="warning">wartet auf Antwort</Badge></div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Kalender />
      </div>
    </>
  );
}

/** Dienste in den eigenen Kalender: einmal als Datei oder dauerhaft als Abo über einen persönlichen Link. */
function Kalender() {
  const seit = useLaden(async () => (await kalenderLinkSeit()) ?? null, 'kalender-link');
  const [link, setLink] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function herunterladen() {
    setFehler(null); setArbeitet(true);
    try {
      const ics = await meineDiensteIcs();
      const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'meine-dienste.ics';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setFehler(fehlerText(e, 'Der Kalender konnte nicht erstellt werden.')); } finally { setArbeitet(false); }
  }

  async function erneuern() {
    if (seit.daten && !window.confirm('Einen neuen Link erzeugen? Der bisherige Link hört dann auf zu funktionieren – Kalender, die ihn nutzen, musst du neu verbinden.')) return;
    setFehler(null); setHinweis(null); setArbeitet(true);
    try { setLink(kalenderUrl(await kalenderLinkErneuern())); seit.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  async function entfernen() {
    if (!window.confirm('Den Abo-Link löschen? Kalender, die ihn nutzen, bekommen dann keine Dienste mehr.')) return;
    setFehler(null); setArbeitet(true);
    try { await kalenderLinkEntfernen(); setLink(null); seit.neuLaden(); setHinweis('Der Abo-Link ist gelöscht.'); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  async function kopieren() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); setHinweis('Link kopiert.'); } catch { setHinweis('Bitte den Link markieren und kopieren.'); }
  }

  return (
    <Card>
      <h2>In meinen Kalender</h2>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <p>Deine Dienste der letzten zwei Monate und des kommenden Jahres – mit Uhrzeit und Ort des Treffs. Dienste aus Monaten, die noch in Planung sind, stehen als „vorläufig“ drin.</p>
      <div className="row">
        <Button disabled={arbeitet} onClick={() => void herunterladen()}>Als Datei herunterladen (.ics)</Button>
      </div>
      <h3>Kalender-Abo</h3>
      <p className="field__hint">
        Mit einem Abo aktualisiert dein Kalender (Google, Apple, Outlook) die Dienste von selbst, etwa alle paar Stunden. Der Link ist persönlich:
        Wer ihn kennt, sieht deine Dienste – gib ihn nicht weiter. Du kannst ihn jederzeit neu erzeugen oder löschen.
      </p>
      {seit.daten && !link && <p>Du hast einen Abo-Link seit {formatDatum(seit.daten.slice(0, 10))}. Aus Sicherheitsgründen lässt er sich nicht noch einmal anzeigen – erzeuge bei Bedarf einen neuen.</p>}
      {link && (
        <div className="stack" style={{ gap: 'var(--space-2)' }}>
          <label className="field__label" htmlFor="kalender-link">Dein Abo-Link (nur jetzt sichtbar)</label>
          <input id="kalender-link" className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <Button klein onClick={() => void kopieren()}>Link kopieren</Button>
            <a className="btn btn--sm" href={link.replace(/^https?:/, 'webcal:')}>In Kalender-App öffnen</a>
          </div>
          <p className="field__hint">Google Kalender: „Weitere Kalender“ → „Per URL“ und den Link einfügen. iPhone: „In Kalender-App öffnen“ antippen.</p>
        </div>
      )}
      {hinweis && <p className="field__hint" role="status">{hinweis}</p>}
      <div className="row">
        <Button disabled={arbeitet} onClick={() => void erneuern()}>{seit.daten ? 'Neuen Abo-Link erzeugen' : 'Abo-Link erzeugen'}</Button>
        {seit.daten && <Button variante="ghost" disabled={arbeitet} onClick={() => void entfernen()}>Abo-Link löschen</Button>}
      </div>
    </Card>
  );
}
