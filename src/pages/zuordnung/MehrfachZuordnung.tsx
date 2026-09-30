import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { Alert, Badge, Button, Card, SelectField, TextField } from '../../components/ui';

export interface Kandidat { id: string; name: string; kategorie: string; /** z. B. „Überschneidung: Sommer 1“ */ hinweis?: string }

interface Props<R extends string> {
  titel: string;
  kandidaten: Kandidat[];
  rollen: { wert: R; label: string }[];
  zuordnen: (ids: string[], rolle: R) => Promise<void>;
  /** Erklärung unter der Liste, z. B. welche Kategorien möglich sind. */
  hinweis?: string;
}

/** Mehrere Personen auf einmal mit derselben Rolle zuordnen: Suche, Kategorie-Filter, Häkchen. */
export function MehrfachZuordnung<R extends string>({ titel, kandidaten, rollen, zuordnen, hinweis }: Props<R>) {
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState('');
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [rolle, setRolle] = useState<R>(rollen[0]!.wert);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const kategorien = [...new Set(kandidaten.map((k) => k.kategorie))].sort((a, b) => a.localeCompare(b, 'de'));
  const s = suche.trim().toLowerCase();
  const sichtbar = kandidaten.filter((k) => (!kategorie || k.kategorie === kategorie) && (!s || k.name.toLowerCase().includes(s)));
  // Nur Personen, die noch Kandidaten sind (nach dem Zuordnen verschwinden sie aus der Liste)
  const auswahl = gewaehlt.filter((id) => kandidaten.some((k) => k.id === id));

  async function absenden() {
    setFehler(null); setArbeitet(true);
    try { await zuordnen(auswahl, rolle); setGewaehlt([]); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  const umschalten = (id: string, an: boolean) => setGewaehlt((g) => (an ? [...g, id] : g.filter((x) => x !== id)));

  return (
    <Card>
      <h2>{titel}</h2>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}><TextField label="Suchen" type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name" /></div>
        <div style={{ flex: '1 1 160px' }}>
          <SelectField label="Kategorie" value={kategorie} onChange={(e) => setKategorie(e.target.value)}>
            <option value="">Alle</option>
            {kategorien.map((k) => <option key={k}>{k}</option>)}
          </SelectField>
        </div>
      </div>

      {sichtbar.length === 0
        ? <p className="field__hint">{kandidaten.length === 0 ? 'Alle passenden Personen sind schon zugeordnet.' : 'Keine Person passt zur Suche.'}</p>
        : (
          <fieldset className="optionen mehrfach__liste">
            <legend className="sr-only">Personen auswählen</legend>
            {sichtbar.map((k) => (
              <label key={k.id} className="option">
                <input type="checkbox" checked={auswahl.includes(k.id)} onChange={(e) => umschalten(k.id, e.target.checked)} />
                <span>
                  {k.name} <Badge>{k.kategorie}</Badge>
                  {k.hinweis && <em className="mehrfach__hinweis"> – {k.hinweis}</em>}
                </span>
              </label>
            ))}
          </fieldset>
        )}
      {hinweis && <p className="field__hint">{hinweis}</p>}

      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 160px' }}>
          <SelectField label="Rolle für alle Ausgewählten" value={rolle} onChange={(e) => setRolle(e.target.value as R)}>
            {rollen.map((r) => <option key={r.wert} value={r.wert}>{r.label}</option>)}
          </SelectField>
        </div>
        <div className="field">
          <Button variante="primary" disabled={auswahl.length === 0} laedt={arbeitet} onClick={() => void absenden()}>
            {auswahl.length === 0 ? 'Zuordnen' : auswahl.length === 1 ? '1 Person zuordnen' : `${auswahl.length} Personen zuordnen`}
          </Button>
        </div>
      </div>
    </Card>
  );
}
