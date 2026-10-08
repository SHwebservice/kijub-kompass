import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { sendePush } from '../mitteilungen/senden';
import {
  holeVorlaufTage, listeFreizeiten, offeneZeitraumBewerbungen, speichereVorlaufTage, zeitraumErledigt, zeitraumZuordnen,
} from '../freizeiten/api';
import { listeFreizeitTeams } from '../zuordnung/api';
import { ferienText, formatDatum, heuteIso, passendeFreizeiten, phase, zeitraumText, zeitraumWahlText } from '../freizeiten/logik';
import { Alert, Badge, Button, Card, Spinner, TextField } from '../components/ui';
import { FzPunkt } from '../components/FreizeitFarbe';

/** Bewerbungsfrist: bis wie viele Tage vor Beginn man sich für eine Freizeit bewerben kann (0 bis 90). */
export function BewerbungsFrist() {
  const vorlauf = useLaden(holeVorlaufTage, 'vorlauf-einstellung');
  const [wert, setWert] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<{ ton: 'success' | 'error'; text: string } | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const anzeige = wert ?? (vorlauf.daten !== null && vorlauf.daten !== undefined ? String(vorlauf.daten) : '');
  const zahl = Number(anzeige);
  const gueltig = anzeige !== '' && Number.isInteger(zahl) && zahl >= 0 && zahl <= 90;

  async function speichern() {
    if (!gueltig) { setMeldung({ ton: 'error', text: 'Bitte eine ganze Zahl von 0 bis 90 eingeben.' }); return; }
    setArbeitet(true); setMeldung(null);
    try { await speichereVorlaufTage(zahl); setWert(null); vorlauf.neuLaden(); setMeldung({ ton: 'success', text: 'Gespeichert.' }); }
    catch (e) { setMeldung({ ton: 'error', text: fehlerText(e) }); } finally { setArbeitet(false); }
  }

  return (
    <Card>
      <h2>Bewerbungsfrist</h2>
      <p className="field__hint">Bis wie viele Tage vor Beginn können sich Mitarbeitende für eine Freizeit bewerben? Einzelne Freizeiten schließt du im Formular der Freizeit („Bewerbungen möglich“), wenn sie voll sind.</p>
      {meldung && <Alert ton={meldung.ton}>{meldung.text}</Alert>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '0 1 220px' }}>
          <TextField label="Tage vor Beginn" type="number" min={0} max={90} value={anzeige} disabled={vorlauf.laedt}
            onChange={(e) => { setWert(e.target.value); setMeldung(null); }} />
        </div>
        <Button variante="primary" laedt={arbeitet} disabled={wert === null} onClick={() => void speichern()}>Speichern</Button>
      </div>
    </Card>
  );
}

/**
 * Bewerbungen für eine Ferienzeit (ohne bestimmte Freizeit): je Bewerbung die passenden Freizeiten mit Rolle und „Zuordnen“.
 * Zuordnen nimmt die Person ins Team und sagt ihr per Mitteilung Bescheid; „Erledigt“ schließt die Bewerbung.
 */
