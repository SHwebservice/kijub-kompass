import { useState } from 'react';
import type { PersonZeile } from '../../zuordnung/api';
import { Alert, Button, Card } from '../../components/ui';

export interface Startpasswort { name: string; mail: string; passwort: string; neu: boolean }

/** Zugangsstatus einer Person (rein aus den Daten abgeleitet). */
export function zugangsStatus(p: Pick<PersonZeile, 'auth_user_id'>) {
  return p.auth_user_id
    ? { text: 'Zugang eingerichtet', ton: 'success' as const }
    : { text: 'Noch kein Zugang', ton: 'neutral' as const };
}

/** Zeigt das Startpasswort genau einmal – es wird nirgends gespeichert. */
export function StartpasswortAnzeige({ s, schliessen }: { s: Startpasswort; schliessen: () => void }) {
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
