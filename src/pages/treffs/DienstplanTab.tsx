import { useCallback, useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { formatDatum, formatKurz, heuteIso } from '../../freizeiten/logik';
import {
  entscheideWunsch, holeTreffTeam, legeDienstplanKommentarAn, listeAbwesenheiten, listeDienste, listeDienstplanKommentare, listeFeiertage,
  listeTreffAbsprachen, loescheDienstplanKommentar, wuenscheDienst, wunschZuruecknehmen, type TreffDetailDaten,
} from '../../treffs/api';
import {
  abwesendeAm, addTage, darfWuenschen, dienstZeit, eigenerWunsch, feiertagAm, montagVon, offeneWuensche, tageskarten, wochenTage, wochenText,
  type Dienst, type Tageskarte,
} from '../../treffs/dienstplan';
import { darfTreffVerwalten, oeffnungszeitText } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, Button, Card, Spinner } from '../../components/ui';
import { SonderdienstSheet, ZuteilenSheet } from './DienstSheets';

type Ziel = { art: 'zuteilen'; datum: string; dienst: Dienst | null } | { art: 'sonder'; dienst: Dienst | null };

const WUNSCH_LABEL = { offen: 'Wunsch offen', bestaetigt: 'Wunsch bestätigt', abgelehnt: 'Wunsch abgelehnt' } as const;
const WUNSCH_TON = { offen: 'warning', bestaetigt: 'success', abgelehnt: 'danger' } as const;
const datumZeit = (iso: string) => `${formatDatum(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

/** Dienstplan einer Kalenderwoche: Öffnungstage mit Zuteilung, Wünsche, Sonderdienste, Feiertage, Abwesenheiten und Wochenkommentare. */
export function DienstplanTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const { ich } = useAuth();
  const heute = heuteIso();
  const [montag, setMontag] = useState(() => montagVon(heute));
  const sonntag = addTage(montag, 6);
  const schluessel = `${t.id}-${montag}`;

  const team = useLaden(() => holeTreffTeam(t.id), `treffteam-${t.id}`);
  const dienste = useLaden(() => listeDienste(t.id, montag, sonntag), `dienste-${schluessel}`);
  const feiertage = useLaden(() => listeFeiertage(t.id, montag, sonntag), `feiertage-${schluessel}`);
  const abwesenheiten = useLaden(() => listeAbwesenheiten(montag, sonntag), `abwesenheiten-${schluessel}`);
  const absprachen = useLaden(() => listeTreffAbsprachen(t.id), `treffabsprachen-${t.id}`);
  const kommentare = useLaden(() => listeDienstplanKommentare(t.id, montag), `dp-kommentare-${schluessel}`);
  const neuLaden = () => { dienste.neuLaden(); feiertage.neuLaden(); kommentare.neuLaden(); absprachen.neuLaden(); team.neuLaden(); };
  useLive(['dienste', 'dienst_zuteilungen', 'dienst_wuensche', 'feiertage', 'dienstplan_kommentare', 'notizen', 'treff_team'], neuLaden);

  const [ziel, setZiel] = useState<Ziel | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);
  const [kommentarText, setKommentarText] = useState('');
  const schliessen = useCallback(() => setZiel(null), []);
  if (!ich) return null;

  const verwaltung = darfTreffVerwalten(rolle);
  const mitglieder = team.daten ?? [];
  const namen = Object.fromEntries(mitglieder.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const name = (id: string) => namen[id] ?? 'Jemand';
  const karten = tageskarten(wochenTage(montag), t.oeffnungszeiten, dienste.daten ?? []);
  const wuensche = offeneWuensche(karten);
  const ladefehler = team.fehler ?? dienste.fehler ?? feiertage.fehler ?? abwesenheiten.fehler ?? absprachen.fehler ?? kommentare.fehler;
  const laedt = team.laedt || dienste.laedt;

  async function aktion(fn: () => Promise<void>) {
    setFehler(null); setArbeitet(true);
    try { await fn(); dienste.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  async function kommentarSenden(e: FormEvent) {
    e.preventDefault();
    if (!kommentarText.trim() || !ich) return;
    setFehler(null);
    try {
      const id = await legeDienstplanKommentarAn(t.id, montag, ich.id, kommentarText);
      setKommentarText(''); kommentare.neuLaden();
      if (id) sendePush('dienstplan_kommentar', id);
    }
    catch (err) { setFehler(fehlerText(err)); }
  }

  const chips = (d: Dienst | null) => (d?.personen.length ? (
    <div className="row" style={{ gap: 'var(--space-2)' }} aria-label="Eingeteilt">
      {d.personen.map((p) => <Badge key={p} ton={p === ich.id ? 'accent' : 'neutral'}>{name(p)}</Badge>)}
    </div>
  ) : <span className="field__hint">Noch niemand eingeteilt</span>);

  const karte = (k: Tageskarte) => {
    const feiertag = feiertagAm(k.datum, feiertage.daten ?? [], t.id);
    const weg = abwesendeAm(k.datum, abwesenheiten.daten ?? []);
    const absprachenAmTag = (absprachen.daten ?? []).filter((n) => n.datum === k.datum);
    const w = eigenerWunsch(k, ich!.id);
    const offene = (k.regulaer?.wuensche ?? []).filter((x) => x.status === 'offen');
    const zeit = k.oeffnung ? oeffnungszeitText(k.oeffnung) : '';
    const istHeute = k.datum === heute;

    return (
      <section key={k.datum} className={`plan__tag${istHeute ? ' plan__tag--heute' : ''}`} aria-label={`Dienst am ${formatKurz(k.datum)}`}>
        <h3>{formatKurz(k.datum)}{istHeute ? ' · heute' : ''}{zeit ? ` · ${zeit}` : ''}</h3>
        <div className="list__meta" style={{ marginBottom: 'var(--space-2)' }}>
          {feiertag && <Badge ton="warning">Feiertag: {feiertag.bezeichnung}</Badge>}
          {absprachenAmTag.length > 0 && <Badge ton="accent">📌 {absprachenAmTag.length === 1 ? 'Absprache' : `${absprachenAmTag.length} Absprachen`}</Badge>}
          {weg.map((a) => <Badge key={a.id} ton="danger">{name(a.person_id)}: {a.typ === 'urlaub' ? 'Urlaub' : 'krank'}</Badge>)}
        </div>

        {k.oeffnung && (
          <div style={{ marginBottom: 'var(--space-2)' }}>
            {chips(k.regulaer)}
            {offene.length > 0 && verwaltung && (
              <ul className="list" style={{ marginTop: 'var(--space-2)' }} aria-label="Offene Wünsche">
                {offene.map((x) => (
                  <li key={x.person_id} className="list__item">
                    <div className="list__main"><strong>{name(x.person_id)}</strong> wünscht diesen Dienst</div>
                    <div className="row" style={{ gap: 'var(--space-2)' }}>
                      <Button klein variante="primary" disabled={arbeitet} aria-label={`Wunsch von ${name(x.person_id)} bestätigen`}
                        onClick={() => void aktion(async () => { await entscheideWunsch(k.regulaer!.id, x.person_id, true); sendePush('wunsch_antwort', k.regulaer!.id, { person: x.person_id }); })}>Bestätigen</Button>
                      <Button klein disabled={arbeitet} aria-label={`Wunsch von ${name(x.person_id)} ablehnen`}
                        onClick={() => void aktion(async () => { await entscheideWunsch(k.regulaer!.id, x.person_id, false); sendePush('wunsch_antwort', k.regulaer!.id, { person: x.person_id }); })}>Ablehnen</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="row" style={{ marginTop: 'var(--space-2)', gap: 'var(--space-2)' }}>
              {verwaltung && <Button klein onClick={() => setZiel({ art: 'zuteilen', datum: k.datum, dienst: k.regulaer })}>Zuteilen</Button>}
              {w && rolle === 'betreuerin' && <Badge ton={WUNSCH_TON[w]}>{WUNSCH_LABEL[w]}</Badge>}
              {darfWuenschen(rolle, k, ich!.id, heute) && (
                <Button klein disabled={arbeitet} onClick={() => void aktion(async () => { await wuenscheDienst(t.id, k.datum); sendePush('wunsch_neu', t.id, { datum: k.datum }); })}>Dienst wünschen</Button>
              )}
              {rolle === 'betreuerin' && w === 'offen' && (
                <Button klein variante="ghost" disabled={arbeitet} onClick={() => void aktion(() => wunschZuruecknehmen(k.regulaer!.id, ich!.id))}>Wunsch zurücknehmen</Button>
              )}
            </div>
          </div>
        )}

        {k.sonder.map((s) => (
          <div key={s.id} className="hinweis-warnung" style={{ marginBottom: 'var(--space-2)' }}>
            <strong>Sonderdienst: {s.bezeichnung}</strong>
            <div className="list__meta"><span>{dienstZeit(s)}{dienstZeit(s) ? ' Uhr' : ''}</span></div>
            {chips(s)}
            {verwaltung && <div style={{ marginTop: 'var(--space-2)' }}><Button klein onClick={() => setZiel({ art: 'sonder', dienst: s })}>Bearbeiten</Button></div>}
          </div>
        ))}
      </section>
    );
  };

  return (
    <div className="stack">
      {(ladefehler || fehler) && <Alert ton="error">{ladefehler ?? fehler}</Alert>}

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Button aria-label="Vorherige Woche" onClick={() => setMontag(addTage(montag, -7))}>←</Button>
        <div style={{ textAlign: 'center' }}>
          <strong>{wochenText(montag)}</strong>
          {montag !== montagVon(heute) && <div><Button klein variante="ghost" onClick={() => setMontag(montagVon(heute))}>Zur aktuellen Woche</Button></div>}
        </div>
        <Button aria-label="Nächste Woche" onClick={() => setMontag(addTage(montag, 7))}>→</Button>
      </div>

      {verwaltung && wuensche.length > 0 && <Alert ton="info">{wuensche.length === 1 ? 'Ein offener Dienstwunsch' : `${wuensche.length} offene Dienstwünsche`} in dieser Woche.</Alert>}
      {verwaltung && (
        <p><Button klein onClick={() => setZiel({ art: 'sonder', dienst: null })}>+ Sonderdienst</Button></p>
      )}

      {laedt && <Spinner />}
      {!laedt && karten.length === 0 && (
        <Card><p>{t.oeffnungszeiten.length === 0 ? 'Der Treff hat noch keine Öffnungstage.' : 'In dieser Woche gibt es keinen Dienst.'}</p></Card>
      )}
      {!laedt && karten.map(karte)}

      <Card>
        <h2>Kommentare zur Woche</h2>
        {(kommentare.daten ?? []).length === 0 && <p className="field__hint">Noch keine Kommentare.</p>}
        <ul className="list" style={{ marginBottom: 'var(--space-3)' }}>
          {(kommentare.daten ?? []).map((c) => (
            <li key={c.id} className="list__item">
              <div className="list__main">
                <div style={{ whiteSpace: 'pre-line' }}>{c.text}</div>
                <div className="list__meta"><span>{name(c.person_id)}</span><span>{datumZeit(c.created_at)}</span></div>
              </div>
              {(c.person_id === ich.id || verwaltung) && (
                <Button klein variante="ghost" aria-label="Kommentar löschen"
                  onClick={() => void aktion(async () => { await loescheDienstplanKommentar(c.id); kommentare.neuLaden(); })}>🗑</Button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => void kommentarSenden(e)}>
          <div className="field">
            <label className="field__label" htmlFor="dp-kommentar">Kommentar schreiben</label>
            <textarea id="dp-kommentar" className="input" rows={2} value={kommentarText} onChange={(e) => setKommentarText(e.target.value)} style={{ padding: 'var(--space-3)' }} />
          </div>
          <Button klein type="submit" disabled={!kommentarText.trim()}>Kommentar senden</Button>
        </form>
      </Card>

      {ziel?.art === 'zuteilen' && (
        <ZuteilenSheet treffId={t.id} datum={ziel.datum} dienst={ziel.dienst} team={mitglieder} abwesenheiten={abwesenheiten.daten ?? []}
          feiertag={feiertagAm(ziel.datum, feiertage.daten ?? [], t.id)} schliessen={schliessen} geaendert={() => dienste.neuLaden()} />
      )}
      {ziel?.art === 'sonder' && (
        <SonderdienstSheet treffId={t.id} dienst={ziel.dienst} startDatum={montag <= heute && heute <= sonntag ? heute : montag} team={mitglieder}
          abwesenheiten={abwesenheiten.daten ?? []} schliessen={schliessen} geaendert={() => dienste.neuLaden()} />
      )}
    </div>
  );
}