export function BewerbungenZeitraum() {
  const heute = heuteIso();
  const liste = useLaden(offeneZeitraumBewerbungen, 'zeitraum-offen');
  const freizeiten = useLaden(listeFreizeiten, 'zeitraum-freizeiten');
  const teams = useLaden(listeFreizeitTeams, 'zeitraum-teams');
  const [rollen, setRollen] = useState<Record<string, 'teamer' | 'leitung'>>({});
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);

  const ladefehler = liste.fehler ?? freizeiten.fehler ?? teams.fehler;
  const kommende = (freizeiten.daten ?? []).filter((f) => phase(f, heute) !== 'vergangen');
  const imTeam = (person: string, freizeit: string) => (teams.daten ?? []).find((t) => t.person_id === person && t.freizeit_id === freizeit)?.rolle ?? null;

  async function zuordnen(zid: string, fid: string, fname: string, name: string) {
    const rolle = rollen[`${zid}-${fid}`] ?? 'teamer';
    setArbeitet(`${zid}-${fid}`); setFehler(null); setMeldung(null);
    try {
      const bewerbung = await zeitraumZuordnen(zid, fid, rolle);
      sendePush('bewerbung_angenommen', bewerbung);
      setMeldung(`${name} ist jetzt ${rolle === 'leitung' ? 'Leitung' : 'im Team'} von „${fname}“. Wenn nichts weiter offen ist, markiere die Bewerbung als erledigt.`);
      teams.neuLaden();
    } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(null); }
  }

  async function erledigt(zid: string) {
    setArbeitet(zid); setFehler(null); setMeldung(null);
    try { await zeitraumErledigt(zid); liste.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(null); }
  }

  return (
    <Card>
      <h2>Bewerbungen für Ferienzeiten</h2>
      <p className="field__hint">Diese Personen haben sich für eine Ferienzeit oder einzelne Wochen beworben, ohne eine Freizeit zu wählen.</p>
      {ladefehler && <Alert ton="error">{ladefehler}</Alert>}
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {meldung && <Alert ton="success">{meldung}</Alert>}
      {(liste.laedt || freizeiten.laedt) && <Spinner />}
      {!liste.laedt && (liste.daten?.length ?? 0) === 0 && <p>Keine offenen Bewerbungen für Ferienzeiten.</p>}
      <ul className="list" aria-label="Bewerbungen für Ferienzeiten">
        {(liste.daten ?? []).map((z) => {
          const name = `${z.person.vorname} ${z.person.nachname}`;
          const passend = passendeFreizeiten(z, kommende);
          return (
            <li key={z.id} className="list__item" style={{ alignItems: 'flex-start' }}>
              <div className="list__main">
                <div className="list__title">{name}</div>
                <div className="list__meta">
                  <Badge ton="accent">{zeitraumWahlText(z)}</Badge>
                  <Badge>{z.person.kategorie}</Badge>
                  <span>eingegangen {formatDatum(z.created_at.slice(0, 10))}</span>
                </div>
                {z.notiz && <div className="list__meta" style={{ whiteSpace: 'pre-line' }}>„{z.notiz}“</div>}
                {passend.length === 0 && <p className="field__hint">Für diese Zeit ist noch keine Freizeit angelegt.</p>}
                {passend.length > 0 && (
                  <ul className="list" aria-label={`Passende Freizeiten für ${name}`} style={{ marginTop: 'var(--space-2)' }}>
                    {passend.map((f) => {
                      const schon = imTeam(z.person_id, f.id);
                      const schluessel = `${z.id}-${f.id}`;
                      return (
                        <li key={f.id} className="list__item">
                          <div className="list__main">
                            <Link className="list__title" to={`/freizeiten/${f.id}`}><FzPunkt freizeit={f} />{f.name}</Link>
                            <div className="list__meta">
                              <span>{zeitraumText(f.start_datum, f.ende_datum)}</span>
                              {f.ferienzeitraum && <span>{ferienText(f)}</span>}
                              {!f.bewerbung_offen && <Badge>voll</Badge>}
                              {schon && <Badge ton="success">{schon === 'leitung' ? 'ist Leitung' : 'ist im Team'}</Badge>}
                            </div>
                          </div>
                          {!schon && (
                            <div className="row" style={{ gap: 'var(--space-2)' }}>
                              <select aria-label={`Rolle für ${name} in ${f.name}`} className="input" style={{ width: 'auto', minHeight: 36 }} value={rollen[schluessel] ?? 'teamer'}
                                onChange={(e) => setRollen({ ...rollen, [schluessel]: e.target.value as 'teamer' | 'leitung' })}>
                                <option value="teamer">TeamerIn</option>
                                <option value="leitung">Leitung</option>
                              </select>
                              <Button klein variante="primary" laedt={arbeitet === schluessel} disabled={arbeitet !== null}
                                aria-label={`${name} „${f.name}“ zuordnen`} onClick={() => void zuordnen(z.id, f.id, f.name, name)}>Zuordnen</Button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <Button klein laedt={arbeitet === z.id} disabled={arbeitet !== null} aria-label={`Bewerbung von ${name} als erledigt markieren`} onClick={() => void erledigt(z.id)}>Erledigt</Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
