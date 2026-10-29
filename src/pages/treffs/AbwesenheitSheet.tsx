import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { formatKurz } from '../../freizeiten/logik';
import { listeAbwesenheiten, listeDienste, listeVeroeffentlicht, loescheAbwesenheiten, setzeZuteilung, speichereAbwesenheit, type TreffTeamMitglied } from '../../treffs/api';
import { betroffeneDienste, blockAenderung, schnellwahl, type Block } from '../../treffs/abwesenheit';
import { abwesenheitsBloecke, addTage, dienstZeit, MAX_ABWESENHEIT_TAGE, mitteilungFuer, tageImZeitraum, validiereAbwesenheit } from '../../treffs/dienstplan';
import { sortiereTreffTeam } from '../../treffs/logik';
import { Sheet } from '../../components/Sheet';
import { Alert, Button, SelectField, TextField } from '../../components/ui';

type Art = 'urlaub' | 'krank' | 'sonstiges';
const ARTEN: { wert: Art; label: string }[] = [{ wert: 'urlaub', label: 'Urlaub' }, { wert: 'krank', label: 'Krank' }, { wert: 'sonstiges', label: 'Sonstiges' }];

export interface AbwesenheitErgebnis {
  person: string;
  /** Tage, an denen die Person aus dem regulären Dienst genommen wurde (dort wird Ersatz gesucht). */
  herausgenommen: string[];
}

interface Props {
  treffId: string;
  team: TreffTeamMitglied[];
  heute: string;
  /** Vorbelegung beim Anlegen */
  person?: string;
  datum?: string;
  /** Bestehender Eintrag (zusammenhängender Zeitraum) zum Ändern */
  block?: Block | null;
  gespeichert: (e: AbwesenheitErgebnis) => void;
  schliessen: () => void;
}

/**
 * Abwesenheit eintragen oder ändern (Treffleitung, Treffkoordination): Person, Art, Zeitraum mit Schnellwahl, Notiz.
 * Darunter die Dienste der Person in diesem Zeitraum (ab heute) – angehakt werden sie beim Speichern herausgenommen, damit Ersatz gesucht werden kann.
 */
