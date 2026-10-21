import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { sendePush } from '../../mitteilungen/senden';
import { holeNamen } from '../../freizeiten/api';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import { holeTreffTeam, legeTreffAbspracheAn, listeTreffAbsprachen, type TreffDetailDaten } from '../../treffs/api';
import { darfTreffAbspracheBestaetigen, darfTreffVerwalten, sortiereTreffTeam } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { AbspracheFelder, AbspracheZeile, istVergangen, pruefeAbsprache } from './TreffAbsprache';
import { aendereAufgabe, legeAufgabeAn, listeAufgaben, loescheAufgabe, setzeErledigt } from '../../tagesprotokoll/api';
import {
  ARTEN, artLabel, hatFaelligkeit, hatZustaendig, imArchiv, istUeberfaellig, leereAufgabe, MAX_ANTWORT, MAX_NOTIZ, sortiereAufgaben, validiereAufgabe, zaehleJeArt,
  type Aufgabe, type AufgabeArt, type AufgabeEingabe,
} from '../../tagesprotokoll/logik';
import { Alert, Badge, Button, Card, EmptyState, SelectField, Spinner, TextField } from '../../components/ui';

/** Neben den Arten der Notizen gibt es „Absprache“: sie liegt bei den Absprachen (Tabelle `notizen`) und gilt optional für einen Tag. */
type NotizArt = AufgabeArt | 'absprache';
type Filter = 'alle' | NotizArt;
type Eingabe = Omit<AufgabeEingabe, 'art'> & { art: NotizArt; datum: string };
type Mitglied = { person_id: string; vorname: string; nachname: string; rolle: 'treffleitung' | 'betreuerin' };

const istFilter = (x: string | null): x is Filter => x === 'alle' || x === 'absprache' || ARTEN.some((a) => a.art === x);
const leer = (art: NotizArt = 'todo'): Eingabe => ({ ...leereAufgabe(art === 'absprache' ? 'todo' : art), art, datum: '' });

interface FormProps {
  anfang: Eingabe;
  team: Mitglied[];
  knopf: string;
  artWaehlbar: boolean;
  /** Nur Treffleitung und Koordination legen Absprachen an. */
  absprache: boolean;
  speichern: (e: Eingabe) => Promise<void>;
  abbrechen?: () => void;
}

/** Art, Text und – je nach Art – Fälligkeit und Zuständigkeit bzw. der Tag einer Absprache. */
function AufgabeFormular({ anfang, team, knopf, artWaehlbar, absprache, speichern, abbrechen }: FormProps) {
  const [e, setE] = useState(anfang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function absenden(ev: FormEvent) {
    ev.preventDefault();
    const f = e.art === 'absprache' ? pruefeAbsprache(e.text) : (validiereAufgabe({ ...e, art: e.art }).text ?? null);
    if (f) { setFehler(f); return; }
    setFehler(null); setArbeitet(true);
    try { await speichern(e); if (!abbrechen) setE(leer(e.art)); }
    catch { /* Die Seite zeigt den Fehler; die Eingaben bleiben stehen. */ } finally { setArbeitet(false); }
  }

  const artWahl = artWaehlbar && (
    <SelectField label="Art" value={e.art} onChange={(ev) => { setFehler(null); setE({ ...e, art: ev.target.value as NotizArt }); }}>
      {ARTEN.map((a) => <option key={a.art} value={a.art}>{a.label}</option>)}
      {absprache && <option value="absprache">Absprache</option>}
    </SelectField>
  );
  const knoepfe = (
    <div className="row">
      <Button variante="primary" type="submit" laedt={arbeitet}>{knopf}</Button>
      {abbrechen && <Button onClick={abbrechen}>Abbrechen</Button>}
    </div>
  );

  if (e.art === 'absprache') {
    return (
      <form onSubmit={(ev) => void absenden(ev)} noValidate className="stack">
        {artWahl && <div className="row">{artWahl}</div>}
        <AbspracheFelder text={e.text} datum={e.datum} fehler={fehler} setText={(text) => setE({ ...e, text })} setDatum={(datum) => setE({ ...e, datum })} />
        <p className="field__hint">Alle im Treff bekommen eine Mitteilung und bestätigen die Absprache. Mit Tag erscheint sie auch im Dienstplan.</p>
        {knoepfe}
      </form>
    );
  }

  const art = e.art;
  return (
    <form onSubmit={(ev) => void absenden(ev)} noValidate className="stack">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {artWahl}
        <div style={{ flex: 1, minWidth: '12rem' }}>
          <TextField label={art === 'einkauf' ? 'Was muss gekauft werden?' : art === 'frage' ? 'Welche Frage ist offen?' : 'Notiz'} value={e.text} maxLength={MAX_NOTIZ + 1}
            onChange={(ev) => setE({ ...e, text: ev.target.value })} fehler={fehler} />
        </div>
      </div>
      {(hatFaelligkeit(art) || hatZustaendig(art)) && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {hatFaelligkeit(art) && <TextField label="Bis wann? (optional)" type="date" value={e.faellig_am} onChange={(ev) => setE({ ...e, faellig_am: ev.target.value })} />}
          {hatZustaendig(art) && (
            <SelectField label="Zuständig (optional)" value={e.zustaendig} onChange={(ev) => setE({ ...e, zustaendig: ev.target.value })}>
              <option value="">Niemand bestimmt</option>
              {sortiereTreffTeam(team).map((m) => <option key={m.person_id} value={m.person_id}>{m.vorname} {m.nachname}</option>)}
            </SelectField>
          )}
        </div>
      )}
      {knoepfe}
    </form>
  );
}

