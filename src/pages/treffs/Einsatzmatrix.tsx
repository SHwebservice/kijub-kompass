import { useEffect, useRef, useState, type ReactNode } from 'react';
import { baueEinsatz } from '../../treffs/einsatz';
import { bearbeitbar, eingeteilt, konfliktAm, setze, stundenVon, umschalten, zeileFuellen, type Entwurf } from '../../treffs/entwurf';
import { ABWESENHEIT_TEXT, stundenText, type Abwesenheit, type Feiertag, type Tageskarte } from '../../treffs/dienstplan';
import { formatKurz, wochentagLang } from '../../freizeiten/logik';
import type { TreffTeamMitglied } from '../../treffs/api';
import { Card } from '../../components/ui';

/** Bearbeiten-Modus: `karten` der Matrix zeigen dann den Entwurf, `gespeichert` den Stand der Datenbank. */
export interface MatrixBearbeiten {
  gespeichert: Tageskarte[];
  entwurf: Entwurf;
  aendern: (f: (e: Entwurf) => Entwurf) => void;
}

interface Props {
  karten: Tageskarte[];
  mitglieder: TreffTeamMitglied[];
  /** Urlaub, krank und „kann nicht“ (siehe `mitVerhinderungen`). */
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  treffId: string;
  /** Die angemeldete Person (ihre Zeile steht oben und ist hervorgehoben). */
  ichId: string;
  heute: string;
  /** Offene Dienstwünsche anzeigen (Treffleitung und Koordination). */
  mitWuenschen: boolean;
  /** Beschriftung für Hilfsmittel, z. B. „Woche“ oder „Monat“. */
  zeitraum: string;
  /** Ab wie vielen Personen ein Öffnungstag ausreichend besetzt ist. */
  mindestbesetzung?: number;
  /** Letzter Besuch: neuere Einteilungen in der eigenen Zeile sind markiert. */
  letzterBesuch?: string | null;
  /** Spalte mit den Stunden je Person (Treffleitung und Koordination); `mitHoechst` vergleicht mit den Höchststunden im Monat. */
  stunden?: { mitHoechst: boolean };
  /** Nur die eigene Zeile zeigen. */
  nurIch?: boolean;
  bearbeiten?: MatrixBearbeiten;
  /** Klick auf einen Tag in der Kopfzeile öffnet das Tagesfenster. */
  tagOeffnen?: (datum: string) => void;
  /** Welche Zellen außerhalb des Bearbeitens anklickbar sind (sie öffnen dann das Tagesfenster). */
  zelleKlickbar?: (datum: string, personId: string) => boolean;
  /** Zusätzlicher Inhalt unter der Überschrift (z. B. Knöpfe zum Bearbeiten). */
  kopf?: ReactNode;
}

const ZEICHEN: Record<Abwesenheit['typ'], string> = { urlaub: 'U', krank: 'K', verhindert: '✕' };

/**
 * „Wer arbeitet wann“: Personen mal Tage. ● Dienst, ★ Sonderdienst, U Urlaub, K krank, ✕ kann nicht, ? Wunsch; darunter die Besetzung je Tag.
 * Die eigene Zeile steht oben. Ein Klick auf einen Tag öffnet das Tagesfenster (Zuteilen, Wünsche, Sonderdienste, eigener Wunsch).
 * Im Bearbeiten-Modus sind die Zellen der Öffnungstage Schalter: Klick teilt ein oder nimmt heraus, mit der Maus lässt sich über
 * mehrere Tage ziehen, der Knopf am Namen füllt oder leert die ganze Zeile.
 */
