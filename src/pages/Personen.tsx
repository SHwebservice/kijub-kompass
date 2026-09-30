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

interface Startpasswort { name: string; mail: string; passwort: string; neu: boolean }

/** Zugangsstatus einer Person (rein aus den Daten abgeleitet). */
export function zugangsStatus(p: Pick<PersonZeile, 'auth_user_id'>) {
  return p.auth_user_id
    ? { text: 'Zugang eingerichtet', ton: 'success' as const }
    : { text: 'Noch kein Zugang', ton: 'neutral' as const };
}

function StartpasswortAnzeige({ s, schliessen }: { s: Startpasswort; schliessen: () => void }) {
  const [kopiert, setKopiert] = useState(false);
  async function kopieren() {
    try { await navigator.clipboard.writeText(s.passwort); setKopiert(true); } catch { /* Zwischenablage nicht verfügbar */ }
  }
  return (
    <Card className="startpasswort">
      <h2>{s.neu ? 'Zugang eingerichtet' : 'Neues Startpasswort'} für {s.name}</h2>
      <p>Gib der Person Mail-Adresse und Passwort persönlich weiter (z. B. mündlich oder per Messenger).
        Sie legt beim ersten Anmelden ein eigenes Passwort fest.</p>
      <p><strong>Mail-Adresse:</strong> {s.mail}</p>
      <p style={{ fontSize: '1.5rem', fontFamily: 'monospace', letterSpacing: '1px', margin: 'var(--space-3) 0' }}
        aria-label="Startpasswort" data-testid="startpasswort">{s.passwort}</p>
      <Alert ton="info">Dieses Passwort wird nur jetzt angezeigt und nirgends gespeichert. Danach lässt sich nur ein neues erzeugen.</Alert>
      <div className="row">
        <Button onClick={() => void kopieren()}>{kopiert ? 'Kopiert ✓' : 'Passwort kopieren'}</Button>
        <Button variante="primary" onClick={schliessen}>Fertig</Button>
      </div>
    </Card>
  );
}

/** Koordination: Personen anlegen, Zugang einrichten, Passwort zurücksetzen.
 *  Die volle Personalverwaltung folgt in Phase 3. */
export function Personen() {
  const [zeilen, setZeilen] = useState<PersonZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [startpasswort, setStartpasswort] = useState<Startpasswort | null>(null);
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
    setMeldung('Person angelegt. Als Nächstes kannst du den Zugang einrichten.');
    neuLaden();
  }

  async function zugangEinrichten(p: PersonZeile) {
    const hatZugang = Boolean(p.auth_user_id);
    if (hatZugang && !window.confirm(`Neues Startpasswort für ${p.vorname} ${p.nachname} erzeugen? Das bisherige Passwort wird ungültig.`)) return;
    setArbeitet(p.id); setFehler(null); setMeldung(null); setStartpasswort(null);
    const { data, error } = await supabase.functions.invoke('konto-passwort', { body: { person_id: p.id } });
    setArbeitet(null);
    if (error || !data?.passwort) {
      setFehler(data?.fehler ?? 'Zugang konnte nicht eingerichtet werden. Ist die Funktion „konto-passwort" bereitgestellt?');
      return;
    }
    setStartpasswort({ name: `${p.vorname} ${p.nachname}`, mail: p.mail, passwort: data.passwort, neu: Boolean(data.neu) });
    neuLaden();
  }

  const gefiltert = (zeilen ?? []).filter((p) =>
    `${p.vorname} ${p.nachname} ${p.mail}`.toLowerCase().includes(suche.trim().toLowerCase()));

  return (
    <>
      <PageHeader titel="Personen" />
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {meldung && <Alert ton="success">{meldung}</Alert>}
      {startpasswort && <StartpasswortAnzeige s={startpasswort} schliessen={() => setStartpasswort(null)} />}

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
            const s = zugangsStatus(p);
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
                {p.aktiv && (
                  <Button klein laedt={arbeitet === p.id} onClick={() => void zugangEinrichten(p)}>
                    {p.auth_user_id ? 'Passwort zurücksetzen' : 'Zugang einrichten'}
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
