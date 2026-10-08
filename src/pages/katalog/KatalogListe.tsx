import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { fehlerText } from '../../lib/fehler';
import { holeBewertungen, listeKatalog, listeVorschlaege, meineFavoriten, setzeFavorit } from '../../katalog/api';
import { KATEGORIEN_ANGEBOT } from '../../katalog/kategorien';
import {
  ALTER_GRUPPEN, alterText, bewertungText, filterAktiv, filtere, gruppiere, keinFilter, WETTER_ICON, WETTER_LABEL, type Angebot, type Filter, type Wetter,
} from '../../katalog/logik';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner, TextField } from '../../components/ui';
import { KatalogDruck } from './KatalogDruck';

/** Der Katalog: suchen, filtern, Favoriten; die Koordination pflegt ihn, alle anderen können Programmpunkte vorschlagen. */
export function KatalogListe() {
  const { ich, rollen } = useAuth();
  const katalog = useLaden(listeKatalog, 'katalog');
  const bewertungen = useLaden(holeBewertungen, 'katalog-bewertungen');
  const favoriten = useLaden(async () => (ich ? meineFavoriten(ich.id) : []), `katalog-favoriten-${ich?.id ?? ''}`);
  const vorschlaege = useLaden(async () => (rollen?.koordination ? listeVorschlaege() : []), `katalog-vorschlaege-${rollen?.koordination ?? false}`);
  const [filter, setFilter] = useState<Filter>(keinFilter);
  const [zu, setZu] = useState<Set<string>>(new Set());
  const [fehler, setFehler] = useState<string | null>(null);
  if (!ich || !rollen) return null;

  const favSet = new Set(favoriten.daten ?? []);
  const treffer = filtere(katalog.daten ?? [], filter, favSet);
  const gruppen = gruppiere(treffer);
  const offeneVorschlaege = (vorschlaege.daten ?? []).filter((v) => v.status === 'offen').length;
  const set = <K extends keyof Filter>(k: K, v: Filter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const umschalten = <K extends 'kategorie' | 'wetter' | 'alter'>(k: K, v: NonNullable<Filter[K]>) => set(k, (filter[k] === v ? null : v) as Filter[K]);

  async function favorit(a: Angebot) {
    setFehler(null);
    try { await setzeFavorit(a.id, ich!.id, !favSet.has(a.id)); favoriten.neuLaden(); } catch (e) { setFehler(fehlerText(e)); }
  }

  const chip = (aktiv: boolean, label: string, onClick: () => void, extra?: string) => (
    <Button klein key={label} variante={aktiv ? 'primary' : 'standard'} aria-pressed={aktiv} onClick={onClick} aria-label={extra}>{label}</Button>
  );

  return (
    <>
      <PageHeader titel="Katalog">
        {rollen.koordination
          ? <Link className="btn btn--primary" to="/katalog/neu">Neuer Programmpunkt</Link>
          : <Link className="btn btn--primary" to="/katalog/vorschlagen">Programmpunkt vorschlagen</Link>}
      </PageHeader>
      {rollen.koordination ? (
        <p className="row" style={{ gap: 'var(--space-2)' }}>
          <Link className="btn btn--sm" to="/katalog/vorschlaege">Vorschläge{offeneVorschlaege > 0 ? ` (${offeneVorschlaege})` : ''}</Link>
        </p>
      ) : (
        <p><Link className="btn btn--sm" to="/katalog/vorschlaege">Meine Vorschläge</Link></p>
      )}
      {(katalog.fehler || bewertungen.fehler || favoriten.fehler || fehler) && <Alert ton="error">{katalog.fehler ?? bewertungen.fehler ?? favoriten.fehler ?? fehler}</Alert>}

      <TextField label="Suchen" type="search" value={filter.suche} onChange={(e) => set('suche', e.target.value)} placeholder="Name, Material, Umsetzung …" autoComplete="off" />
      <div className="stack" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <div className="row" style={{ gap: 'var(--space-2)' }} role="group" aria-label="Kategorie">
          {KATEGORIEN_ANGEBOT.map((k) => chip(filter.kategorie === k.id, `${k.icon} ${k.label}`, () => umschalten('kategorie', k.id)))}
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }} role="group" aria-label="Wetter, Alter und Favoriten">
          {(Object.keys(WETTER_LABEL) as Wetter[]).map((w) => chip(filter.wetter === w, `${WETTER_ICON[w]} ${WETTER_LABEL[w]}`, () => umschalten('wetter', w)))}
          {ALTER_GRUPPEN.map((g) => chip(filter.alter === g, `${alterText(g)} Jahre`, () => umschalten('alter', g)))}
          {chip(filter.nurFavoriten, '★ Favoriten', () => set('nurFavoriten', !filter.nurFavoriten))}
          {filterAktiv(filter) && <Button klein variante="ghost" onClick={() => setFilter(keinFilter)}>Filter zurücksetzen</Button>}
        </div>
      </div>

      {katalog.laedt && <Spinner />}
      {!katalog.laedt && (katalog.daten?.length ?? 0) === 0 && (
        <EmptyState icon="📚" titel="Der Katalog ist noch leer">
          {rollen.koordination ? 'Lege Programmpunkte an oder importiere sie aus einer Datei.' : 'Sobald die Koordination Programmpunkte angelegt hat, erscheinen sie hier. Du kannst auch selbst welche vorschlagen.'}
        </EmptyState>
      )}
      {!katalog.laedt && (katalog.daten?.length ?? 0) > 0 && (
        <p className="field__hint" role="status">{treffer.length} von {katalog.daten!.length} Programmpunkten</p>
      )}
      {!katalog.laedt && (katalog.daten?.length ?? 0) > 0 && treffer.length === 0 && <EmptyState icon="🔍" titel="Nichts gefunden">Ändere die Suche oder setze die Filter zurück.</EmptyState>}

      {gruppen.map((g) => {
        const offen = !zu.has(g.kategorie);
        return (
          <section key={g.kategorie} aria-label={g.label} style={{ marginBottom: 'var(--space-4)' }}>
            <h2>
              <button type="button" className="mappe__kopf" aria-expanded={offen}
                onClick={() => setZu((s) => { const n = new Set(s); if (n.has(g.kategorie)) n.delete(g.kategorie); else n.add(g.kategorie); return n; })}>
                <span aria-hidden="true">{g.icon}</span>
                <span className="mappe__titel">{g.label} ({g.eintraege.length})</span>
                <span aria-hidden="true">{offen ? '▲' : '▼'}</span>
              </button>
            </h2>
            {offen && (
              <ul className="list">
                {g.eintraege.map((a) => {
                  const b = bewertungen.daten?.[a.id];
                  return (
                    <li key={a.id} className="list__item">
                      <div className="list__main">
                        <Link className="list__title" to={`/katalog/${a.id}`}>{a.name}</Link>
                        <div className="list__meta">
                          {a.dauer && <span>⏱ {a.dauer}</span>}
                          {a.gruppe && <span>👥 {a.gruppe}</span>}
                          {a.wetter && <span title={WETTER_LABEL[a.wetter]}>{WETTER_ICON[a.wetter]}</span>}
                          {a.alter_gruppen.map((x) => <Badge key={x}>{alterText(x)}</Badge>)}
                          {b && <span aria-label={`Bewertung ${bewertungText(b.durchschnitt, b.anzahl)}`}>★ {bewertungText(b.durchschnitt, b.anzahl)}</span>}
                        </div>
                      </div>
                      <Button klein variante="ghost" aria-pressed={favSet.has(a.id)} aria-label={`Favorit: ${a.name}`} onClick={() => void favorit(a)}>{favSet.has(a.id) ? '★' : '☆'}</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {treffer.length > 0 && (
        <p><Button onClick={() => { const v = document.title; document.title = 'Katalog'; window.print(); document.title = v; }}>Angezeigte Programmpunkte drucken / als PDF speichern</Button></p>
      )}
      <KatalogDruck angebote={treffer} />
    </>
  );
}