export function Einsatzmatrix({
  karten, mitglieder, abwesenheiten, feiertage, treffId, ichId, heute, mitWuenschen, zeitraum, mindestbesetzung = 1, letzterBesuch = null,
  stunden, nurIch = false, bearbeiten, tagOeffnen, zelleKlickbar, kopf,
}: Props) {
  const [hinweis, setHinweis] = useState<string | null>(null);
  const ziehen = useRef<{ wert: boolean } | null>(null);
  const klickIgnorieren = useRef(false);

  useEffect(() => {
    const ende = () => { ziehen.current = null; };
    window.addEventListener('pointerup', ende);
    window.addEventListener('pointercancel', ende);
    return () => { window.removeEventListener('pointerup', ende); window.removeEventListener('pointercancel', ende); };
  }, []);

  if (karten.length === 0 || mitglieder.length === 0) return null;
  const { spalten, zeilen: alleZeilen } = baueEinsatz(karten, mitglieder, abwesenheiten, feiertage, treffId, heute, { mitWuenschen, mindestbesetzung, ichId, letzterBesuch });
  const zeilen = nurIch && alleZeilen.some((z) => z.person_id === ichId) ? alleZeilen.filter((z) => z.person_id === ichId) : alleZeilen;
  const unbesetzt = spalten.filter((s) => s.unbesetzt).length;
  const unterbesetzt = spalten.filter((s) => s.unterbesetzt).length;
  const maxStunden = Object.fromEntries(mitglieder.map((m) => [m.person_id, m.tzk_max_stunden]));
  const regeltage = Object.fromEntries(mitglieder.map((m) => [m.person_id, m.tzk_regeltage]));
  const b = bearbeiten;
  const mitStunden = !!stunden || !!b;
  const verhindertDa = zeilen.some((z) => z.zellen.some((c) => c.abwesend === 'verhindert'));
  const neuDa = zeilen.some((z) => z.zellen.some((c) => c.neu));

  const zelleSetzen = (datum: string, person: string, wert: boolean, einzeln: boolean) => {
    if (!b) return;
    // Beim Ziehen werden Tage mit Urlaub, Krankheit oder „kann nicht“ übersprungen; einzeln angeklickt entscheidet die Treffleitung selbst.
    if (!einzeln && wert && konfliktAm(datum, person, abwesenheiten, feiertage, treffId)) return;
    b.aendern((e) => setze(b.gespeichert, e, datum, person, wert));
  };

  const zieheUeber = (x: number, y: number) => {
    if (!ziehen.current) return;
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-zelle]');
    if (el?.dataset.datum && el.dataset.person) zelleSetzen(el.dataset.datum, el.dataset.person, ziehen.current.wert, false);
  };

  const fuelleZeile = (person: string, name: string) => {
    if (!b) return;
    const { entwurf, ausgelassen } = zeileFuellen(b.gespeichert, b.entwurf, person, abwesenheiten, feiertage, treffId);
    b.aendern(() => entwurf);
    setHinweis(ausgelassen > 0
      ? `${name}: ${ausgelassen === 1 ? 'ein Tag' : `${ausgelassen} Tage`} mit Urlaub, Krankheit oder „kann nicht“ ausgelassen – zum Einteilen einzeln anklicken.`
      : null);
  };

  return (
    <Card>
      <h2>Wer arbeitet wann</h2>
      {kopf}
      {unbesetzt > 0 && <p className="einsatz__warnung">{unbesetzt === 1 ? 'Ein Öffnungstag ist' : `${unbesetzt} Öffnungstage sind`} noch nicht besetzt (rot markiert).</p>}
      {unterbesetzt > 0 && (
        <p className="einsatz__knapp-hinweis">
          {unterbesetzt === 1 ? 'Ein Öffnungstag hat' : `${unterbesetzt} Öffnungstage haben`} weniger als {mindestbesetzung} Personen (orange markiert).
        </p>
      )}
      {b && hinweis && <p className="field__hint" role="status">{hinweis}</p>}
      <div className={`einsatz-wrap${b ? ' einsatz-wrap--bearbeiten' : ''}`} role="region" aria-label={`Einsatzplan ${zeitraum}`} tabIndex={0}
        onPointerMove={b ? (ev) => zieheUeber(ev.clientX, ev.clientY) : undefined}>
        <table className="einsatz">
          <caption className="sr-only">Wer in diesem {zeitraum} an welchen Tagen eingeteilt ist</caption>
          <thead>
            <tr>
              <th scope="col" className="einsatz__person">Person</th>
              {spalten.map((s) => {
                const zusatz = `${s.heute ? ' (heute)' : ''}${s.feiertag ? `, Feiertag: ${s.feiertag}` : ''}${s.geschlossen ? `, ${s.geschlossen}` : ''}${s.unbesetzt ? ', noch nicht besetzt' : ''}${s.unterbesetzt ? ', unterbesetzt' : ''}`;
                const inhalt = (
                  <>
                    <span aria-hidden="true">{s.wochentag}</span>
                    <span aria-hidden="true" className="einsatz__zahl">{s.tag}</span>
                  </>
                );
                return (
                  <th key={s.datum} scope="col" title={s.geschlossen ?? s.feiertag ?? undefined}
                    className={`einsatz__tag${s.heute ? ' einsatz__tag--heute' : ''}${s.unbesetzt ? ' einsatz__tag--leer' : ''}${s.unterbesetzt ? ' einsatz__tag--knapp' : ''}${s.feiertag ? ' einsatz__tag--feiertag' : ''}${s.geschlossen || s.feiertag ? ' einsatz__tag--zu' : ''}`}>
                    {tagOeffnen ? (
                      <button type="button" className="einsatz__tagknopf" onClick={() => tagOeffnen(s.datum)} aria-label={`${formatKurz(s.datum)} öffnen${zusatz}`}>{inhalt}</button>
                    ) : (
                      <>{inhalt}<span className="sr-only">{`${s.wochentag} ${s.tag}.${zusatz}`}</span></>
                    )}
                  </th>
                );
              })}
              <th scope="col" className="einsatz__summe">Tage</th>
              {mitStunden && <th scope="col" className="einsatz__summe">Std.</th>}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => {
              const std = stundenVon(karten, z.person_id);
              const vorher = b ? stundenVon(b.gespeichert, z.person_id) : std;
              const max = stunden?.mitHoechst || b ? maxStunden[z.person_id] ?? null : null;
              const zuViel = max !== null && std > max;
              const ich = z.person_id === ichId;
              return (
                <tr key={z.person_id} className={ich ? 'einsatz__ich' : undefined}>
                  <th scope="row" className="einsatz__person" title={regeltage[z.person_id] ? `Regeltage: ${regeltage[z.person_id]}` : undefined}>
                    {b ? (
                      <button type="button" className="einsatz__zeilenknopf" onClick={() => fuelleZeile(z.person_id, z.name)}
                        title="Ganze Zeile einteilen oder leeren" aria-label={`${z.name}: an allen Öffnungstagen einteilen oder herausnehmen`}>
                        {z.name}
                      </button>
                    ) : z.name}
                    {z.leitung && <span className="einsatz__rolle"> (Leitung)</span>}
                    {ich && <span className="einsatz__rolle"> · du</span>}
                  </th>
                  {z.zellen.map((c, i) => {
                    const s = spalten[i]!;
                    const karte = karten[i]!;
                    const inhalt = (
                      <>
                        {c.dienst && <><span className="einsatz__dienst" aria-hidden="true">●</span><span className="sr-only">eingeteilt</span></>}
                        {c.sonder.length > 0 && <><span className="einsatz__sonder" aria-hidden="true">★</span><span className="sr-only">Sonderdienst: {c.sonder.join(', ')}</span></>}
                        {c.abwesend && <><span className="einsatz__abwesend" aria-hidden="true">{ZEICHEN[c.abwesend]}</span><span className="sr-only">{c.abwesend === 'verhindert' ? 'kann nicht' : `abwesend: ${ABWESENHEIT_TEXT[c.abwesend]}`}</span></>}
                        {c.wunsch && <><span className="einsatz__wunsch" aria-hidden="true">?</span><span className="sr-only">wünscht den Dienst</span></>}
                        {c.neu && <><span className="einsatz__neu" aria-hidden="true" /><span className="sr-only">neu</span></>}
                      </>
                    );
                    const grund = `${s.heute ? 'einsatz__zelle--heute' : ''}${s.geschlossen || s.feiertag ? ' einsatz__zelle--zu' : ''}`.trim();
                    if (!b || !bearbeitbar(karte)) {
                      if (!b && tagOeffnen && zelleKlickbar?.(s.datum, z.person_id)) {
                        return (
                          <td key={s.datum} className={`einsatz__schalterzelle ${grund}`.trim()}>
                            <button type="button" className="einsatz__schalter" onClick={() => tagOeffnen(s.datum)}
                              aria-label={`${ich ? 'Mein Tag' : z.name}: ${wochentagLang(s.datum)}, ${formatKurz(s.datum)}${c.wunsch ? ' – Wunsch beantworten' : ''}`}>
                              {inhalt}
                            </button>
                          </td>
                        );
                      }
                      return <td key={s.datum} className={grund || undefined}>{inhalt}</td>;
                    }

                    const vorherDrin = eingeteilt(b.gespeichert, new Map(), s.datum, z.person_id);
                    const neu = c.dienst && !vorherDrin;
                    const weg = !c.dienst && vorherDrin;
                    const konflikt = konfliktAm(s.datum, z.person_id, abwesenheiten, feiertage, treffId);
                    return (
                      <td key={s.datum} className={`einsatz__schalterzelle${s.heute ? ' einsatz__zelle--heute' : ''}${neu ? ' einsatz__zelle--neu' : ''}${weg ? ' einsatz__zelle--weg' : ''}`}>
                        <button type="button" className="einsatz__schalter" data-zelle="" data-datum={s.datum} data-person={z.person_id} aria-pressed={c.dienst}
                          aria-label={`${z.name}, ${s.wochentag} ${s.tag}.${konflikt ? ` (${konflikt})` : ''}${neu ? ', neu' : ''}${weg ? ', wird herausgenommen' : ''}`}
                          onPointerDown={(ev) => {
                            if (ev.pointerType !== 'mouse' || ev.button !== 0) return;          // Touch: tippen schaltet, Wischen scrollt
                            ev.preventDefault();
                            klickIgnorieren.current = true;
                            ziehen.current = { wert: !c.dienst };
                            setHinweis(null);
                            zelleSetzen(s.datum, z.person_id, !c.dienst, true);
                          }}
                          onClick={() => {
                            if (klickIgnorieren.current) { klickIgnorieren.current = false; return; }
                            setHinweis(null);
                            b.aendern((e) => umschalten(b.gespeichert, e, s.datum, z.person_id));
                          }}>
                          {inhalt}
                          {weg && <span className="einsatz__weg" aria-hidden="true">○</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className="einsatz__summe">{z.tage}</td>
                  {mitStunden && (
                    <td className={`einsatz__summe${zuViel ? ' einsatz__zuviel' : ''}`} title={max !== null ? `höchstens ${stundenText(max)} im Monat` : undefined}>
                      {stundenText(std)}
                      {max !== null && <span className="einsatz__max"> / {stundenText(max)}</span>}
                      {b && std !== vorher && <span className="einsatz__delta"> ({std > vorher ? '+' : '−'}{stundenText(Math.abs(Math.round((std - vorher) * 100) / 100))})</span>}
                      {zuViel && <span className="sr-only"> – mehr als die höchstens {stundenText(max!)}</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="einsatz__person">Besetzung</th>
              {spalten.map((s) => <td key={s.datum} className={s.unbesetzt ? 'einsatz__leer' : s.unterbesetzt ? 'einsatz__knapp' : undefined}>{s.besetzung}</td>)}
              <td className="einsatz__summe" />
              {mitStunden && <td className="einsatz__summe" />}
            </tr>
          </tfoot>
        </table>
      </div>
      <ul className="einsatz__legende" aria-label="Zeichenerklärung">
        <li><span className="einsatz__dienst" aria-hidden="true">●</span> Dienst</li>
        <li><span className="einsatz__sonder" aria-hidden="true">★</span> Sonderdienst</li>
        <li><span className="einsatz__abwesend" aria-hidden="true">U</span> Urlaub</li>
        <li><span className="einsatz__abwesend" aria-hidden="true">K</span> krank</li>
        {verhindertDa && <li><span className="einsatz__abwesend" aria-hidden="true">✕</span> kann nicht</li>}
        {mitWuenschen && <li><span className="einsatz__wunsch" aria-hidden="true">?</span> Wunsch offen</li>}
        {neuDa && <li><span className="einsatz__neu" aria-hidden="true" /> neu seit deinem letzten Besuch</li>}
        {b && <li><span className="einsatz__legende-neu" aria-hidden="true">●</span> neu im Entwurf</li>}
        {b && <li><span className="einsatz__weg" aria-hidden="true">○</span> wird herausgenommen</li>}
        {tagOeffnen && !b && <li>Tag antippen: Einzelheiten{mitWuenschen ? ', zuteilen und Wünsche beantworten' : ''}</li>}
      </ul>
    </Card>
  );
}