export function AbwesenheitSheet({ treffId, team, heute, person: personVor, datum, block, gespeichert, schliessen }: Props) {
  const start = block?.von ?? datum ?? heute;
  const [person, setPerson] = useState(block?.person_id ?? personVor ?? '');
  const [typ, setTyp] = useState<Art>(block && block.typ !== 'verhindert' ? block.typ : 'urlaub');
  const [von, setVon] = useState(start);
  const [bis, setBis] = useState(block?.bis ?? start);
  const [notiz, setNotiz] = useState(block?.notiz ?? '');
  const [feld, setFeld] = useState<{ person?: string; zeitraum?: string; notiz?: string }>({});
  const [behalten, setBehalten] = useState<ReadonlySet<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const gueltig = !!von && !!bis && von <= bis && tageImZeitraum(von, bis).length <= MAX_ABWESENHEIT_TAGE;
  const dienste = useLaden(async () => (gueltig && person ? (await listeDienste(treffId, von, bis)) ?? [] : []), `abw-dienste-${treffId}-${person}-${von}-${bis}-${gueltig}`);
  const fest = useLaden(async () => (gueltig ? ((await listeVeroeffentlicht([treffId], von, bis)) ?? []).map((m) => m.monat) : []), `abw-fest-${treffId}-${von}-${bis}-${gueltig}`);
  const betroffen = person ? betroffeneDienste(dienste.daten ?? [], person, von, bis, heute) : [];
  const heraus = betroffen.filter((d) => !behalten.has(d.id));
  const name = (id: string) => { const m = team.find((x) => x.person_id === id); return m ? `${m.vorname} ${m.nachname}` : 'die Person'; };

  async function speichern(e: FormEvent) {
    e.preventDefault();
    const probleme = validiereAbwesenheit({ person_id: person, von, bis, typ, notiz });
    setFeld(probleme);
    if (probleme.person || probleme.zeitraum || probleme.notiz) return;
    setFehler(null); setArbeitet(true);
    try {
      const { tage, loeschen } = blockAenderung(block ?? null, person, von, bis);
      await speichereAbwesenheit(person, tage, typ, notiz);
      if (loeschen.length) await loescheAbwesenheiten(loeschen);
      for (const d of heraus) await setzeZuteilung(d.id, [], [person]);
      const empfaenger = mitteilungFuer(heraus.map((d) => ({ datum: d.datum, person })), fest.daten ?? []);
      if (empfaenger.length) sendePush('dienstplan', treffId, { personen: empfaenger });
      gespeichert({ person, herausgenommen: [...new Set(heraus.filter((d) => !d.ist_sonder).map((d) => d.datum))] });
      schliessen();
    } catch (err) { setFehler(fehlerText(err, 'Die Abwesenheit konnte nicht gespeichert werden.')); setArbeitet(false); }
  }

  async function loeschen() {
    if (!block || !window.confirm(`Abwesenheit von ${name(block.person_id)} löschen?`)) return;
    setFehler(null); setArbeitet(true);
    try { await loescheAbwesenheiten(block.ids); gespeichert({ person: block.person_id, herausgenommen: [] }); schliessen(); }
    catch (err) { setFehler(fehlerText(err)); setArbeitet(false); }
  }

  return (
    <Sheet titel={block ? 'Abwesenheit ändern' : 'Abwesenheit eintragen'} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <form onSubmit={(e) => void speichern(e)} noValidate>
        <SelectField label="Person" value={person} onChange={(e) => setPerson(e.target.value)} fehler={feld.person}>
          <option value="">– bitte wählen –</option>
          {sortiereTreffTeam(team).map((m) => <option key={m.person_id} value={m.person_id}>{m.vorname} {m.nachname}</option>)}
        </SelectField>

        <div className="segment" role="group" aria-label="Art der Abwesenheit" style={{ marginBottom: 'var(--space-3)' }}>
          {ARTEN.map((a) => (
            <button key={a.wert} type="button" className="segment__knopf" aria-pressed={typ === a.wert} onClick={() => setTyp(a.wert)}>{a.label}</button>
          ))}
        </div>

        <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }} role="group" aria-label="Zeitraum schnell wählen">
          {schnellwahl(von || start).map((s) => (
            <Button key={s.label} klein variante={von === s.von && bis === s.bis ? 'primary' : 'standard'} onClick={() => { setVon(s.von); setBis(s.bis); }}>{s.label}</Button>
          ))}
          {von && bis && <Button klein variante="ghost" onClick={() => setBis(addTage(bis, 1))}>+1 Tag</Button>}
        </div>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 150px' }}><TextField label="Von" type="date" value={von} onChange={(e) => { setVon(e.target.value); if (!bis || bis < e.target.value) setBis(e.target.value); }} /></div>
          <div style={{ flex: '1 1 150px' }}><TextField label="Bis" type="date" value={bis} onChange={(e) => setBis(e.target.value)} fehler={feld.zeitraum} /></div>
        </div>
        <TextField label={typ === 'sonstiges' ? 'Notiz (z. B. Fortbildung)' : 'Notiz (optional)'} value={notiz} onChange={(e) => setNotiz(e.target.value)} maxLength={200}
          fehler={feld.notiz} hinweis={typ === 'sonstiges' ? 'Steht im Dienstplan, im Ausdruck und im Stundennachweis.' : undefined} />

        {person && gueltig && betroffen.length > 0 && (
          <fieldset className="optionen abw__betroffen">
            <legend className="field__label">{name(person)} ist in diesem Zeitraum eingeteilt – herausnehmen?</legend>
            {betroffen.map((d) => (
              <label key={d.id} className="option">
                <input type="checkbox" checked={!behalten.has(d.id)}
                  onChange={(e) => setBehalten((s) => { const n = new Set(s); if (e.target.checked) n.delete(d.id); else n.add(d.id); return n; })} />
                <span>{formatKurz(d.datum)}{dienstZeit(d) ? ` · ${dienstZeit(d)} Uhr` : ''}{d.ist_sonder ? ` · Sonderdienst ${d.bezeichnung ?? ''}` : ''}</span>
              </label>
            ))}
            <p className="field__hint">An diesen Tagen wird danach Ersatz gesucht. Vergangene Dienste bleiben stehen (sie gehören in den Nachweis).</p>
          </fieldset>
        )}

        <div className="row">
          <Button variante="primary" type="submit" laedt={arbeitet}>
            {heraus.length > 0 ? `Speichern und aus ${heraus.length === 1 ? 'einem Dienst' : `${heraus.length} Diensten`} herausnehmen` : 'Speichern'}
          </Button>
          <Button onClick={schliessen}>Abbrechen</Button>
          {block && <Button variante="danger" disabled={arbeitet} onClick={() => void loeschen()}>Löschen</Button>}
        </div>
      </form>
    </Sheet>
  );
}

/**
 * Die Abwesenheit einer Person an einem Tag ändern: lädt den ganzen zusammenhängenden Zeitraum (auch über die angezeigte Woche hinaus)
 * und öffnet damit das Fenster. Gibt es an dem Tag keine, wird neu eingetragen.
 */
export function AbwesenheitBearbeiten(p: Omit<Props, 'block'> & { person: string; datum: string }) {
  const liste = useLaden(async () => (await listeAbwesenheiten(addTage(p.datum, -MAX_ABWESENHEIT_TAGE), addTage(p.datum, MAX_ABWESENHEIT_TAGE))) ?? [],
    `abw-block-${p.person}-${p.datum}`);
  if (liste.laedt) return null;
  const block = abwesenheitsBloecke((liste.daten ?? []).filter((a) => a.person_id === p.person && a.typ !== 'verhindert'))
    .find((b) => b.von <= p.datum && p.datum <= b.bis) ?? null;
  return <AbwesenheitSheet {...p} block={block} />;
}
