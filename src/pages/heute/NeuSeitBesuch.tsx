import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fehlerText } from '../../lib/fehler';
import { formatDatum } from '../../freizeiten/logik';
import type { Neuigkeit, NeuigkeitArt } from '../../heute/api';
import { vorZeit } from '../../heute/logik';
import { Alert, Button, Card } from '../../components/ui';

const ART: Record<NeuigkeitArt, { icon: string; label: string }> = {
  hinweis: { icon: '📣', label: 'Hinweis' },
  absprache: { icon: '🤝', label: 'Absprache' },
  plan: { icon: '📅', label: 'Wochenplan' },
  protokoll: { icon: '📝', label: 'Protokoll' },
  notiz: { icon: '🗒️', label: 'Notiz' },
  kommentar: { icon: '💬', label: 'Kommentar' },
  bewerbung: { icon: '📥', label: 'Bewerbung' },
  vorschlag: { icon: '💡', label: 'Vorschlag' },
  nachweis: { icon: '🧾', label: 'Nachweis' },
};

const uhrzeit = (iso: string) => {
  const d = new Date(iso);
  return `${formatDatum(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr`;
};

interface Props {
  seit: string | null;
  neu: Neuigkeit[];
  gesamt: number;
  /** „Alles gesehen“ (vermerkt den Besuch und lädt neu). */
  gesehen: () => Promise<void>;
}

/** „Neu seit deinem letzten Besuch“: was andere seitdem angelegt haben, mit Link dorthin. Erscheint nur, wenn es etwas gibt. */
export function NeuSeitBesuch({ seit, neu, gesamt, gesehen }: Props) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  if (!seit || neu.length === 0) return null;

  async function quittieren() {
    setFehler(null); setArbeitet(true);
    try { await gesehen(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  return (
    <Card>
      <h2>Neu seit deinem letzten Besuch</h2>
      <p className="field__hint">Seit {uhrzeit(seit)} – ohne deine eigenen Änderungen.</p>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <ul className="list" aria-label="Neuigkeiten">
        {neu.map((n, i) => (
          <li key={`${n.url}-${n.zeit}-${i}`} className="list__item">
            <div className="list__main" style={{ whiteSpace: 'normal' }}>
              <Link className="list__title" to={n.url} style={{ whiteSpace: 'normal' }}><span aria-hidden="true">{ART[n.art]?.icon ?? '•'} </span>{ART[n.art]?.label ?? n.art}: {n.text}</Link>
              <div className="list__meta"><span>{n.quelle}</span><span>{vorZeit(n.zeit)}</span></div>
            </div>
          </li>
        ))}
      </ul>
      {gesamt > neu.length && <p className="field__hint">… und {gesamt - neu.length} weitere.</p>}
      <Button klein laedt={arbeitet} onClick={() => void quittieren()}>Alles gesehen</Button>
    </Card>
  );
}
