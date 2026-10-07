import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { wendeDienstplanAn, type TreffDetailDaten, type TreffTeamMitglied } from '../../treffs/api';
import { monatText, type Abwesenheit, type Dienst, type Feiertag, type Schliesszeit } from '../../treffs/dienstplan';
import { planeMonat, type Modus, type PersonMuster } from '../../treffs/monatsplan';
import { sortiereTreffTeam, wochentagName } from '../../treffs/logik';
import { Alert, Button, Card } from '../../components/ui';

interface Props {
  treff: TreffDetailDaten;
  /** Erster Tag des Monats. */
  monat: string;
  mitglieder: TreffTeamMitglied[];
  dienste: Dienst[];
  abwesenheiten: Abwesenheit[];
  feiertage: Feiertag[];
  /** An diesen Tagen ist der Treff zu: Es wird nicht eingeteilt. */
  schliesszeiten?: Schliesszeit[];
  /** Nach dem Speichern: Dienste und Statistik neu laden. */
  geaendert: () => void;
}

const anzahl = (n: number, einzahl: string, mehrzahl: string) => `${n} ${n === 1 ? einzahl : mehrzahl}`;

/**
 * Monat einteilen: je Person die Wochentage ankreuzen, unten die Vorschau – wie viele Einteilungen, was schon da ist und welche Konflikte
 * (Urlaub, Krankheit, Feiertag) es gibt. Konflikte entscheidet die Treffleitung selbst. Vorhandene Einteilungen bleiben; weitere Personen kommen dazu.
 */
