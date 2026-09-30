import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLaden } from '../lib/laden';
import { fehlerText } from '../lib/fehler';
import { heuteIso } from '../freizeiten/logik';
import { listeFreizeiten } from '../freizeiten/api';
import { listeTreffs } from '../treffs/api';
import { bestaetigeTreffEntfernen } from '../zuordnung/entfernen';
import { listePersonenVoll, setzeKoordination, type Bereich, type PersonZeile } from '../zuordnung/api';
import { useZuordnungsdaten } from '../zuordnung/daten';
import {
  filterePersonen, indexiere, konflikteFuer, konfliktText, personName, verfuegbareJahre, waehleFreizeiten, zusammenfassung,
  type FreizeitRolle, type FreizeitSpalte, type TreffRolle, type TreffSpalte, type Zeitraum,
} from '../zuordnung/logik';
import { ZuordnungsTabelle } from './zuordnung/ZuordnungsTabelle';
import { ZuordnungSheet } from './zuordnung/ZuordnungSheet';
import { useAuth } from '../lib/auth-kontext';
import { PersonEntfernen, type Modus, type Uebersicht } from './PersonEntfernen';
import { Alert, EmptyState, PageHeader, Spinner } from '../components/ui';
import { Filterleiste, type Ansicht } from './personen/Filterleiste';
import { PersonAnlegen, type NeuePerson } from './personen/PersonAnlegen';
import { PersonenListe } from './personen/PersonenListe';
import { StartpasswortAnzeige, type Startpasswort } from './personen/Startpasswort';

export { zugangsStatus } from './personen/Startpasswort';

/** Koordination: Personen anlegen, Zugang einrichten, Passwort zurücksetzen.
 *  Die volle Personalverwaltung folgt in Phase 3. */
