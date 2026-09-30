import { Link } from 'react-router-dom';
import { useLaden, type Geladen } from '../../lib/laden';
import { formatMenge } from '../../freizeiten/lebensmittel';
import { listeOrtNamen, listeTeamZeilen, listeTreffNamen } from '../../heute/api';
import { knappeJeOrt, nichtGeseheneImTeam, personenText, wuenscheJeTreff, type BestandZeile, type OffeneNotiz, type WunschZeile } from '../../heute/logik';
import { formatKurz } from '../../freizeiten/logik';
import { Alert, Badge, Card } from '../../components/ui';

interface FreizeitOrt { id: string; name: string; ort_id: string | null }

/**
 * Für Leitungen (und die Koordination): knappe Lebensmittel an den Orten der aktuellen Freizeiten und Hinweise,
 * die noch nicht alle TeamerInnen gesehen haben.
 */
export function LeitungSicht({ heute, freizeiten, bestand, notizen }: { heute: string; freizeiten: FreizeitOrt[]; bestand: Geladen<BestandZeile[]>; notizen: Geladen<OffeneNotiz[]> }) {
  const ids = freizeiten.map((f) => f.id);
  const orte = useLaden(listeOrtNamen, 'heute-orte');
  const team = useLaden(() => listeTeamZeilen(ids), `heute-leitung-team-${ids.join(',')}`);

  const ortIds = new Set(freizeiten.map((f) => f.ort_id).filter((o): o is string => !!o));
  const knapp = knappeJeOrt(bestand.daten ?? [], ortIds);
  const nichtGesehen = nichtGeseheneImTeam(notizen.daten ?? [], team.daten ?? [], ids, heute);
  const fehler = bestand.fehler ?? notizen.fehler ?? team.fehler;

  if (!fehler && knapp.length === 0 && nichtGesehen.length === 0) return null;

  const freizeitAmOrt = (ortId: string) => freizeiten.find((f) => f.ort_id === ortId);

  return (
    <Card>
      <h2>Für die Leitung</h2>
      {fehler && <Alert ton="error">{fehler}</Alert>}

      {knapp.length > 0 && (
        <>
          <h3>Lebensmittel werden knapp</h3>
          <ul className="list" aria-label="Knappe Lebensmittel">
            {knapp.map((o) => {
              const f = freizeitAmOrt(o.ort_id);
              return (
                <li key={o.ort_id} className="list__item" style={{ display: 'block' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    {f ? <Link className="list__title" to={`/freizeiten/${f.id}/lebensmittel`}>{orte.daten?.[o.ort_id] ?? f.name}</Link> : <strong>{orte.daten?.[o.ort_id] ?? 'Ort'}</strong>}
                    <span>{o.leer > 0 && <Badge ton="danger">{o.leer} leer</Badge>} {o.knapp > 0 && <Badge ton="warning">{o.knapp} knapp</Badge>}</span>
                  </div>
                  <div className="list__meta">
                    {o.artikel.map((a) => <span key={a.name}>{a.name}{a.status === 'leer' ? ' (leer)' : ` (${formatMenge(a.rest)}${a.einheit ? ` ${a.einheit}` : ''})`}</span>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {nichtGesehen.length > 0 && (
        <>
          <h3>Hinweise, die noch nicht alle gesehen haben</h3>
          <ul className="list" aria-label="Nicht gesehene Hinweise">
            {nichtGesehen.map((n) => (
              <li key={n.freizeit_id} className="list__item">
                <div className="list__main">
                  <Link className="list__title" to={`/freizeiten/${n.freizeit_id}/hinweise`}>{n.quelle}</Link>
                  <div className="list__meta"><span>{personenText(n.anzahl, 'Hinweis', 'Hinweise')} mit offenen Bestätigungen im Team</span></div>
                </div>
                <Badge ton="warning">{n.anzahl}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Für Treffleitungen (und die Koordination): offene Dienstwünsche der nächsten Wochen. */
export function TreffleitungSicht({ wuensche }: { wuensche: Geladen<WunschZeile[]> }) {
  const namen = useLaden(listeTreffNamen, 'heute-treffnamen');
  const jeTreff = wuenscheJeTreff(wuensche.daten ?? []);

  if (!wuensche.fehler && jeTreff.length === 0) return null;

  return (
    <Card>
      <h2>Offene Dienstwünsche</h2>
      {wuensche.fehler && <Alert ton="error">{wuensche.fehler}</Alert>}
      <ul className="list" aria-label="Offene Dienstwünsche">
        {jeTreff.map((w) => (
          <li key={w.treff_id} className="list__item">
            <div className="list__main">
              <Link className="list__title" to={`/treffs/${w.treff_id}/dienstplan`}>{namen.daten?.[w.treff_id] ?? 'Treff'}</Link>
              <div className="list__meta"><span>{personenText(w.anzahl, 'Wunsch wartet', 'Wünsche warten')} auf Antwort, der nächste für {formatKurz(w.erster)}</span></div>
            </div>
            <Badge ton="warning">{w.anzahl}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