interface ZeilenProps {
  a: Aufgabe;
  heute: string;
  team: Mitglied[];
  namen: Record<string, string> | null;
  lauf: (aktion: () => Promise<void>) => Promise<void>;
}

function AufgabeZeile({ a, heute, team, namen, lauf }: ZeilenProps) {
  const [modus, setModus] = useState<'ansicht' | 'bearbeiten' | 'antworten'>('ansicht');
  const [antwort, setAntwort] = useState(a.antwort ?? '');
  const ueber = istUeberfaellig(a, heute);
  const name = (id: string | null) => (id && namen ? (namen[id] ?? 'Unbekannt') : null);      // solange die Namen laden, nichts anzeigen
  const gross = a.art === 'einkauf';

  if (modus === 'bearbeiten') {
    return (
      <li className="list__item" style={{ display: 'block' }}>
        <AufgabeFormular anfang={{ art: a.art, text: a.text, faellig_am: a.faellig_am ?? '', zustaendig: a.zustaendig ?? '', datum: '' }} team={team} knopf="Änderung speichern"
          artWaehlbar absprache={false}
          speichern={async (e) => {
            if (e.art === 'absprache') return;      // eine Notiz wird beim Bearbeiten nicht zur Absprache (die Auswahl fehlt dort)
            const art = e.art;
            await lauf(() => aendereAufgabe(a.id, { art, text: e.text, faellig_am: hatFaelligkeit(art) ? e.faellig_am : '', zustaendig: hatZustaendig(art) ? e.zustaendig : '' }));
            setModus('ansicht');
          }}
          abbrechen={() => setModus('ansicht')} />
      </li>
    );
  }

  return (
    <li className="list__item" style={{ alignItems: 'flex-start' }}>
      <label className={`aufgabe__haken${gross ? ' aufgabe__haken--gross' : ''}`}>
        <input type="checkbox" checked={a.erledigt} aria-label={`${a.text} – erledigt`}
          onChange={(e) => {
            // Offene Fragen werden mit einer Antwort erledigt
            if (a.art === 'frage' && e.target.checked && !a.antwort) { setModus('antworten'); return; }
            void lauf(() => setzeErledigt(a.id, e.target.checked)).catch(() => undefined);
          }} />
      </label>
      <div className="list__main" style={{ flex: 1, whiteSpace: 'normal' }}>
        <div style={a.erledigt ? { textDecoration: 'line-through', color: 'var(--text-muted)' } : undefined}>{a.text}</div>
        <div className="list__meta">
          {a.art !== 'todo' && <Badge>{artLabel(a.art)}</Badge>}
          {a.faellig_am && <Badge ton={ueber ? 'danger' : 'neutral'}>{ueber ? 'Überfällig: ' : 'Bis '}{formatDatum(a.faellig_am)}</Badge>}
          {a.zustaendig && name(a.zustaendig) && <span>zuständig: {name(a.zustaendig)}</span>}
          {a.erledigt && <span>erledigt{name(a.erledigt_von) ? ` von ${name(a.erledigt_von)}` : ''}{a.erledigt_am ? ` am ${formatDatum(a.erledigt_am.slice(0, 10))}` : ''}</span>}
          {!a.erledigt && name(a.erstellt_von) && <span>von {name(a.erstellt_von)}</span>}
        </div>
        {a.art === 'frage' && a.antwort && <div className="aufgabe__antwort"><strong>Antwort:</strong> {a.antwort}</div>}
        {modus === 'antworten' && (
          <div className="field" style={{ marginTop: 'var(--space-2)' }}>
            <label className="field__label" htmlFor={`antwort-${a.id}`}>Antwort</label>
            <textarea id={`antwort-${a.id}`} className="input" rows={2} value={antwort} maxLength={MAX_ANTWORT + 1} onChange={(e) => setAntwort(e.target.value)} style={{ padding: 'var(--space-3)' }} />
            <div className="row">
              <Button variante="primary" klein onClick={() => void lauf(() => setzeErledigt(a.id, true, antwort)).then(() => setModus('ansicht')).catch(() => undefined)}>Mit Antwort erledigen</Button>
              <Button klein onClick={() => setModus('ansicht')}>Abbrechen</Button>
            </div>
          </div>
        )}
      </div>
      {modus === 'ansicht' && (
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          {a.art === 'frage' && !a.erledigt && <Button klein onClick={() => setModus('antworten')}>Antworten</Button>}
          <Button klein variante="ghost" onClick={() => setModus('bearbeiten')} aria-label={`${a.text} bearbeiten`}>Bearbeiten</Button>
          <Button klein variante="ghost" aria-label={`${a.text} löschen`}
            onClick={() => { if (window.confirm('Diese Notiz löschen?')) void lauf(() => loescheAufgabe(a.id)).catch(() => undefined); }}>Löschen</Button>
        </div>
      )}
    </li>
  );
}

