import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { importiereAngebote, listeKatalog } from '../../katalog/api';
import { lesJson, trenneDoppelte, type Importergebnis } from '../../katalog/import';
import { kategorieLabel } from '../../katalog/kategorien';
import { Alert, Button, Card, PageHeader } from '../../components/ui';

/** Koordination: Programmpunkte aus einer JSON-Datei (z. B. dem alten Katalog) in den Katalog übernehmen. */
export function KatalogImport() {
  const katalog = useLaden(listeKatalog, 'katalog');
  const [datei, setDatei] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<Importergebnis | null>(null);
  const [doppelteUeberspringen, setDoppelteUeberspringen] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState<number | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function waehle(f: File | undefined) {
    setFertig(null); setFehler(null); setErgebnis(null);
    if (!f) return;
    setDatei(f.name);
    setErgebnis(lesJson(await f.text()));
  }

  const { neu, doppelte } = ergebnis ? trenneDoppelte(ergebnis.eintraege, katalog.daten ?? []) : { neu: [], doppelte: [] };
  const zuImportieren = doppelteUeberspringen ? neu : [...neu, ...doppelte];

  async function importieren() {
    setFehler(null); setArbeitet(true);
    try {
      const n = await importiereAngebote(zuImportieren);
      setFertig(n); setErgebnis(null); setDatei(null); katalog.neuLaden();
    } catch (e) { setFehler(fehlerText(e, 'Der Import hat nicht geklappt. Es wurde nichts übernommen.')); } finally { setArbeitet(false); }
  }

  return (
    <>
      <p><Link to="/katalog">← Katalog</Link></p>
      <PageHeader titel="Katalog importieren" />
      <Card>
        <p>
          Wähle eine JSON-Datei mit Programmpunkten – zum Beispiel den Export des alten Katalogs. Erkannt werden die Felder
          <code> name</code>, <code>kategorie</code> (oder <code>category</code>), <code>dauer</code>, <code>gruppe</code>, <code>alter</code> (oder <code>alter_gruppen</code>),
          <code> personal</code>, <code>wetter</code>, <code>raum</code>, <code>material</code>, <code>vorbereitung</code>, <code>umsetzung</code>, <code>nachbereitung</code> und <code>autor</code>.
          Vor dem Übernehmen siehst du, was passieren würde.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="import-datei">JSON-Datei</label>
          <input id="import-datei" type="file" accept=".json,application/json" onChange={(e) => { void waehle(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      </Card>

      {(fehler || katalog.fehler) && <Alert ton="error">{fehler ?? katalog.fehler}</Alert>}
      {fertig !== null && <Alert ton="success">{fertig} {fertig === 1 ? 'Programmpunkt wurde' : 'Programmpunkte wurden'} übernommen. <Link to="/katalog">Zum Katalog</Link></Alert>}

      {ergebnis && (
        <Card>
          <h2>Vorschau: {datei}</h2>
          <ul>
            <li><strong>{neu.length}</strong> neue Programmpunkte</li>
            <li><strong>{doppelte.length}</strong> gibt es im Katalog (oder früher in der Datei) schon – gleicher Name und gleiche Kategorie</li>
            <li><strong>{ergebnis.meldungen.length}</strong> Einträge können nicht übernommen werden</li>
          </ul>
          {ergebnis.meldungen.length > 0 && (
            <Alert ton="warning">
              <ul aria-label="Meldungen" style={{ margin: 0, paddingLeft: 'var(--space-4)' }}>
                {ergebnis.meldungen.slice(0, 20).map((m, i) => <li key={i}>{m}</li>)}
                {ergebnis.meldungen.length > 20 && <li>… und {ergebnis.meldungen.length - 20} weitere</li>}
              </ul>
            </Alert>
          )}
          {neu.length > 0 && (
            <details>
              <summary>Neue Programmpunkte ansehen</summary>
              <ul className="list">{neu.slice(0, 50).map((e, i) => <li key={i} className="list__item"><span className="list__title">{e.name}</span><span className="list__meta">{kategorieLabel(e.kategorie)}</span></li>)}</ul>
              {neu.length > 50 && <p className="field__hint">… und {neu.length - 50} weitere</p>}
            </details>
          )}
          {doppelte.length > 0 && (
            <label className="option">
              <input type="checkbox" checked={doppelteUeberspringen} onChange={(e) => setDoppelteUeberspringen(e.target.checked)} />
              <span>Schon vorhandene überspringen (empfohlen)</span>
            </label>
          )}
          <Button variante="primary" laedt={arbeitet} disabled={zuImportieren.length === 0} onClick={() => void importieren()}>
            {zuImportieren.length === 0 ? 'Nichts zu übernehmen' : `${zuImportieren.length} ${zuImportieren.length === 1 ? 'Programmpunkt' : 'Programmpunkte'} übernehmen`}
          </Button>
        </Card>
      )}
    </>
  );
}
