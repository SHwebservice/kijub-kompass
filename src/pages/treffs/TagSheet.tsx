import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { formatDatum, wochentagLang } from '../../freizeiten/logik';
import {
  dienstSicherstellen, entscheideWunsch, nimmVerhinderungZurueck, setzeZuteilung, trageVerhinderungEin, wuenscheDienst, wunschZuruecknehmen, type TreffTeamMitglied,
} from '../../treffs/api';
import {
  ABWESENHEIT_TEXT, abwesendeAm, darfWuenschen, dienstZeit, eigenerWunsch, istVeroeffentlicht, mitteilungFuer, schliesszeitText, zuteilungsAenderung,
  type Abwesenheit, type Dienst, type Feiertag, type Tageskarte,
} from '../../treffs/dienstplan';
import { darfTreffVerwalten, oeffnungszeitText } from '../../treffs/logik';
import type { Notiz } from '../../freizeiten/notizen';
import type { RolleInTreff } from '../../lib/rollen';
import { Sheet } from '../../components/Sheet';
import { Alert, Badge, Button } from '../../components/ui';
import { ZuteilungsAuswahl } from './DienstSheets';

const WUNSCH_LABEL = { offen: 'Wunsch offen', bestaetigt: 'Wunsch bestätigt', abgelehnt: 'Wunsch abgelehnt' } as const;
const WUNSCH_TON = { offen: 'warning', bestaetigt: 'success', abgelehnt: 'danger' } as const;

interface Props {
  treffId: string;
  rolle: RolleInTreff;
  karte: Tageskarte;
  team: TreffTeamMitglied[];
  /** Urlaub, krank und „kann nicht“ (alle Tage; das Fenster nimmt die des Tages). */
  abwesenheiten: Abwesenheit[];
  feiertag: Feiertag | null;
  /** Absprachen, die an diesen Tag gekoppelt sind. */
  absprachen: Notiz[];
  ichId: string;
  heute: string;
  veroeffentlicht: readonly string[];
  /** Sonderdienst bearbeiten (Dienst) oder an diesem Tag anlegen (null); schließt das Tagesfenster. */
  sonderdienst: (dienst: Dienst | null) => void;
  /** Nach einer Änderung an Diensten oder Wünschen. */
  geaendert: () => void;
  /** Nach einer Änderung an „kann nicht“. */
  verhinderungGeaendert: () => void;
  schliessen: () => void;
}

/**
 * Tagesfenster des Dienstplans – öffnet sich mit einem Klick auf einen Tag der Einsatz-Matrix. Alles zu einem Tag an einer Stelle:
 * Öffnungszeit, Feiertag oder Schließzeit, Absprachen, Abwesende, Eingeteilte und Sonderdienste. Treffleitung und Koordination teilen hier ein,
 * beantworten Wünsche und legen Sonderdienste an; BetreuerInnen wünschen den Dienst oder sagen, dass sie nicht können.
 */
