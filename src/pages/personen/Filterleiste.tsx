import { KATEGORIEN } from '../../lib/rollen';
import type { Zeitraum } from '../../zuordnung/logik';
import { Button, SelectField, TextField } from '../../components/ui';

export type Ansicht = 'liste' | 'zuordnung';

interface Props {
  ansicht: Ansicht;
  setzeAnsicht: (a: Ansicht) => void;
  suche: string;
  setzeSuche: (s: string) => void;
  kategorie: string;
  setzeKategorie: (k: string) => void;
  zeitraum: Zeitraum;
  setzeZeitraum: (z: Zeitraum) => void;
  jahre: number[];
  mitDeaktivierten: boolean;
  setzeMitDeaktivierten: (b: boolean) => void;
}

/** Ansichtsumschalter (Liste | Zuordnungen), Suche, Filter nach Kategorie, Zeitraum der Freizeiten und „auch deaktivierte“. */
export function Filterleiste(p: Props) {
  return (
    <>
      <div className="row" role="group" aria-label="Ansicht" style={{ marginBottom: 'var(--space-3)' }}>
        <Button klein variante={p.ansicht === 'liste' ? 'primary' : 'standard'} aria-pressed={p.ansicht === 'liste'} onClick={() => p.setzeAnsicht('liste')}>Liste</Button>
        <Button klein variante={p.ansicht === 'zuordnung' ? 'primary' : 'standard'} aria-pressed={p.ansicht === 'zuordnung'} onClick={() => p.setzeAnsicht('zuordnung')}>Zuordnungen</Button>
      </div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}><TextField label="Suchen" type="search" value={p.suche} onChange={(e) => p.setzeSuche(e.target.value)} placeholder="Name oder Mail" /></div>
        <div style={{ flex: '1 1 160px' }}>
          <SelectField label="Nach Kategorie filtern" value={p.kategorie} onChange={(e) => p.setzeKategorie(e.target.value)}>
            <option value="">Alle</option>
            {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
          </SelectField>
        </div>
        {p.ansicht === 'zuordnung' && (
          <div style={{ flex: '1 1 200px' }}>
            <SelectField label="Freizeiten" value={String(p.zeitraum)} onChange={(e) => p.setzeZeitraum(e.target.value === 'aktuell' ? 'aktuell' : Number(e.target.value))}>
              <option value="aktuell">Laufende und kommende</option>
              {p.jahre.map((j) => <option key={j} value={j}>Alle aus {j}</option>)}
            </SelectField>
          </div>
        )}
      </div>
      {p.ansicht === 'zuordnung' && (
        <label className="option">
          <input type="checkbox" checked={p.mitDeaktivierten} onChange={(e) => p.setzeMitDeaktivierten(e.target.checked)} />
          <span>Auch deaktivierte Personen zeigen</span>
        </label>
      )}
    </>
  );
}
