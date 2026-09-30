import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { istApple, pruefeStatus, type GeraeteStatus } from '../../mitteilungen/geraet';
import { Alert } from '../../components/ui';

const MERKER = 'kompass-mitteilungen-hinweis-zu';

function gemerkt(): boolean {
  try { return window.localStorage.getItem(MERKER) === '1'; } catch { return false; }
}

/**
 * Einladung, Mitteilungen einzuschalten (oder auf dem iPhone die App zum Home-Bildschirm hinzuzufügen).
 * Erscheint nur, wo es etwas zu tun gibt, und lässt sich wegklicken (der Wunsch wird im Browser gemerkt).
 */
export function MitteilungsHinweis() {
  const { ich } = useAuth();
  const [status, setStatus] = useState<GeraeteStatus | null>(null);
  const [zu, setZu] = useState(gemerkt);

  useEffect(() => {
    let aktuell = true;
    void (async () => {
      if (!ich) return;
      let s: GeraeteStatus;
      try { s = await pruefeStatus(ich.id); } catch { s = 'an'; }          // bei Fehlern lieber nichts anzeigen
      if (aktuell) setStatus(s);
    })();
    return () => { aktuell = false; };
  }, [ich]);

  if (zu) return null;
  const einschalten = status === 'aus';
  const installieren = status === 'nicht_unterstuetzt' && istApple();
  if (!einschalten && !installieren) return null;

  function schliessen() {
    try { window.localStorage.setItem(MERKER, '1'); } catch { /* ohne Speicher erscheint der Hinweis eben wieder */ }
    setZu(true);
  }

  return (
    <Alert ton="info">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span>
          {einschalten
            ? <>Damit du nichts verpasst: <Link to="/mehr">Mitteilungen einschalten</Link> – du bekommst dann eine Nachricht aufs Handy bei neuen Hinweisen, Absprachen und Änderungen im Dienstplan.</>
            : <>Damit du Mitteilungen bekommst, füge diese Seite zum Home-Bildschirm hinzu (Teilen → „Zum Home-Bildschirm“) und öffne sie von dort.</>}
        </span>
        <button type="button" className="btn btn--ghost btn--sm" onClick={schliessen} aria-label="Hinweis ausblenden">✕</button>
      </div>
    </Alert>
  );
}