/**
 * Notizen und Listen des Treffs: To-dos, Einkauf, offene Fragen und Absprachen. Notizen bleiben, bis jemand sie erledigt; das ganze Team darf alles.
 * Absprachen schreibt die Treffleitung (und die Koordination), alle im Treff bestätigen sie; mit Tag gelten sie nur für diesen Tag.
 */
export function NotizenTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const { ich } = useAuth();
  const heute = heuteIso();
  const aufgaben = useLaden(() => listeAufgaben(t.id), `aufgaben-${t.id}`);
  const absprachen = useLaden(() => listeTreffAbsprachen(t.id), `treffabsprachen-${t.id}`);
  const team = useLaden(() => holeTreffTeam(t.id), `aufgaben-team-${t.id}`);
  useLive(['treff_aufgaben'], () => aufgaben.neuLaden());
  useLive(['notizen', 'notiz_bestaetigungen'], () => absprachen.neuLaden());
  const ids = [...new Set([
    ...(aufgaben.daten ?? []).flatMap((a) => [a.erstellt_von, a.erledigt_von, a.zustaendig]),
    ...(absprachen.daten ?? []).flatMap((n) => [n.erstellt_von, ...n.bestaetigungen.map((b) => b.person_id)]),
  ].filter((x): x is string => !!x))].sort();
  const namenL = useLaden(() => holeNamen(ids), `aufgaben-namen-${t.id}-${ids.join(',')}`);
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() => { const a = params.get('art'); return istFilter(a) ? a : 'alle'; });
  const [fehler, setFehler] = useState<string | null>(null);
  if (!ich) return null;

  const schreibtAbsprachen = darfTreffVerwalten(rolle);
  const alle = aufgaben.daten ?? [];
  const z = zaehleJeArt(alle);
  const sichtbar = filter === 'absprache' ? [] : alle.filter((a) => filter === 'alle' || a.art === filter);
  const offene = sortiereAufgaben(sichtbar.filter((a) => !a.erledigt));
  const erledigte = sortiereAufgaben(sichtbar.filter((a) => a.erledigt && !imArchiv(a, heute)));
  const archiviert = sichtbar.filter((a) => imArchiv(a, heute)).length;
  const mitglieder = (team.daten ?? []) as Mitglied[];
  const zeigeAbsprachen = filter === 'alle' || filter === 'absprache';
  const geltende = (absprachen.daten ?? []).filter((n) => !istVergangen(n, heute));
  const vergangene = (absprachen.daten ?? []).filter((n) => istVergangen(n, heute));

  async function lauf(aktion: () => Promise<void>): Promise<void> {
    setFehler(null);
    try { await aktion(); aufgaben.neuLaden(); absprachen.neuLaden(); } catch (e) { setFehler(fehlerText(e)); throw e; }
  }

  async function anlegen(e: Eingabe): Promise<void> {
    if (e.art === 'absprache') {
      const datum = e.datum || null;
      let id = '';
      await lauf(async () => { id = await legeTreffAbspracheAn(t.id, { geltung: datum ? 'tag' : 'gesamt', datum, text: e.text }); });
      if (id) sendePush('absprache_treff', id);
      return;
    }
    const art = e.art;
    await lauf(() => legeAufgabeAn(t.id, { art, text: e.text, faellig_am: e.faellig_am, zustaendig: e.zustaendig }));
  }

  const karte = (a: Aufgabe) => <AufgabeZeile key={a.id} a={a} heute={heute} team={mitglieder} namen={namenL.daten ?? null} lauf={lauf} />;
  const abspracheKarte = (n: (typeof geltende)[number]) => (
    <AbspracheZeile key={n.id} n={n} ichId={ich.id} namen={namenL.daten ?? {}} schreiben={schreibtAbsprachen} bestaetigen={darfTreffAbspracheBestaetigen(rolle)} lauf={lauf} />
  );
  const laedt = aufgaben.laedt || absprachen.laedt;
  const nichts = offene.length === 0 && (!zeigeAbsprachen || geltende.length === 0);

  return (
    <div className="stack">
      <Card>
        <h2>Neue Notiz</h2>
        <AufgabeFormular key={filter} anfang={leer(filter === 'alle' || (filter === 'absprache' && !schreibtAbsprachen) ? 'todo' : filter)} team={mitglieder} knopf="Hinzufügen"
          artWaehlbar absprache={schreibtAbsprachen} speichern={anlegen} />
      </Card>

      {fehler && <Alert ton="error">{fehler}</Alert>}
      {(aufgaben.fehler || absprachen.fehler) && <Alert ton="error">{aufgaben.fehler ?? absprachen.fehler}</Alert>}

      <Card>
        <nav className="row" aria-label="Notizen filtern">
          <Button klein variante={filter === 'alle' ? 'primary' : 'standard'} aria-pressed={filter === 'alle'} onClick={() => setFilter('alle')}>Alle ({Object.values(z).reduce((s, n) => s + n, 0) + geltende.length})</Button>
          {ARTEN.map((x) => (
            <Button key={x.art} klein variante={filter === x.art ? 'primary' : 'standard'} aria-pressed={filter === x.art} onClick={() => setFilter(x.art)}>{x.icon} {x.mehrzahl} ({z[x.art]})</Button>
          ))}
          <Button klein variante={filter === 'absprache' ? 'primary' : 'standard'} aria-pressed={filter === 'absprache'} onClick={() => setFilter('absprache')}>🤝 Absprachen ({geltende.length})</Button>
        </nav>

        {laedt && <Spinner />}
        {!laedt && nichts && (filter === 'absprache'
          ? <EmptyState icon="🤝" titel="Keine geltenden Absprachen" />
          : <EmptyState icon="🎉" titel="Nichts offen">Hier ist alles erledigt.</EmptyState>)}
        {zeigeAbsprachen && geltende.length > 0 && <ul className="list" aria-label="Absprachen" style={{ marginTop: 'var(--space-3)' }}>{geltende.map(abspracheKarte)}</ul>}
        {filter !== 'absprache' && <ul className="list" aria-label="Offene Notizen" style={{ marginTop: 'var(--space-3)' }}>{offene.map(karte)}</ul>}
        {filter === 'absprache' && vergangene.length > 0 && (
          <details style={{ marginTop: 'var(--space-4)' }}>
            <summary>Vergangene Absprachen ({vergangene.length})</summary>
            <ul className="list" aria-label="Vergangene Absprachen" style={{ marginTop: 'var(--space-2)' }}>{vergangene.map(abspracheKarte)}</ul>
          </details>
        )}

        {erledigte.length > 0 && (
          <details style={{ marginTop: 'var(--space-4)' }}>
            <summary>Erledigt ({erledigte.length})</summary>
            <ul className="list" aria-label="Erledigte Notizen" style={{ marginTop: 'var(--space-2)' }}>{erledigte.map(karte)}</ul>
          </details>
        )}
        {archiviert > 0 && <p className="field__hint">{archiviert} ältere erledigte {archiviert === 1 ? 'Eintrag ist' : 'Einträge sind'} ausgeblendet (erledigt vor mehr als 30 Tagen).</p>}
      </Card>
    </div>
  );
}
