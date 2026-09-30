import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum } from '../../freizeiten/logik';
import { aendereVorschlag, lehneVorschlagAb, listeVorschlaege, uebernimmVorschlag, type Vorschlag } from '../../katalog/api';
import { kategorieIcon, kategorieLabel } from '../../katalog/kategorien';
import { validiereAngebot, type AngebotFormular } from '../../katalog/logik';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { AngebotFelder } from './AngebotFelder';

const STATUS = { offen: { text: 'Offen', ton: 'warning' }, angenommen: { text: 'Übernommen', ton: 'success' }, abgelehnt: { text: 'Abgelehnt', ton: 'danger' } } as const;

/** Vorschläge für den Katalog: die Koordination prüft, korrigiert, übernimmt oder lehnt ab; alle anderen sehen ihre eigenen. */
export function Vorschlaege() {
  const { rollen } = useAuth();
  const liste = useLaden(listeVorschlaege, 'katalog-vorschlaege-liste');
  const ort = useLocation();
  const [bearbeite, setBearbeite] = useState<{ v: Vorschlag; werte: AngebotFormular } | null>(null);
  const [feld, setFeld] = useState<{ name?: string; kategorie?: string; lang?: string }>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>((ort.state as { eingereicht?: boolean } | null)?.eingereicht ? 'Danke! Dein Vorschlag wurde eingereicht und wird von der Koordination geprüft.' : null);
  const [arbeitet, setArbeitet] = useState(false);
  if (!rollen) return null;

  const koord = rollen.koordination;
  const offen = (liste.daten ?? []).filter((v) => v.status === 'offen');
  const erledigt = (liste.daten ?? []).filter((v) => v.status !== 'offen');

  async function lauf(fn: () => Promise<void>, ok: string) {
    setFehler(null); setErfolg(null); setArbeitet(true);
    try { await fn(); setErfolg(ok); liste.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  async function korrekturSpeichern() {
    if (!bearbeite) return;
    const probleme = validiereAngebot(bearbeite.werte);
    setFeld(probleme);
    if (Object.keys(probleme).length > 0) return;
    await lauf(async () => { await aendereVorschlag(bearbeite.v.id, bearbeite.werte); setBearbeite(null); }, 'Der Vorschlag wurde aktualisiert.');
  }

  const karte = (v: Vorschlag) => (
    <li key={v.id} className="list__item" style={{ display: 'block' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{v.daten.name}</strong>
        <Badge ton={STATUS[v.status].ton}>{STATUS[v.status].text}</Badge>
      </div>
      <div className="list__meta">
        <span>{kategorieIcon(v.daten.kategorie)} {kategorieLabel(v.daten.kategorie)}</span>
        {koord && <span>von {v.einreicher}</span>}
        <span>{formatDatum(v.created_at.slice(0, 10))}</span>
      </div>
      {v.daten.umsetzung && <p style={{ whiteSpace: 'pre-line', margin: 'var(--space-2) 0' }}>{v.daten.umsetzung.length > 240 ? `${v.daten.umsetzung.slice(0, 240)} …` : v.daten.umsetzung}</p>}
      {koord && v.status === 'offen' && (
        <div className="row">
          <Button klein variante="primary" disabled={arbeitet} aria-label={`Vorschlag „${v.daten.name}“ übernehmen`}
            onClick={() => void lauf(async () => { await uebernimmVorschlag(v.id); }, `„${v.daten.name}“ ist jetzt im Katalog.`)}>Übernehmen</Button>
          <Button klein disabled={arbeitet} aria-label={`Vorschlag „${v.daten.name}“ bearbeiten`} onClick={() => { setFeld({}); setBearbeite({ v, werte: v.daten }); }}>Bearbeiten</Button>
          <Button klein variante="danger" disabled={arbeitet} aria-label={`Vorschlag „${v.daten.name}“ ablehnen`}
            onClick={() => { if (window.confirm(`Den Vorschlag „${v.daten.name}“ ablehnen?`)) void lauf(() => lehneVorschlagAb(v.id), 'Der Vorschlag wurde abgelehnt.'); }}>Ablehnen</Button>
        </div>
      )}
    </li>
  );

  return (
    <>
      <p><Link to="/katalog">← Katalog</Link></p>
      <PageHeader titel={koord ? 'Vorschläge' : 'Meine Vorschläge'}>
        {!koord && <Link className="btn btn--primary" to="/katalog/vorschlagen">Neuer Vorschlag</Link>}
      </PageHeader>
      {(liste.fehler || fehler) && <Alert ton="error">{liste.fehler ?? fehler}</Alert>}
      {erfolg && <Alert ton="success">{erfolg}</Alert>}
      {liste.laedt && <Spinner />}
      {!liste.laedt && (liste.daten?.length ?? 0) === 0 && <EmptyState icon="💡" titel={koord ? 'Keine Vorschläge' : 'Du hast noch nichts vorgeschlagen'} />}

      {offen.length > 0 && (
        <Card>
          <h2>{koord ? 'Zu prüfen' : 'Offen'} ({offen.length})</h2>
          <ul className="list" aria-label="Offene Vorschläge">{offen.map(karte)}</ul>
        </Card>
      )}
      {erledigt.length > 0 && (
        <Card>
          <h2>Entschieden ({erledigt.length})</h2>
          <ul className="list" aria-label="Entschiedene Vorschläge">{erledigt.map(karte)}</ul>
        </Card>
      )}

      {bearbeite && (
        <Sheet titel={`Vorschlag bearbeiten: ${bearbeite.v.daten.name}`} schliessen={() => setBearbeite(null)}>
          <AngebotFelder wert={bearbeite.werte} aendere={(werte) => setBearbeite({ ...bearbeite, werte })} fehler={feld} />
          <div className="row">
            <Button variante="primary" laedt={arbeitet} onClick={() => void korrekturSpeichern()}>Speichern</Button>
            <Button onClick={() => setBearbeite(null)}>Abbrechen</Button>
          </div>
        </Sheet>
      )}
    </>
  );
}