export function TagSheet({ treffId, rolle, karte: k, team, abwesenheiten, feiertag, absprachen, ichId, heute, veroeffentlicht, sonderdienst, geaendert, verhinderungGeaendert, schliessen }: Props) {
  const verwaltung = darfTreffVerwalten(rolle);
  const gespeichert = k.regulaer?.personen ?? [];
  // null = unverändert (folgt dem gespeicherten Stand, z. B. nach einem bestätigten Wunsch)
  const [auswahl, setAuswahl] = useState<string[] | null>(null);
  const gewaehlt = auswahl ?? gespeichert;
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const namen = Object.fromEntries(team.map((m) => [m.person_id, `${m.vorname} ${m.nachname}`]));
  const name = (id: string) => namen[id] ?? 'Jemand';
  const weg = abwesendeAm(k.datum, abwesenheiten);
  const offene = (k.regulaer?.wuensche ?? []).filter((w) => w.status === 'offen');
  const w = eigenerWunsch(k, ichId);
  const ichDrin = gespeichert.includes(ichId) || k.sonder.some((s) => s.personen.includes(ichId));
  const ichVerhindert = weg.some((a) => a.person_id === ichId && a.typ === 'verhindert');
  const imTeam = team.some((m) => m.person_id === ichId);
  const kuenftig = k.datum >= heute;
  const zuteilbar = verwaltung && !!k.oeffnung && (!k.geschlossen || gespeichert.length > 0);
  const { hinzu, weg: heraus } = zuteilungsAenderung(gespeichert, gewaehlt);
  const vorlaeufig = kuenftig && !istVeroeffentlicht(k.datum, veroeffentlicht);

  async function aktion(fn: () => Promise<void>, danach: () => void = geaendert) {
    setFehler(null); setArbeitet(true);
    try { await fn(); danach(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  async function zuteilenSpeichern() {
    setFehler(null); setArbeitet(true);
    try {
      const id = k.regulaer?.id ?? await dienstSicherstellen(treffId, k.datum);
      await setzeZuteilung(id, hinzu, heraus);
      // Wer neu eingeteilt oder herausgenommen wurde, erfährt es – sobald der Monat veröffentlicht ist
      const empfaenger = mitteilungFuer([...hinzu, ...heraus].map((person) => ({ datum: k.datum, person })), veroeffentlicht);
      if (empfaenger.length) sendePush('dienstplan', treffId, { personen: empfaenger });
      setAuswahl(null);
      geaendert(); schliessen();
    } catch (e) { setFehler(fehlerText(e, 'Die Zuteilung konnte nicht gespeichert werden.')); setArbeitet(false); }
  }

  const entscheide = (person: string, ja: boolean) => void aktion(async () => {
    await entscheideWunsch(k.regulaer!.id, person, ja);
    sendePush('wunsch_antwort', k.regulaer!.id, { person });
    setAuswahl(null);
  });

  const chips = (personen: string[]) => (personen.length ? (
    <div className="einsatz__schilder" aria-label="Eingeteilt">
      {personen.map((p) => <Badge key={p} ton={p === ichId ? 'accent' : 'neutral'}>{name(p)}</Badge>)}
    </div>
  ) : <p className="field__hint">Noch niemand eingeteilt</p>);

  return (
    <Sheet titel={`Dienst am ${wochentagLang(k.datum)}, ${formatDatum(k.datum)}`} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}
      <div className="list__meta">
        {k.oeffnung && <span>Öffnungszeit {oeffnungszeitText(k.oeffnung)}</span>}
        {feiertag && <Badge ton="warning">Feiertag: {feiertag.bezeichnung}</Badge>}
        {k.geschlossen && !k.geschlossen.feiertag && <Badge>{schliesszeitText(k.geschlossen)}</Badge>}
        {vorlaeufig && <Badge>vorläufig</Badge>}
      </div>

      {absprachen.length > 0 && (
        <section className="tag__abschnitt" aria-label="Absprachen am Tag">
          <h3>📌 {absprachen.length === 1 ? 'Absprache' : `${absprachen.length} Absprachen`}</h3>
          <ul className="tag__liste">{absprachen.map((n) => <li key={n.id}>{n.text}</li>)}</ul>
          <Link to={`/treffs/${treffId}/notizen?art=absprache`}>Zu den Absprachen</Link>
        </section>
      )}

      {weg.length > 0 && (
        <div className="list__meta" aria-label="Abwesend">
          {weg.map((a) => <Badge key={a.id} ton="danger">{a.person_id === ichId ? 'Du' : name(a.person_id)}: {ABWESENHEIT_TEXT[a.typ]}</Badge>)}
        </div>
      )}

      {imTeam && !verwaltung && (k.oeffnung || ichDrin) && (
        <section className="tag__abschnitt tag__ich" aria-label="Dein Dienst">
          <h3>Du</h3>
          <p>
            {ichDrin ? <strong>Du bist eingeteilt.</strong> : 'Du bist nicht eingeteilt.'}
            {w && w !== 'bestaetigt' && <> <Badge ton={WUNSCH_TON[w]}>{WUNSCH_LABEL[w]}</Badge></>}
          </p>
          <div className="row" style={{ gap: 'var(--space-2)' }}>
            {darfWuenschen(rolle, k, ichId, heute) && (
              <Button klein variante="primary" disabled={arbeitet}
                onClick={() => void aktion(async () => { await wuenscheDienst(treffId, k.datum); sendePush('wunsch_neu', treffId, { datum: k.datum }); })}>Dienst wünschen</Button>
            )}
            {rolle === 'betreuerin' && w === 'offen' && (
              <Button klein variante="ghost" disabled={arbeitet} onClick={() => void aktion(() => wunschZuruecknehmen(k.regulaer!.id, ichId))}>Wunsch zurücknehmen</Button>
            )}
            {kuenftig && !ichVerhindert && (
              <Button klein disabled={arbeitet} onClick={() => void aktion(async () => {
                await trageVerhinderungEin(treffId, ichId, k.datum);
                if (ichDrin) sendePush('verhindert', treffId, { datum: k.datum });           // die Treffleitung muss Ersatz finden
              }, verhinderungGeaendert)}>Kann an diesem Tag nicht</Button>
            )}
            {kuenftig && ichVerhindert && (
              <Button klein variante="ghost" disabled={arbeitet} onClick={() => void aktion(() => nimmVerhinderungZurueck(treffId, ichId, k.datum), verhinderungGeaendert)}>Kann doch</Button>
            )}
          </div>
          {ichDrin && ichVerhindert && <p className="field__hint">Die Treffleitung weiß Bescheid, dass du an diesem Tag nicht kannst.</p>}
        </section>
      )}

      {verwaltung && offene.length > 0 && (
        <section className="tag__abschnitt" aria-label="Offene Wünsche">
          <h3>Offene Wünsche</h3>
          <ul className="list">
            {offene.map((x) => (
              <li key={x.person_id} className="list__item">
                <div className="list__main"><strong>{name(x.person_id)}</strong> wünscht diesen Dienst</div>
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <Button klein variante="primary" disabled={arbeitet} aria-label={`Wunsch von ${name(x.person_id)} bestätigen`} onClick={() => entscheide(x.person_id, true)}>Bestätigen</Button>
                  <Button klein disabled={arbeitet} aria-label={`Wunsch von ${name(x.person_id)} ablehnen`} onClick={() => entscheide(x.person_id, false)}>Ablehnen</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {k.oeffnung && (
        <section className="tag__abschnitt" aria-label="Regulärer Dienst">
          <h3>Dienst{k.oeffnung ? ` ${oeffnungszeitText(k.oeffnung)}` : ''}</h3>
          {zuteilbar ? (
            <>
              {k.geschlossen && <p className="field__hint">Der Treff ist an diesem Tag zu – du kannst nur noch Personen herausnehmen.</p>}
              <ZuteilungsAuswahl team={team} gewaehlt={gewaehlt} aendere={setAuswahl} abwesend={weg} wuenschen={offene.map((x) => x.person_id)} />
              <div className="row">
                <Button variante="primary" laedt={arbeitet} disabled={hinzu.length + heraus.length === 0} onClick={() => void zuteilenSpeichern()}>Zuteilung speichern</Button>
                {auswahl && <Button onClick={() => setAuswahl(null)}>Zurücksetzen</Button>}
              </div>
            </>
          ) : chips(gespeichert)}
        </section>
      )}

      {k.sonder.map((s) => (
        <section key={s.id} className="tag__abschnitt tag__sonder" aria-label={`Sonderdienst ${s.bezeichnung ?? ''}`}>
          <h3>Sonderdienst: {s.bezeichnung}</h3>
          {dienstZeit(s) && <div className="list__meta"><span>{dienstZeit(s)} Uhr</span></div>}
          {chips(s.personen)}
          {verwaltung && <Button klein onClick={() => sonderdienst(s)}>Sonderdienst bearbeiten</Button>}
        </section>
      ))}

      <div className="row">
        {verwaltung && <Button klein onClick={() => sonderdienst(null)}>+ Sonderdienst an diesem Tag</Button>}
      </div>
    </Sheet>
  );
}
