import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import {
  listeFreizeiten, loescheFreizeiten, loescheZeitraumBewerbungenFuer, zaehleZeitraumBewerbungenJeJahr,
} from '../../freizeiten/api';
import { ferienText, gruppiereNachJahr, heuteIso, phase, zeitraumText } from '../../freizeiten/logik';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner, TextField } from '../../components/ui';
import { fzStreifen } from '../../components/FreizeitFarbe';

/**
 * Freizeitenkoordination: mehrere Freizeiten auf einmal endgültig löschen – etwa alle des vergangenen Jahres,
 * bevor das neue Jahr geplant wird. Dazu lassen sich Zeitraum-Bewerbungen früherer Jahre entfernen.
 */
export function FreizeitenAufraeumen() {
  const heute = heuteIso();
  const diesesJahr = Number(heute.slice(0, 4));
  const liste = useLaden(listeFreizeiten, 'aufraeumen');
  const zeitraum = useLaden(zaehleZeitraumBewerbungenJeJahr, 'zeitraum-je-jahr');
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const [bestaetigen, setBestaetigen] = useState(false);
  const [eingabe, setEingabe] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState<{ ton: 'success' | 'error'; text: string } | null>(null);

  const alle = liste.daten ?? [];
  const gruppen = gruppiereNachJahr(alle);
  const gewaehlt = alle.filter((f) => auswahl.has(f.id));
  const nochNichtVorbei = gewaehlt.filter((f) => phase(f, heute) !== 'vergangen').length;
  // Bewerbungen fürs nächste Jahr sind aktuell und stehen hier nicht zur Wahl.
  const altJahre = (zeitraum.daten ?? []).filter((z) => z.jahr <= diesesJahr);

  function umschalten(ids: string[], an: boolean) {
    setAuswahl((a) => {
      const neu = new Set(a);
      ids.forEach((id) => (an ? neu.add(id) : neu.delete(id)));
      return neu;
    });
    setBestaetigen(false); setEingabe('');
  }

  async function loeschen() {
    setArbeitet(true); setMeldung(null);
    try {
      const n = await loescheFreizeiten(gewaehlt.map((f) => f.id));
      setMeldung({ ton: 'success', text: n === 1 ? 'Eine Freizeit wurde gelöscht.' : `${n} Freizeiten wurden gelöscht.` });
      setAuswahl(new Set()); setBestaetigen(false); setEingabe('');
      liste.neuLaden();
    } catch (e) {
      setMeldung({ ton: 'error', text: fehlerText(e, 'Die Freizeiten konnten nicht gelöscht werden.') });
    } finally { setArbeitet(false); }
  }

  async function bewerbungenLoeschen(jahr: number, anzahl: number) {
    if (!window.confirm(`${anzahl === 1 ? 'Die Bewerbung' : `Alle ${anzahl} Bewerbungen`} für die Ferien ${jahr} löschen?`)) return;
    setArbeitet(true); setMeldung(null);
    try {
      await loescheZeitraumBewerbungenFuer(jahr);
      setMeldung({ ton: 'success', text: `Die Bewerbungen für die Ferien ${jahr} wurden gelöscht.` });
      zeitraum.neuLaden();
    } catch (e) {
      setMeldung({ ton: 'error', text: fehlerText(e) });
    } finally { setArbeitet(false); }
  }

  return (
    <>
      <PageHeader titel="Freizeiten aufräumen">
        <Link className="btn" to="/freizeiten">Zurück</Link>
      </PageHeader>
      <p>Wähle die Freizeiten aus, die weg sollen – zum Jahreswechsel etwa alle des vergangenen Jahres. Gelöscht werden sie endgültig
        mit Team-Zuordnung, Wochenplan, Hinweisen, Absprachen, Checkliste und Bewerbungen. Personen, Orte, Programmpunkte und
        Lebensmittelbestände am Ort bleiben erhalten.</p>
      {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
      {meldung && <Alert ton={meldung.ton}>{meldung.text}</Alert>}

      {liste.laedt && <Spinner />}
      {!liste.laedt && alle.length === 0 && <EmptyState icon="⛺" titel="Keine Freizeiten vorhanden">Es gibt nichts zu löschen.</EmptyState>}

      {gruppen.map((g) => {
        const ids = g.eintraege.map((f) => f.id);
        const alleGewaehlt = ids.every((id) => auswahl.has(id));
        return (
          <section key={g.schluessel} aria-labelledby={`jahr-${g.schluessel}`} style={{ marginBottom: 'var(--space-5)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 id={`jahr-${g.schluessel}`}>{g.label} <span className="field__hint">({ids.length} {ids.length === 1 ? 'Freizeit' : 'Freizeiten'})</span></h2>
              <Button klein onClick={() => umschalten(ids, !alleGewaehlt)}>
                {alleGewaehlt ? `Auswahl ${g.label} aufheben` : `Alle aus ${g.label} auswählen`}
              </Button>
            </div>
            <ul className="list">
              {g.eintraege.map((f) => {
                const p = phase(f, heute);
                return (
                  <li key={f.id} className="list__item fz-streifen" style={fzStreifen(f)}>
                    <label className="option" style={{ flex: 1 }}>
                      <input type="checkbox" checked={auswahl.has(f.id)} onChange={(e) => umschalten([f.id], e.target.checked)} />
                      <span className="list__main">
                        <span className="list__title">{f.name}</span>
                        <span className="list__meta">
                          <span>{zeitraumText(f.start_datum, f.ende_datum)}</span>
                          {f.ferienzeitraum && <span>{ferienText(f)}</span>}
                          {f.ort_name && <span>{f.ort_name}</span>}
                          {p === 'laufend' && <Badge ton="warning">Läuft gerade</Badge>}
                          {p === 'kommend' && <Badge ton="warning">Kommt noch</Badge>}
                          {f.status === 'abgesagt' && <Badge ton="danger">Abgesagt</Badge>}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {alle.length > 0 && (
        <Card className="gefahr">
          <h2>Auswahl löschen</h2>
          {gewaehlt.length === 0 ? <p>Noch keine Freizeit ausgewählt.</p> : !bestaetigen ? (
            <>
              <p>{gewaehlt.length === 1 ? 'Eine Freizeit' : `${gewaehlt.length} Freizeiten`} ausgewählt.</p>
              <Button variante="danger" onClick={() => setBestaetigen(true)}>Löschen …</Button>
            </>
          ) : (
            <>
              <Alert ton="error">Das lässt sich nicht rückgängig machen.</Alert>
              {nochNichtVorbei > 0 && (
                <Alert ton="warning">{nochNichtVorbei === 1 ? 'Eine ausgewählte Freizeit ist' : `${nochNichtVorbei} ausgewählte Freizeiten sind`} noch nicht vorbei.</Alert>
              )}
              <p className="field__hint">Freizeiten aus KiJuKo kommen beim nächsten Import wieder, wenn sie dort noch enthalten sind.</p>
              <TextField label={`Zur Bestätigung die Anzahl eingeben: ${gewaehlt.length}`} inputMode="numeric" autoComplete="off"
                value={eingabe} onChange={(e) => setEingabe(e.target.value)} />
              <div className="row">
                <Button variante="danger" laedt={arbeitet} disabled={eingabe.trim() !== String(gewaehlt.length)} onClick={() => void loeschen()}>
                  {gewaehlt.length === 1 ? 'Eine Freizeit endgültig löschen' : `${gewaehlt.length} Freizeiten endgültig löschen`}
                </Button>
                <Button onClick={() => { setBestaetigen(false); setEingabe(''); }}>Abbrechen</Button>
              </div>
            </>
          )}
        </Card>
      )}

      {altJahre.length > 0 && (
        <Card>
          <h2>Bewerbungen für eine Ferienzeit</h2>
          <p>Bewerbungen „für eine Ferienzeit" gelten für ein Jahr. Sind dessen Ferien vorbei, können sie weg.</p>
          <ul className="list">
            {altJahre.map(({ jahr, anzahl }) => (
              <li key={jahr} className="list__item">
                <div className="list__main">
                  <span className="list__title">{jahr}</span>
                  <div className="list__meta"><span>{anzahl === 1 ? 'eine Bewerbung' : `${anzahl} Bewerbungen`}</span></div>
                </div>
                <Button klein laedt={arbeitet} onClick={() => void bewerbungenLoeschen(jahr, anzahl)}>Für {jahr} löschen</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
