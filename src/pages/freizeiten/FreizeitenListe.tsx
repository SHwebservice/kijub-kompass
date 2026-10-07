import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import {
  bewerben, bewerbungZurueckziehen, holeVorlaufTage, listeFreizeiten, meineBewerbungen, type FreizeitZeile,
} from '../../freizeiten/api';
import {
  darfBeworbenWerden, ferienText, gruppiereNachFerien, heuteIso, phase, tageBisStart, zeitraumText,
} from '../../freizeiten/logik';
import { rolleInFreizeit } from '../../lib/rollen';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { fzStreifen } from '../../components/FreizeitFarbe';

type Tab = 'meine' | 'alle' | 'vergangen';
const TAB_LABEL: Record<Tab, string> = { meine: 'Meine', alle: 'Alle kommenden', vergangen: 'Vergangene' };

/** Liste der Freizeiten: eigene, alle kommenden (mit Bewerbung für TeamerInnen) und vergangene. */
export function FreizeitenListe() {
  const { rollen, ich } = useAuth();
  const liste = useLaden(listeFreizeiten, 'liste');
  const bewerbungen = useLaden(meineBewerbungen, 'meine-bewerbungen');
  const vorlauf = useLaden(holeVorlaufTage, 'vorlauf');
  const [gewaehlt, setGewaehlt] = useState<Tab | null>(null);
  const [bewerbenFuer, setBewerbenFuer] = useState<FreizeitZeile | null>(null);
  const [notiz, setNotiz] = useState('');
  const [arbeitet, setArbeitet] = useState(false);
  const [meldung, setMeldung] = useState<{ ton: 'success' | 'error'; text: string } | null>(null);

  if (!rollen || !ich) return null;
  const heute = heuteIso();
  const meineIds = new Set([...rollen.leitungFreizeiten, ...rollen.teamerFreizeiten]);
  const darfAlle = rollen.freizeitkoordination || rollen.bewerbend;
  const tabs: Tab[] = [...(meineIds.size > 0 || !darfAlle ? ['meine' as const] : []), ...(darfAlle ? ['alle' as const] : []), 'vergangen'];
  const tab: Tab = gewaehlt && tabs.includes(gewaehlt) ? gewaehlt : tabs[0]!;

  const alle = liste.daten ?? [];
  const sichtbar = alle.filter((f) => {
    const p = phase(f, heute);
    if (tab === 'vergangen') return p === 'vergangen' && (rollen.freizeitkoordination || meineIds.has(f.id));
    if (p === 'vergangen') return false;
    return tab === 'alle' ? true : meineIds.has(f.id);
  });
  const status = new Map((bewerbungen.daten ?? []).map((b) => [b.freizeit_id, b.status]));

  async function absenden() {
    if (!bewerbenFuer || !ich) return;
    setArbeitet(true); setMeldung(null);
    try {
      await bewerben(bewerbenFuer.id, ich.id, notiz);
      sendePush('bewerbung', bewerbenFuer.id);
      setMeldung({ ton: 'success', text: `Deine Bewerbung für „${bewerbenFuer.name}" ist eingegangen.` });
      setBewerbenFuer(null); setNotiz('');
      bewerbungen.neuLaden();
    } catch (e) {
      setMeldung({ ton: 'error', text: fehlerText(e, 'Die Bewerbung konnte nicht gesendet werden.') });
    } finally { setArbeitet(false); }
  }

  async function zurueckziehen(f: FreizeitZeile) {
    if (!ich || !window.confirm(`Bewerbung für „${f.name}" zurückziehen?`)) return;
    setMeldung(null);
    try {
      await bewerbungZurueckziehen(f.id, ich.id);
      setMeldung({ ton: 'success', text: 'Die Bewerbung wurde zurückgezogen.' });
      bewerbungen.neuLaden();
    } catch (e) {
      setMeldung({ ton: 'error', text: fehlerText(e) });
    }
  }

  return (
    <>
      <PageHeader titel="Freizeiten">
        {rollen.freizeitkoordination && <Link className="btn btn--primary" to="/freizeiten/neu">Neue Freizeit</Link>}
      </PageHeader>
      {liste.fehler && <Alert ton="error">{liste.fehler}</Alert>}
      {meldung && <Alert ton={meldung.ton}>{meldung.text}</Alert>}

      <div className="tabs" role="tablist" aria-label="Ansicht">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={t === tab} className="tabs__tab" onClick={() => setGewaehlt(t)}>{TAB_LABEL[t]}</button>
        ))}
      </div>

      {bewerbenFuer && (
        <Card>
          <h2>Bewerben: {bewerbenFuer.name}</h2>
          <p>{zeitraumText(bewerbenFuer.start_datum, bewerbenFuer.ende_datum)}{bewerbenFuer.ort_name ? ` · ${bewerbenFuer.ort_name}` : ''}</p>
          <div className="field">
            <label className="field__label" htmlFor="bewerbung-notiz">Nachricht an die Koordination (optional)</label>
            <textarea id="bewerbung-notiz" className="input" rows={3} value={notiz} onChange={(e) => setNotiz(e.target.value)}
              placeholder="z. B. Wunschwoche, Verfügbarkeit, Erfahrung" style={{ padding: 'var(--space-3)' }} />
          </div>
          <div className="row">
            <Button variante="primary" laedt={arbeitet} onClick={() => void absenden()}>Bewerbung senden</Button>
            <Button onClick={() => { setBewerbenFuer(null); setNotiz(''); }}>Abbrechen</Button>
          </div>
        </Card>
      )}

      {liste.laedt && <Spinner />}
      {!liste.laedt && sichtbar.length === 0 && (
        <EmptyState icon="⛺" titel={tab === 'meine' ? 'Du bist noch keiner Freizeit zugeordnet' : tab === 'vergangen' ? 'Keine vergangenen Freizeiten' : 'Keine kommenden Freizeiten'}>
          {tab === 'meine' && darfAlle ? 'Unter „Alle kommenden" kannst du dich bewerben.' : undefined}
        </EmptyState>
      )}

      {gruppiereNachFerien(sichtbar).map((g) => (
        <section key={g.schluessel} aria-labelledby={`gruppe-${g.schluessel}`} style={{ marginBottom: 'var(--space-5)' }}>
          <h2 id={`gruppe-${g.schluessel}`}>{g.label}</h2>
          <ul className="list">
            {g.eintraege.map((f) => {
              const rolle = rolleInFreizeit(rollen, f.id);
              const p = phase(f, heute);
              const bis = tageBisStart(f, heute);
              const bewerbungsStatus = status.get(f.id);
              const istMein = meineIds.has(f.id);
              const kannBewerben = !rollen.freizeitkoordination && rollen.bewerbend && !istMein && !bewerbungsStatus
                && darfBeworbenWerden(f, heute, vorlauf.daten ?? 7);
              return (
                <li key={f.id} className="list__item fz-streifen" style={fzStreifen(f)}>
                  <div className="list__main">
                    <Link className="list__title" to={`/freizeiten/${f.id}`}>{f.name}</Link>
                    <div className="list__meta">
                      <span>{zeitraumText(f.start_datum, f.ende_datum)}</span>
                      {f.ferienwoche && f.ferienzeitraum && <span>{ferienText(f)}</span>}
                      {f.ort_name && <span>{f.ort_name}</span>}
                      {rolle === 'leitung' && <Badge ton="accent">Leitung</Badge>}
                      {rolle === 'teamer' && <Badge ton="accent">Team</Badge>}
                      {p === 'laufend' && f.status === 'geplant' && <Badge ton="success">Läuft</Badge>}
                      {p === 'kommend' && bis <= 7 && f.status === 'geplant' && <Badge ton="warning">Startet in {bis} {bis === 1 ? 'Tag' : 'Tagen'}</Badge>}
                      {f.status === 'abgesagt' && <Badge ton="danger">Abgesagt</Badge>}
                      {bewerbungsStatus === 'offen' && <Badge ton="warning">Beworben</Badge>}
                      {bewerbungsStatus === 'abgelehnt' && <Badge ton="danger">Bewerbung abgelehnt</Badge>}
                    </div>
                  </div>
                  {kannBewerben && <Button klein variante="primary" onClick={() => { setBewerbenFuer(f); setMeldung(null); }}>Bewerben</Button>}
                  {bewerbungsStatus === 'offen' && !istMein && <Button klein onClick={() => void zurueckziehen(f)}>Zurückziehen</Button>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