export function MonatEinteilen({ treff: t, monat, mitglieder, dienste, abwesenheiten, feiertage, schliesszeiten = [], geaendert }: Props) {
  const [muster, setMuster] = useState<PersonMuster>({});
  const [modus, setModus] = useState<Modus>('hinzufuegen');
  const [erlaubt, setErlaubt] = useState<ReadonlySet<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const team = sortiereTreffTeam(mitglieder);
  const namen = Object.fromEntries(team.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const wochentage = [...new Set(t.oeffnungszeiten.map((o) => o.wochentag))].sort((a, b) => a - b);
  const plan = planeMonat({
    monat, treffId: t.id, oeffnungszeiten: t.oeffnungszeiten, muster, modus, dienste, abwesenheiten, feiertage, schliesszeiten, erlaubt, name: (id) => namen[id] ?? 'Jemand',
  });
  const gewaehlt = Object.values(muster).some((l) => l.length > 0);
  const ausgelassen = plan.konflikte.filter((k) => !erlaubt.has(k.schluessel)).reduce((n, k) => n + k.betrifft, 0);
  const neueTage = new Set(plan.zuteilen.map((p) => p.datum)).size;
  const nichtsZuTun = plan.zuteilen.length === 0 && plan.entfernen.length === 0;

  const waehle = (person: string, wochentag: number, an: boolean) => {
    setErfolg(null);
    setMuster((m) => ({ ...m, [person]: an ? [...(m[person] ?? []), wochentag] : (m[person] ?? []).filter((w) => w !== wochentag) }));
  };
  const erlaube = (schluessel: string, an: boolean) => setErlaubt((s) => { const n = new Set(s); if (an) n.add(schluessel); else n.delete(schluessel); return n; });

  async function speichern() {
    if (nichtsZuTun) return;
    if (plan.entfernen.length > 0 && !window.confirm(`${anzahl(plan.entfernen.length, 'bisherige Einteilung wird', 'bisherige Einteilungen werden')} entfernt. Fortfahren?`)) return;
    setArbeitet(true); setFehler(null); setErfolg(null);
    try {
      const r = await wendeDienstplanAn(t.id, monat, plan.zuteilen, plan.entfernen);
      setErfolg(`${anzahl(r.zugeteilt, 'Einteilung', 'Einteilungen')} gespeichert${r.entfernt > 0 ? `, ${anzahl(r.entfernt, 'Einteilung', 'Einteilungen')} entfernt` : ''}.`);
      const betroffene = [...new Set(plan.zuteilen.map((p) => p.person))];
      if (betroffene.length) sendePush('dienstplan', t.id, { personen: betroffene });
      setMuster({}); setErlaubt(new Set());
      geaendert();
    } catch (e) { setFehler(fehlerText(e, 'Der Dienstplan konnte nicht gespeichert werden.')); } finally { setArbeitet(false); }
  }

  return (
    <Card>
      <h2>Monat einteilen</h2>
      <p className="field__hint">
        Kreuze für jede Person die Wochentage an, an denen sie im {monatText(monat)} arbeitet. Unten siehst du vorab, was passiert.
        Wer schon eingetragen ist, bleibt – weitere Personen kommen dazu.
      </p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {t.oeffnungszeiten.length === 0 && <p>Der Treff hat noch keine Öffnungstage.</p>}

      {t.oeffnungszeiten.length > 0 && (
        <>
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
                {team.map((m) => (
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
              <input type="radio" name="einteilen-modus" checked={modus === 'hinzufuegen'} onChange={() => setModus('hinzufuegen')} />
              <span>Personen zusätzlich eintragen <span className="field__hint">(bisherige bleiben)</span></span>
            </label>
            <label className="option">
              <input type="radio" name="einteilen-modus" checked={modus === 'ersetzen'} onChange={() => setModus('ersetzen')} />
              <span>Bisherige Einteilung der betroffenen Tage ersetzen <span className="field__hint">(an Tagen, die im Muster vorkommen)</span></span>
            </label>
          </fieldset>

          <div className="einteilen__vorschau" aria-live="polite">
            <h3>Vorschau</h3>
            {!gewaehlt && <p className="field__hint">Wähle Wochentage, dann siehst du hier, was passiert.</p>}
            {gewaehlt && (
              <ul>
                <li><strong>{anzahl(plan.zuteilen.length, 'neue Einteilung', 'neue Einteilungen')}</strong>{plan.zuteilen.length > 0 && ` an ${anzahl(neueTage, 'Tag', 'Tagen')}`}</li>
                {plan.schonDa > 0 && <li>{anzahl(plan.schonDa, 'Einteilung ist', 'Einteilungen sind')} schon eingetragen und {plan.schonDa === 1 ? 'bleibt' : 'bleiben'}.</li>}
                {modus === 'ersetzen' && plan.entfernen.length > 0 && <li>{anzahl(plan.entfernen.length, 'bisherige Einteilung wird', 'bisherige Einteilungen werden')} entfernt.</li>}
                {ausgelassen > 0 && <li className="einteilen__warnung">{anzahl(ausgelassen, 'Einteilung wird', 'Einteilungen werden')} wegen eines Konflikts ausgelassen.</li>}
              </ul>
            )}
          </div>

          {plan.konflikte.length > 0 && (
            <fieldset className="optionen">
              <legend className="field__label">Konflikte – du entscheidest</legend>
              {plan.konflikte.map((k) => (
                <label key={k.schluessel} className="option">
                  <input type="checkbox" checked={erlaubt.has(k.schluessel)} onChange={(e) => erlaube(k.schluessel, e.target.checked)} />
                  <span>{k.text} – <strong>trotzdem einteilen</strong>{k.betrifft > 1 ? ` (${anzahl(k.betrifft, 'Einteilung', 'Einteilungen')})` : ''}</span>
                </label>
              ))}
              <div className="row">
                <Button klein onClick={() => setErlaubt(new Set(plan.konflikte.map((k) => k.schluessel)))}>Alle trotzdem einteilen</Button>
                <Button klein onClick={() => setErlaubt(new Set())}>Keine einteilen</Button>
              </div>
            </fieldset>
          )}

          <div className="row">
            <Button variante="primary" laedt={arbeitet} disabled={nichtsZuTun} onClick={() => void speichern()}>
              {nichtsZuTun ? 'Einteilung speichern' : `${anzahl(plan.zuteilen.length, 'Einteilung', 'Einteilungen')} speichern${plan.entfernen.length > 0 ? `, ${plan.entfernen.length} entfernen` : ''}`}
            </Button>
            {gewaehlt && <Button onClick={() => { setMuster({}); setErlaubt(new Set()); setErfolg(null); }}>Zurücksetzen</Button>}
          </div>
        </>
      )}
    </Card>
  );
}
