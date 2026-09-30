import { useState, type FormEvent } from 'react';
import { KATEGORIEN, type Kategorie } from '../../lib/rollen';
import { Button, Card, SelectField, TextField } from '../../components/ui';

export interface NeuePerson { vorname: string; nachname: string; mail: string; kategorie: Kategorie }
const LEER: NeuePerson = { vorname: '', nachname: '', mail: '', kategorie: 'TeamerIn' };

/** Formular „Neue Person“. `anlegen` meldet, ob es geklappt hat (dann wird das Formular geleert). */
export function PersonAnlegen({ anlegen }: { anlegen: (p: NeuePerson) => Promise<boolean> }) {
  const [neu, setNeu] = useState<NeuePerson>(LEER);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (await anlegen(neu)) setNeu(LEER);
  }

  return (
    <Card>
      <form onSubmit={(e) => void absenden(e)}>
        <h2>Neue Person</h2>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 160px' }}>
            <TextField label="Vorname" value={neu.vorname} onChange={(e) => setNeu({ ...neu, vorname: e.target.value })} required />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <TextField label="Nachname" value={neu.nachname} onChange={(e) => setNeu({ ...neu, nachname: e.target.value })} required />
          </div>
        </div>
        <TextField label="Mail-Adresse" type="email" value={neu.mail} onChange={(e) => setNeu({ ...neu, mail: e.target.value })} required />
        <SelectField label="Kategorie" value={neu.kategorie} onChange={(e) => setNeu({ ...neu, kategorie: e.target.value as Kategorie })}>
          {KATEGORIEN.map((k) => <option key={k}>{k}</option>)}
        </SelectField>
        <Button variante="primary" type="submit" disabled={!neu.vorname.trim() || !neu.nachname.trim() || !neu.mail.includes('@')}>
          Person anlegen
        </Button>
      </form>
    </Card>
  );
}
