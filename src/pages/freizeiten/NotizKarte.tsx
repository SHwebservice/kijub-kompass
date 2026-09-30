import { useState } from 'react';
import { formatDatum } from '../../freizeiten/logik';
import {
  bestaetigungsStand, darfBestaetigen, darfKommentarLoeschen, darfKommentieren, darfNotizSchreiben, istBestaetigtVon, namenListe, type Notiz,
} from '../../freizeiten/notizen';
import type { NotizWerte } from '../../freizeiten/api';
import type { RolleInFreizeit } from '../../lib/rollen';
import { Badge, Button } from '../../components/ui';
import { NotizFormular } from './NotizFormular';

export interface NotizAktionen {
  bearbeiten: (id: string, w: NotizWerte) => Promise<void>;
  loeschen: (id: string) => Promise<void>;
  bestaetigen: (id: string, an: boolean) => Promise<void>;
  kommentieren: (id: string, text: string) => Promise<void>;
  kommentarLoeschen: (id: string) => Promise<void>;
}

interface Props {
  notiz: Notiz;
  rolle: RolleInFreizeit;
  ichId: string;
  namen: Record<string, string>;
  team: { person_id: string; rolle: 'leitung' | 'teamer' }[];
  start: string;
  ende: string;
  aktionen: NotizAktionen;
}

const datumZeit = (iso: string) => `${formatDatum(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

/** Ein Hinweis oder eine Absprache mit Bestätigung, Kommentaren und – für die Leitung – Bearbeiten/Löschen. */
export function NotizKarte({ notiz: n, rolle, ichId, namen, team, start, ende, aktionen }: Props) {
  const [bearbeite, setBearbeite] = useState(false);
  const [kommentar, setKommentar] = useState('');
  const [offenAnzeigen, setOffenAnzeigen] = useState(false);

  const schreiben = darfNotizSchreiben(rolle);
  const bestaetigtIch = istBestaetigtVon(n, ichId);
  const stand = n.art === 'hinweis' ? bestaetigungsStand(n, team) : null;
  const verfasser = n.erstellt_von ? (namen[n.erstellt_von] ?? 'Jemand') : null;

  if (bearbeite) {
    return (
      <li className="list__item" style={{ display: 'block' }}>
        <NotizFormular start={start} ende={ende} beschriftung={n.art === 'hinweis' ? 'Hinweis bearbeiten' : 'Absprache bearbeiten'}
          anfang={{ text: n.text, geltung: n.geltung, datum: n.datum }} abbrechen={() => setBearbeite(false)}
          speichern={async (w) => { await aktionen.bearbeiten(n.id, w); setBearbeite(false); }} />
      </li>
    );
  }

  return (
    <li className="list__item" style={{ display: 'block' }}>
      <p style={{ whiteSpace: 'pre-line', marginBottom: 'var(--space-2)' }}>{n.text}</p>
      <div className="list__meta" style={{ marginBottom: 'var(--space-2)' }}>
        {verfasser && <span>{verfasser}</span>}
        <span>{datumZeit(n.created_at)}</span>
        {n.geltung === 'tag' && n.datum && <Badge>Nur {formatDatum(n.datum)}</Badge>}
      </div>

      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {darfBestaetigen(n.art, rolle) && (
          <Button klein variante={bestaetigtIch ? 'primary' : 'standard'} aria-pressed={bestaetigtIch}
            onClick={() => void aktionen.bestaetigen(n.id, !bestaetigtIch)}>
            👍 {n.art === 'hinweis' ? (bestaetigtIch ? 'Gesehen' : 'Gesehen?') : (bestaetigtIch ? 'Bestätigt' : 'Bestätigen')}
          </Button>
        )}
        {stand && schreiben && stand.gesamt > 0 && (
          <Button klein variante="ghost" aria-expanded={offenAnzeigen} onClick={() => setOffenAnzeigen(!offenAnzeigen)}>
            {stand.bestaetigt} von {stand.gesamt} gesehen
          </Button>
        )}
        {schreiben && <Button klein onClick={() => setBearbeite(true)}>Bearbeiten</Button>}
        {schreiben && (
          <Button klein variante="danger"
            onClick={() => { if (window.confirm(n.art === 'hinweis' ? 'Diesen Hinweis löschen?' : 'Diese Absprache löschen?')) void aktionen.loeschen(n.id); }}>
            Löschen
          </Button>
        )}
      </div>

      {stand && schreiben && offenAnzeigen && (
        <p className="field__hint" style={{ marginTop: 'var(--space-2)' }}>
          {stand.offen.length ? <>Noch nicht gesehen: {namenListe(stand.offen, namen)}</> : 'Alle im Team haben den Hinweis gesehen.'}
        </p>
      )}

      {n.art === 'absprache' && n.bestaetigungen.length > 0 && (
        <p className="field__hint" style={{ marginTop: 'var(--space-2)' }}>
          Bestätigt von {namenListe(n.bestaetigungen.map((b) => b.person_id), namen)}
        </p>
      )}

      {n.art === 'absprache' && (n.kommentare.length > 0 || darfKommentieren(n.art, rolle)) && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          {n.kommentare.length > 0 && (
            <ul className="list" style={{ marginBottom: 'var(--space-2)' }} aria-label="Kommentare">
              {n.kommentare.map((k) => (
                <li key={k.id} className="list__item" style={{ background: 'var(--surface-2)' }}>
                  <div className="list__main">
                    <div style={{ whiteSpace: 'pre-line' }}>{k.text}</div>
                    <div className="list__meta"><span>{namen[k.person_id] ?? 'Jemand'}</span><span>{datumZeit(k.created_at)}</span></div>
                  </div>
                  {darfKommentarLoeschen(k, rolle, ichId) && (
                    <Button klein variante="ghost" aria-label="Kommentar löschen" onClick={() => void aktionen.kommentarLoeschen(k.id)}>🗑</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {darfKommentieren(n.art, rolle) && (
            <form onSubmit={(e) => { e.preventDefault(); if (kommentar.trim()) { void aktionen.kommentieren(n.id, kommentar); setKommentar(''); } }}>
              <div className="field" style={{ marginBottom: 'var(--space-2)' }}>
                <label className="field__label" htmlFor={`kommentar-${n.id}`}>Kommentar</label>
                <textarea id={`kommentar-${n.id}`} className="input" rows={2} value={kommentar} onChange={(e) => setKommentar(e.target.value)} style={{ padding: 'var(--space-3)' }} />
              </div>
              <Button klein type="submit" disabled={!kommentar.trim()}>Kommentar senden</Button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
