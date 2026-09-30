import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { formatDatum } from '../../freizeiten/logik';
import {
  bewerte, entferneBewertung, holeBewertungen, kommentiereAngebot, listeAngebotKommentare, listeKatalog, loescheAngebot, loescheAngebotKommentar,
  meineBewertungen, meineFavoriten, setzeFavorit,
} from '../../katalog/api';
import { kategorieIcon, kategorieLabel } from '../../katalog/kategorien';
import { aehnliche, alterText, bewertungText, sterne, WETTER_ICON, WETTER_LABEL } from '../../katalog/logik';
import { Alert, Badge, Button, Card, EmptyState, Spinner } from '../../components/ui';
import { KatalogDruck } from './KatalogDruck';

function Zeile({ label, wert }: { label: string; wert: React.ReactNode }) {
  if (wert === null || wert === undefined || wert === '') return null;
  return (<><dt>{label}</dt><dd style={{ whiteSpace: 'pre-line' }}>{wert}</dd></>);
}

/** Ein Programmpunkt mit allen Angaben, Bewertung, Favorit, Kommentaren und ähnlichen Programmpunkten. */
export function AngebotDetail() {
  const { id = '' } = useParams();
  const { ich, rollen } = useAuth();
  const navigate = useNavigate();
  const katalog = useLaden(listeKatalog, 'katalog');
  const bewertungen = useLaden(holeBewertungen, 'katalog-bewertungen');
  const meine = useLaden(async (): Promise<Record<string, number>> => (ich ? meineBewertungen(ich.id) : {}), `katalog-meine-${ich?.id ?? ''}`);
  const favoriten = useLaden(async () => (ich ? meineFavoriten(ich.id) : []), `katalog-favoriten-${ich?.id ?? ''}`);
  const kommentare = useLaden(() => listeAngebotKommentare(id), `katalog-kommentare-${id}`);
  const [text, setText] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);
  if (!ich || !rollen) return null;

  const a = katalog.daten?.find((x) => x.id === id);
  if (katalog.fehler) return <Alert ton="error">{katalog.fehler}</Alert>;
  if (katalog.laedt) return <Spinner />;
  if (!a) return <EmptyState icon="🔍" titel="Programmpunkt nicht gefunden">Er existiert nicht mehr. <Link to="/katalog">Zum Katalog</Link></EmptyState>;

  const istFavorit = (favoriten.daten ?? []).includes(a.id);
  const mein = (meine.daten ?? {})[a.id];
  const b = bewertungen.daten?.[a.id];
  const aehnlich = aehnliche(a, katalog.daten ?? []);

  async function lauf(fn: () => Promise<void>, danach: () => void) {
    setFehler(null);
    try { await fn(); danach(); } catch (e) { setFehler(fehlerText(e)); }
  }

  const sternKlick = (n: number) => lauf(
    () => (mein === n ? entferneBewertung(a.id, ich!.id) : bewerte(a.id, ich!.id, n)),
    () => { meine.neuLaden(); bewertungen.neuLaden(); },
  );

  async function senden(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await lauf(() => kommentiereAngebot(a!.id, ich!.id, text), () => { setText(''); kommentare.neuLaden(); });
  }

  async function kopieren() {
    try { await navigator.clipboard.writeText(window.location.href); setKopiert(true); } catch { setFehler('Der Link konnte nicht kopiert werden.'); }
  }

  return (
    <>
      <p><Link to="/katalog">← Katalog</Link></p>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 'var(--space-2)' }}>{a.name}</h1>
          <div className="list__meta">
            <Badge ton="accent">{kategorieIcon(a.kategorie)} {kategorieLabel(a.kategorie)}</Badge>
            {a.wetter && <span>{WETTER_ICON[a.wetter]} {WETTER_LABEL[a.wetter]}</span>}
            {b && <span>★ {bewertungText(b.durchschnitt, b.anzahl)}</span>}
          </div>
        </div>
        <Button variante="ghost" aria-pressed={istFavorit} aria-label={istFavorit ? 'Favorit entfernen' : 'Als Favorit merken'}
          onClick={() => void lauf(() => setzeFavorit(a.id, ich.id, !istFavorit), () => favoriten.neuLaden())}>{istFavorit ? '★' : '☆'}</Button>
      </div>
      {(fehler || bewertungen.fehler || meine.fehler || favoriten.fehler) && <Alert ton="error">{fehler ?? bewertungen.fehler ?? meine.fehler ?? favoriten.fehler}</Alert>}

      <Card>
        <dl className="daten">
          <Zeile label="Dauer" wert={a.dauer} />
          <Zeile label="Gruppengröße" wert={a.gruppe} />
          <Zeile label="Alter" wert={a.alter_gruppen.length ? a.alter_gruppen.map((g) => `${alterText(g)} Jahre`).join(', ') : ''} />
          <Zeile label="Personalbedarf" wert={a.personal} />
          <Zeile label="Raum" wert={a.raum} />
          <Zeile label="Material" wert={a.material} />
          <Zeile label="Vorbereitung" wert={a.vorbereitung} />
          <Zeile label="Umsetzung" wert={a.umsetzung} />
          <Zeile label="Nachbereitung" wert={a.nachbereitung} />
          <Zeile label="Autor/in" wert={a.autor} />
        </dl>
        <div className="row">
          <Button klein onClick={() => void kopieren()}>{kopiert ? 'Link kopiert ✓' : 'Link kopieren'}</Button>
          <Button klein onClick={() => { const v = document.title; document.title = a.name; window.print(); document.title = v; }}>Drucken / als PDF speichern</Button>
          {rollen.koordination && <Link className="btn btn--sm" to={`/katalog/${a.id}/bearbeiten`}>Bearbeiten</Link>}
          {rollen.koordination && (
            <Button klein variante="danger" onClick={() => {
              if (window.confirm(`„${a.name}“ endgültig löschen? Bewertungen, Kommentare und Favoriten gehen mit; Einträge in Wochenplänen bleiben als Freitext nicht erhalten.`)) {
                void lauf(() => loescheAngebot(a.id), () => navigate('/katalog', { replace: true }));
              }
            }}>Löschen</Button>
          )}
        </div>
      </Card>

      <Card>
        <h2>Deine Bewertung</h2>
        <div className="row" role="group" aria-label="Bewertung" style={{ gap: 'var(--space-1)' }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Button key={n} klein variante={mein !== undefined && n <= mein ? 'primary' : 'standard'} aria-pressed={mein === n}
              aria-label={`${n} ${n === 1 ? 'Stern' : 'Sterne'}`} onClick={() => void sternKlick(n)}>★</Button>
          ))}
        </div>
        <p className="field__hint">
          {mein !== undefined ? `Du hast ${sterne(mein)} gegeben – nochmal auf denselben Stern tippen entfernt die Bewertung. ` : 'Tippe auf einen Stern, um zu bewerten. '}
          {b ? `Durchschnitt: ${bewertungText(b.durchschnitt, b.anzahl)}` : 'Noch nicht bewertet.'}
        </p>
      </Card>

      {aehnlich.length > 0 && (
        <Card>
          <h2>Ähnliche Programmpunkte</h2>
          <ul className="list" aria-label="Ähnliche Programmpunkte">
            {aehnlich.map((x) => <li key={x.id} className="list__item"><Link className="list__title" to={`/katalog/${x.id}`}>{x.name}</Link></li>)}
          </ul>
        </Card>
      )}

      <Card>
        <h2>Kommentare</h2>
        {kommentare.fehler && <Alert ton="error">{kommentare.fehler}</Alert>}
        {kommentare.laedt && <Spinner />}
        {!kommentare.laedt && (kommentare.daten?.length ?? 0) === 0 && <p className="field__hint">Noch keine Kommentare.</p>}
        <ul className="list" style={{ marginBottom: 'var(--space-3)' }}>
          {(kommentare.daten ?? []).map((k) => (
            <li key={k.id} className="list__item">
              <div className="list__main">
                <div style={{ whiteSpace: 'pre-line' }}>{k.text}</div>
                <div className="list__meta"><span>{k.vorname} {k.nachname}</span><span>{formatDatum(k.created_at.slice(0, 10))}</span></div>
              </div>
              {(k.person_id === ich.id || rollen.koordination) && (
                <Button klein variante="ghost" aria-label="Kommentar löschen" onClick={() => void lauf(() => loescheAngebotKommentar(k.id), () => kommentare.neuLaden())}>🗑</Button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void senden(e)}>
          <div className="field">
            <label className="field__label" htmlFor="angebot-kommentar">Kommentar schreiben</label>
            <textarea id="angebot-kommentar" className="input" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} style={{ padding: 'var(--space-3)' }} />
          </div>
          <Button klein type="submit" disabled={!text.trim()}>Kommentar senden</Button>
        </form>
      </Card>

      <KatalogDruck angebote={[a]} />
    </>
  );
}
