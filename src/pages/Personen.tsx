import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { KATEGORIEN, type Kategorie } from '../lib/rollen';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SelectField, Spinner, TextField } from '../components/ui';

interface PersonZeile {
  id: string;
  vorname: string;
  nachname: string;
  mail: string;
  kategorie: Kategorie;
  aktiv: boolean;
  auth_user_id: string | null;
  eingeladen_am: string | null;
}

/** Einladungsstatus einer Person (rein aus den Daten abgeleitet). */
export function einladungsStatus(p: Pick<PersonZeile, 'auth_user_id' | 'eingeladen_am'>) {
  if (p.auth_user_id) return { text: 'Angemeldet', ton: 'success' as const };
  if (p.eingeladen_am) return { text: 'Eingeladen', ton: 'warning' as const };
  return { text: 'Noch nicht eingeladen', ton: 'neutral' as const };
}

/** Koordination: Personen anlegen und per Mail einladen. Die volle Personalverwaltung folgt in Phase 3. */
export function Personen() {
  const [zeilen, setZeilen] = useState<PersonZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [neu, setNeu] = useState({ vorname: '', nachname: '', mail: '', kategorie: 'TeamerIn' as Kategorie });

  const [version, setVersion] = useState(0);
  const neuLaden = () => setVersion((v) => v + 1);

  useEffect(() => {
    let aktuell = true;
    void (async () => {
      const { data, error } = await supabase.from('personen')
        .select('id, vorname, nachname, mail, kategorie, aktiv, auth_user_id, eingeladen_am')
        .order('nachname').order('vorname');
      if (!aktuell) return;
      if (error) setFehler('Personen konnten nicht geladen werden.'); else setZeilen(data as PersonZeile[]);
    })();
    return () => { aktuell = false; };
  }, [version]);

  async function anlegen(e: FormEvent) {
    e.preventDefault();
    setFehler(null); setMeldung(null);
    const { error } = await supabase.from('personen').insert({
      vorname: neu.vorname.trim(), nachname: neu.nachname.trim(), mail: neu.mail.trim(), kategorie: neu.kategorie,
    });
    if (error) {
      setFehler(error.code === '23505' ? 'Diese Mail-Adresse gibt es schon.' : 'Person konnte nicht angelegt werden.');
      return;
    }
    setNeu({ vorname: '', nachname: '', mail: '', kategorie: 'TeamerIn' });
    setMeldung('Person angelegt.');
    neuLaden();
  }

  async function einladen(p: PersonZeile) {
    setArbeitet(p.id); setFehler(null); setMeldung(null);
    const { data, error } = await supabase.functions.invoke('person-einladen', { body: { person_id: p.id } });
    setArbeitet(null);
    if (error || data?.fehler) { setFehler(data?.fehler ?? 'Einladung konnte nicht versendet werden.'); return; }
    setMeldung(`Einladung an ${p.mail} gesendet.`);
    neuLaden();
  }

  const gefiltert = (zeilen ?? []).filter((p) =>
    `${p.vorname} ${p.nachname} ${p.mail}`.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <>
      <PageHeader titel="Personen" />
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {meldung && <Alert ton="success">{meldung}</Alert>}

      <Card>
        <form onSubmit={anlegen}>
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

      <div style={{ marginTop: 'var(--space-5)' }}>
        <TextField label="Suchen" type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name oder Mail" />
        {zeilen === null && !fehler && <Spinner />}
        {zeilen !== null && gefiltert.length === 0 && <EmptyState titel="Keine Personen gefunden" />}
        <ul className="list">
          {gefiltert.map((p) => {
            const s = einladungsStatus(p);
            return (
              <li key={p.id} className="list__item">
                <div className="list__main">
                  <div className="list__title">{p.vorname} {p.nachname}</div>
                  <div className="list__meta">
                    <span>{p.mail}</span>
                    <Badge>{p.kategorie}</Badge>
                    <Badge ton={s.ton}>{s.text}</Badge>
                    {!p.aktiv && <Badge ton="danger">Deaktiviert</Badge>}
                  </div>
                </div>
                {!p.auth_user_id && p.aktiv && (
                  <Button klein laedt={arbeitet === p.id} onClick={() => void einladen(p)}>
                    {p.eingeladen_am ? 'Erneut einladen' : 'Einladen'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
