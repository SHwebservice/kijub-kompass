import { useState } from 'react';
import { musterAnwenden, type Entwurf, type Modus, type MusterErgebnis, type PersonMuster } from '../../treffs/entwurf';
import { monatText, type Abwesenheit, type Feiertag, type Tageskarte } from '../../treffs/dienstplan';
import { sortiereTreffTeam, wochentagName, type Oeffnungszeit } from '../../treffs/logik';
import type { TreffTeamMitglied } from '../../treffs/api';
import { Sheet } from '../../components/Sheet';
import { Button } from '../../components/ui';

interface Props {
  treffId: string;
  /** Erster Tag des Monats. */
  monat: string;
  /** Gespeicherter Stand des Monats. */
  karten: Tageskarte[];
  entwurf: Entwurf;
  team: TreffTeamMitglied[];
  oeffnungszeiten: Oeffnungszeit[];
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  /** Ergebnis in den Entwurf übernehmen. */
  uebernehmen: (r: MusterErgebnis) => void;
  schliessen: () => void;
}

/**
 * Wochentags-Muster: je Person die Wochentage ankreuzen, an denen sie im Monat arbeitet. Das Ergebnis landet im Entwurf der Tabelle –
 * dort sieht man es vor dem Speichern und kann einzelne Tage noch ändern. Regeltage und Höchststunden stehen daneben.
 */
export function MusterSheet({ treffId, monat, karten, entwurf, team, oeffnungszeiten, abwesenheiten, feiertage, uebernehmen, schliessen }: Props) {
  const [muster, setMuster] = useState<PersonMuster>({});
  const [modus, setModus] = useState<Modus>('hinzufuegen');
  const wochentage = [...new Set(oeffnungszeiten.map((o) => o.wochentag))].sort((a, b) => a - b);
  const gewaehlt = Object.values(muster).some((l) => l.length > 0);
  const vorschau = musterAnwenden(karten, entwurf, muster, modus, abwesenheiten, feiertage, treffId);

  const waehle = (person: string, wochentag: number, an: boolean) =>
    setMuster((m) => ({ ...m, [person]: an ? [...(m[person] ?? []), wochentag] : (m[person] ?? []).filter((w) => w !== wochentag) }));

  return (
    <Sheet titel={`Wochentags-Muster · ${monatText(monat)}`} schliessen={schliessen}>
      <p className="field__hint">Kreuze für jede Person die Wochentage an, an denen sie im {monatText(monat)} arbeitet. Das Ergebnis kommt in den Entwurf der Tabelle; gespeichert wird erst dort.</p>
      <div className="tabelle-wrap">
        <table className="tabelle einteilen">
          <caption className="sr-only">An welchen Wochentagen jede Person im {monatText(monat)} arbeitet</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              {wochentage.map((w) => <th key={w} scope="col"><span aria-hidden="true">{wochentagName(w).slice(0, 2)}</span><span className="sr-only">{wochentagName(w)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {sortiereTreffTeam(team).map((m) => (
              <tr key={m.person_id}>
                <th scope="row">
                  {m.vorname} {m.nachname}{m.rolle === 'treffleitung' && <span className="field__hint"> (Leitung)</span>}
                  {(m.tzk_regeltage || m.tzk_max_stunden) && (
                    <div className="field__hint">{m.tzk_regeltage ? `Regeltage: ${m.tzk_regeltage}` : ''}{m.tzk_regeltage && m.tzk_max_stunden ? ' · ' : ''}{m.tzk_max_stunden ? `höchstens ${m.tzk_max_stunden} Std./Monat` : ''}</div>
                  )}
                </th>
                {wochentage.map((w) => (
                  <td key={w}>
                    <input type="checkbox" checked={(muster[m.person_id] ?? []).includes(w)} aria-label={`${m.vorname} ${m.nachname}: ${wochentagName(w)}`}
                      onChange={(e) => waehle(m.person_id, w, e.target.checked)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <fieldset className="optionen">
        <legend className="field__label">Was mit den bisherigen Einteilungen passiert</legend>
        <label className="option">
          <input type="radio" name="muster-modus" checked={modus === 'hinzufuegen'} onChange={() => setModus('hinzufuegen')} />
          <span>Personen zusätzlich eintragen <span className="field__hint">(bisherige bleiben)</span></span>
        </label>
        <label className="option">
          <input type="radio" name="muster-modus" checked={modus === 'ersetzen'} onChange={() => setModus('ersetzen')} />
          <span>Bisherige Einteilung der betroffenen Tage ersetzen <span className="field__hint">(an Tagen, die im Muster vorkommen)</span></span>
        </label>
      </fieldset>

      <p aria-live="polite">
        {gewaehlt
          ? <>{vorschau.dazu === 1 ? 'Eine neue Einteilung' : `${vorschau.dazu} neue Einteilungen`}{vorschau.entfernt > 0 ? `, ${vorschau.entfernt} herausgenommen` : ''}{vorschau.ausgelassen > 0 ? `, ${vorschau.ausgelassen} wegen Urlaub, Krankheit oder „kann nicht“ ausgelassen` : ''}.</>
          : <span className="field__hint">Wähle Wochentage, dann siehst du hier, was passiert.</span>}
      </p>
      <div className="row">
        <Button variante="primary" disabled={!gewaehlt} onClick={() => { uebernehmen(vorschau); schliessen(); }}>In den Entwurf übernehmen</Button>
        <Button onClick={schliessen}>Abbrechen</Button>
      </div>
    </Sheet>
  );
}
