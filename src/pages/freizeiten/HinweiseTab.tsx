import { useState } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import {
  aendereNotiz, bestaetige, bestaetigungZurueck, holeNamen, holeTeam, kommentiere, legeNotizAn, listeNotizen, loescheKommentar, loescheNotiz,
  type FreizeitDetailDaten, type NotizWerte,
} from '../../freizeiten/api';
import { formatKurz } from '../../freizeiten/logik';
import { darfNotizSchreiben, gruppiereNotizen, type Notiz, type NotizArt } from '../../freizeiten/notizen';
import type { RolleInFreizeit } from '../../lib/rollen';
import { Alert, Card, EmptyState, Spinner } from '../../components/ui';
import { NotizFormular } from './NotizFormular';
import { NotizKarte, type NotizAktionen } from './NotizKarte';

function Abschnitt({ titel, untertitel, art, notizen, f, rolle, ichId, namen, team, aktionen, anlegen }: {
  titel: string; untertitel: string; art: NotizArt; notizen: Notiz[]; f: FreizeitDetailDaten; rolle: RolleInFreizeit; ichId: string;
  namen: Record<string, string>; team: { person_id: string; rolle: 'leitung' | 'teamer' }[]; aktionen: NotizAktionen;
  anlegen: (art: NotizArt, w: NotizWerte) => Promise<void>;
}) {
  const g = gruppiereNotizen(notizen);
  const karte = (n: Notiz) => (
    <NotizKarte key={n.id} notiz={n} rolle={rolle} ichId={ichId} namen={namen} team={team} start={f.start_datum} ende={f.ende_datum} aktionen={aktionen} />
  );
  return (
    <section aria-labelledby={`abschnitt-${art}`} className="stack" style={{ marginBottom: 'var(--space-6)' }}>
      <div>
        <h2 id={`abschnitt-${art}`} style={{ marginBottom: 'var(--space-1)' }}>{titel}</h2>
        <p className="field__hint" style={{ margin: 0 }}>{untertitel}</p>
      </div>
      {darfNotizSchreiben(rolle) && (
        <Card>
          <NotizFormular start={f.start_datum} ende={f.ende_datum} beschriftung={art === 'hinweis' ? 'Neuer Hinweis' : 'Neue Absprache'}
            speichern={(w) => anlegen(art, w)} />
        </Card>
      )}
      {notizen.length === 0 && <EmptyState icon={art === 'hinweis' ? '📣' : '🤝'} titel={art === 'hinweis' ? 'Noch keine Hinweise' : 'Noch keine Absprachen'} />}
      {g.gesamt.length > 0 && <ul className="list" aria-label={`${titel}: ganze Freizeit`}>{g.gesamt.map(karte)}</ul>}
      {g.tage.map((t) => (
        <div key={t.datum}>
          <h3>{formatKurz(t.datum)}</h3>
          <ul className="list">{t.notizen.map(karte)}</ul>
        </div>
      ))}
    </section>
  );
}

/**
 * Hinweise für das ganze Team (TeamerInnen bestätigen „gesehen") und – nur für Leitung und Koordination –
 * Absprachen, die bestätigt und kommentiert werden. Welche Notizen ankommen, entscheidet die Datenbank.
 */
export function HinweiseTab({ freizeit: f, rolle }: { freizeit: FreizeitDetailDaten; rolle: RolleInFreizeit }) {
  const { ich } = useAuth();
  const notizen = useLaden(() => listeNotizen(f.id), `notizen-${f.id}`);
  const team = useLaden(() => holeTeam(f.id), `team-${f.id}`);
  const ids = [...new Set([
    ...(notizen.daten ?? []).flatMap((n) => [n.erstellt_von, ...n.bestaetigungen.map((b) => b.person_id), ...n.kommentare.map((k) => k.person_id)]),
  ].filter((x): x is string => !!x))].sort();
  const namenL = useLaden(() => holeNamen(ids), `notiz-namen-${f.id}-${ids.join(',')}`);
  useLive(['notizen', 'notiz_bestaetigungen', 'notiz_kommentare', 'freizeit_team'], () => { notizen.neuLaden(); team.neuLaden(); });
  const [fehler, setFehler] = useState<string | null>(null);
  if (!ich) return null;

  const teamNamen = Object.fromEntries((team.daten ?? []).map((t) => [t.person_id, `${t.vorname} ${t.nachname}`]));
  const namen = { ...(namenL.daten ?? {}), ...teamNamen };
  const teamListe = (team.daten ?? []).map((t) => ({ person_id: t.person_id, rolle: t.rolle }));

  async function lauf<T>(aktion: () => Promise<T>): Promise<T> {
    setFehler(null);
    try { const r = await aktion(); notizen.neuLaden(); return r; } catch (e) { setFehler(fehlerText(e)); throw e; }
  }
  // Fehler werden oben angezeigt; die Formulare bleiben dabei mit ihren Eingaben stehen.
  const still = (p: Promise<void>) => p.catch(() => undefined);

  const aktionen: NotizAktionen = {
    bearbeiten: (id, w) => lauf(() => aendereNotiz(id, w)),
    loeschen: (id) => still(lauf(() => loescheNotiz(id))),
    bestaetigen: (id, an) => still(lauf(() => (an ? bestaetige(id, ich.id) : bestaetigungZurueck(id, ich.id)))),
    kommentieren: (id, text) => still(lauf(() => kommentiere(id, ich.id, text))),
    kommentarLoeschen: (id) => still(lauf(() => loescheKommentar(id))),
  };
  const anlegen = async (art: NotizArt, w: NotizWerte) => {
    const id = await lauf(() => legeNotizAn(f.id, art, w));
    // Mitteilung an das Team (Hinweis) bzw. an Leitung und Koordination (Absprache) – ohne zu warten
    if (id) sendePush(art === 'hinweis' ? 'hinweis' : 'absprache_freizeit', id);
  };

  const alle = notizen.daten ?? [];
  const absprachenSichtbar = rolle === 'leitung' || rolle === 'koordination';

  return (
    <div>
      {(notizen.fehler || fehler) && <Alert ton="error">{notizen.fehler ?? fehler}</Alert>}
      {notizen.laedt && <Spinner />}
      {!notizen.laedt && (
        <>
          <Abschnitt titel="Hinweise für das Team" untertitel="Für alle in der Freizeit sichtbar. TeamerInnen bestätigen, dass sie einen Hinweis gesehen haben."
            art="hinweis" notizen={alle.filter((n) => n.art === 'hinweis')} f={f} rolle={rolle} ichId={ich.id} namen={namen} team={teamListe} aktionen={aktionen} anlegen={anlegen} />
          {absprachenSichtbar && (
            <Abschnitt titel="Absprachen mit der Koordination" untertitel="Nur für Leitung und Koordination sichtbar."
              art="absprache" notizen={alle.filter((n) => n.art === 'absprache')} f={f} rolle={rolle} ichId={ich.id} namen={namen} team={teamListe} aktionen={aktionen} anlegen={anlegen} />
          )}
        </>
      )}
    </div>
  );
}