export function Personen() {
  const { ich } = useAuth();
  const [entfernen, setEntfernen] = useState<PersonZeile | null>(null);
  const [zeilen, setZeilen] = useState<PersonZeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  const [arbeitet, setArbeitet] = useState<string | null>(null);
  const [startpasswort, setStartpasswort] = useState<Startpasswort | null>(null);
  const [version, setVersion] = useState(0);
  const neuLaden = () => setVersion((v) => v + 1);

  // Zuordnung zu Freizeiten und Treffs (Tabellenansicht und Fenster je Person)
  const [ansicht, setAnsicht] = useState<Ansicht>('liste');
  const [zeitraum, setZeitraum] = useState<Zeitraum>('aktuell');
  const [kategorie, setKategorie] = useState('');
  const [mitDeaktivierten, setMitDeaktivierten] = useState(false);
  const [zuordnungPerson, setZuordnungPerson] = useState<PersonZeile | null>(null);
  const [zuordnungFehler, setZuordnungFehler] = useState<string | null>(null);
  const [zuordnungHinweis, setZuordnungHinweis] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const heute = heuteIso();
  const zd = useZuordnungsdaten();
  const freizeitenL = useLaden(listeFreizeiten, 'personen-freizeiten');
  const treffsL = useLaden(listeTreffs, 'personen-treffs');
  const freizeiten: FreizeitSpalte[] = freizeitenL.daten ?? [];
  const treffs: TreffSpalte[] = treffsL.daten ?? [];
  const z = indexiere(zd.freizeitTeams, zd.treffTeams);
  const spalten = waehleFreizeiten(freizeiten, zeitraum, heute);
  const jahre = verfuegbareJahre(freizeiten);

  async function zuordnungAendern(aktion: () => Promise<void>, hinweis?: () => string | null) {
    setZuordnungFehler(null); setZuordnungHinweis(null); setSpeichert(true);
    try { await aktion(); setZuordnungHinweis(hinweis?.() ?? null); } catch (e) { setZuordnungFehler(fehlerText(e, 'Die Zuordnung konnte nicht gespeichert werden.')); } finally { setSpeichert(false); }
  }
  const aendereFreizeit = (p: PersonZeile, f: FreizeitSpalte, rolle: FreizeitRolle | null) => void zuordnungAendern(
    () => zd.setzeFreizeit(f.id, p.id, rolle),
    () => {
      const k = rolle ? konflikteFuer(p.id, f, freizeiten, z) : [];
      return k.length ? `Achtung: ${personName(p)} ist zur selben Zeit auch eingeteilt in ${k.map(konfliktText).join(', ')}.` : null;
    });
  const aendereKoordination = (p: PersonZeile, bereich: Bereich, an: boolean) => void zuordnungAendern(async () => { await setzeKoordination(p.id, bereich, an); neuLaden(); });
  const aendereTreff = (p: PersonZeile, t: TreffSpalte, rolle: TreffRolle | null) => void zuordnungAendern(async () => {
    // Beim Entfernen aus einem Treff vorher warnen, wenn die Person noch in künftigen Diensten steht
    if (rolle === null && z.treffRolle(t.id, p.id) !== null && !(await bestaetigeTreffEntfernen(t.id, t.name, p.id, personName(p), heute))) return;
    await zd.setzeTreff(t.id, p.id, rolle);
  });

  useEffect(() => {
    let aktuell = true;
    void (async () => {
      try {
        const daten = await listePersonenVoll();
        if (aktuell) setZeilen(daten);
      } catch {
        if (aktuell) setFehler('Personen konnten nicht geladen werden.');
      }
    })();
    return () => { aktuell = false; };
  }, [version]);

  /** Legt die Person an; true = geklappt (das Formular leert sich). */
  async function anlegen(neu: NeuePerson): Promise<boolean> {
    setFehler(null); setMeldung(null);
    const { error } = await supabase.from('personen').insert({
      vorname: neu.vorname.trim(), nachname: neu.nachname.trim(), mail: neu.mail.trim(), kategorie: neu.kategorie,
    });
    if (error) {
      setFehler(error.code === '23505' ? 'Diese Mail-Adresse gibt es schon.' : 'Person konnte nicht angelegt werden.');
      return false;
    }
    setMeldung('Person angelegt. Als Nächstes kannst du den Zugang einrichten.');
    neuLaden();
    return true;
  }

  async function zugangEinrichten(p: PersonZeile) {
    const hatZugang = Boolean(p.auth_user_id);
    if (hatZugang && !window.confirm(`Neues Startpasswort für ${p.vorname} ${p.nachname} erzeugen? Das bisherige Passwort wird ungültig.`)) return;
    setArbeitet(p.id); setFehler(null); setMeldung(null); setStartpasswort(null);
    const { data, error } = await supabase.functions.invoke('konto-passwort', { body: { person_id: p.id } });
    setArbeitet(null);
    if (error || !data?.passwort) {
      setFehler(data?.fehler ?? 'Zugang konnte nicht eingerichtet werden. Ist die Funktion „konto-passwort" bereitgestellt?');
      return;
    }
    setStartpasswort({ name: `${p.vorname} ${p.nachname}`, mail: p.mail, passwort: data.passwort, neu: Boolean(data.neu) });
    neuLaden();
  }

  const ladeUebersicht = useCallback(async (): Promise<Uebersicht> => {
    if (!entfernen) throw new Error('keine Person');
    const { data, error } = await supabase.rpc('fn_person_datenuebersicht', { p_id: entfernen.id });
    if (error) throw error;
    return data as Uebersicht;
  }, [entfernen]);

  async function entfernenAusfuehren(modus: Modus): Promise<string | null> {
    if (!entfernen) return null;
    const p = entfernen;
    const name = `${p.vorname} ${p.nachname}`;
    if (modus === 'deaktivieren') {
      const { error } = await supabase.from('personen').update({ aktiv: false }).eq('id', p.id);
      if (error) return /letzte aktive Koordination/.test(error.message)
        ? 'Die letzte aktive Koordination eines Bereichs kann nicht deaktiviert werden.' : 'Deaktivieren hat nicht geklappt.';
    } else {
      const { data, error } = await supabase.functions.invoke('konto-entfernen', { body: { person_id: p.id, modus } });
      if (error || !data?.ok) {
        return data?.fehler ?? 'Das Entfernen hat nicht geklappt. Ist die Funktion „konto-entfernen" bereitgestellt?';
      }
    }
    setEntfernen(null);
    setMeldung(modus === 'person' ? `${name} wurde endgültig gelöscht.`
      : modus === 'zugang' ? `Der Zugang von ${name} wurde entzogen.` : `${name} wurde deaktiviert.`);
    neuLaden();
    return null;
  }

  async function aktivieren(p: PersonZeile) {
    setFehler(null); setMeldung(null);
    const { error } = await supabase.from('personen').update({ aktiv: true }).eq('id', p.id);
    if (error) { setFehler('Aktivieren hat nicht geklappt.'); return; }
    setMeldung(`${p.vorname} ${p.nachname} ist wieder aktiv.`);
    neuLaden();
  }

  // Die Listenansicht zeigt wie bisher alle Personen; die Zuordnungstabelle lässt Deaktivierte standardmäßig weg
  const gefiltert = filterePersonen(zeilen ?? [], { suche, kategorie, mitDeaktivierten: ansicht === 'liste' || mitDeaktivierten });
  const ansichtDaten = { spalten, treffs, freizeitTeams: zd.freizeitTeams, z, aendereFreizeit, aendereTreff, gesperrt: speichert || zd.laedt };

  return (
    <>
      <PageHeader titel="Personen" />
      {fehler && <Alert ton="error">{fehler}</Alert>}
      {meldung && <Alert ton="success">{meldung}</Alert>}
      {entfernen && (
        <PersonEntfernen person={entfernen} ladeUebersicht={ladeUebersicht} ausfuehren={entfernenAusfuehren}
          schliessen={() => setEntfernen(null)} />
      )}
      {startpasswort && <StartpasswortAnzeige s={startpasswort} schliessen={() => setStartpasswort(null)} />}

      <PersonAnlegen anlegen={anlegen} />

      <div style={{ marginTop: 'var(--space-5)' }}>
        <Filterleiste ansicht={ansicht} setzeAnsicht={setAnsicht} suche={suche} setzeSuche={setSuche} kategorie={kategorie} setzeKategorie={setKategorie}
          zeitraum={zeitraum} setzeZeitraum={setZeitraum} jahre={jahre} mitDeaktivierten={mitDeaktivierten} setzeMitDeaktivierten={setMitDeaktivierten} />
        {(zuordnungFehler ?? zd.fehler ?? freizeitenL.fehler ?? treffsL.fehler) && <Alert ton="error">{zuordnungFehler ?? zd.fehler ?? freizeitenL.fehler ?? treffsL.fehler}</Alert>}
        {zuordnungHinweis && <Alert ton="warning">{zuordnungHinweis}</Alert>}
        {zeilen === null && !fehler && <Spinner />}
        {zeilen !== null && gefiltert.length === 0 && <EmptyState titel="Keine Personen gefunden" />}
        {ansicht === 'zuordnung' && gefiltert.length > 0 && (
          spalten.length === 0 && treffs.length === 0 && !freizeitenL.laedt && !treffsL.laedt
            ? <p>Für diesen Zeitraum gibt es keine Freizeiten und noch keine Treffs.</p>
            : <ZuordnungsTabelle personen={gefiltert} {...ansichtDaten} oeffne={setZuordnungPerson} />
        )}
        {ansicht === 'liste' && (
          <PersonenListe personen={gefiltert} zusammenfassung={(p) => zusammenfassung(p.id, freizeiten, z, heute)} ichId={ich?.id} arbeitet={arbeitet}
            oeffneZuordnung={setZuordnungPerson} zugangEinrichten={(p) => void zugangEinrichten(p)} aktivieren={(p) => void aktivieren(p)}
            entfernen={(p) => { setStartpasswort(null); setEntfernen(p); }} />
        )}
      </div>
      {zuordnungPerson && (
        <ZuordnungSheet person={zeilen?.find((x) => x.id === zuordnungPerson.id) ?? zuordnungPerson} freizeiten={freizeiten} heute={heute}
          {...ansichtDaten} aendereKoordination={aendereKoordination} schliessen={() => setZuordnungPerson(null)} />
      )}
    </>
  );
}
