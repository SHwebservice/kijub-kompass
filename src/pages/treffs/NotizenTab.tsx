import { useState, type FormEvent } from 'react';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { holeNamen } from '../../freizeiten/api';
import { formatDatum, heuteIso } from '../../freizeiten/logik';
import { holeTreffTeam, type TreffDetailDaten } from '../../treffs/api';
import { sortiereTreffTeam } from '../../treffs/logik';
import { aendereAufgabe, legeAufgabeAn, listeAufgaben, loescheAufgabe, setzeErledigt } from '../../tagesprotokoll/api';
import {
  ARTEN, artLabel, hatFaelligkeit, hatZustaendig, imArchiv, istUeberfaellig, leereAufgabe, MAX_ANTWORT, MAX_NOTIZ, sortiereAufgaben, validiereAufgabe, zaehleJeArt,
  type Aufgabe, type AufgabeArt, type AufgabeEingabe,
} from '../../tagesprotokoll/logik';
import { Alert, Badge, Button, Card, EmptyState, SelectField, Spinner, TextField } from '../../components/ui';

type Filter = 'alle' | AufgabeArt;
type Mitglied = { person_id: string; vorname: string; nachname: string; rolle: 'treffleitung' | 'betreuerin' };

interface FormProps {
  anfang: AufgabeEingabe;
  team: Mitglied[];
  knopf: string;
  artWaehlbar: boolean;
  speichern: (e: AufgabeEingabe) => Promise<void>;
  abbrechen?: () => void;
}

/** Art, Text und – je nach Art – Fälligkeit und Zuständigkeit. */
function AufgabeFormular({ anfang, team, knopf, artWaehlbar, speichern, abbrechen }: FormProps) {
  const [e, setE] = useState(anfang);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function absenden(ev: FormEvent) {
    ev.preventDefault();
    const f = validiereAufgabe(e);
    if (f.text) { setFehler(f.text); return; }
    setFehler(null); setArbeitet(true);
    try { await speichern(e); if (!abbrechen) setE({ ...leereAufgabe(e.art) }); }
    catch { /* Die Seite zeigt den Fehler; die Eingaben bleiben stehen. */ } finally { setArbeitet(false); }
  }

  return (
    <form onSubmit={(ev) => void absenden(ev)} noValidate className="stack">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        {artWaehlbar && (
          <SelectField label="Art" value={e.art} onChange={(ev) => setE({ ...e, art: ev.target.value as AufgabeArt })}>
            {ARTEN.map((a) => <option key={a.art} value={a.art}>{a.label}</option>)}
          </SelectField>
        )}
        <div style={{ flex: 1, minWidth: '12rem' }}>
          <TextField label={e.art === 'einkauf' ? 'Was muss gekauft werden?' : e.art === 'frage' ? 'Welche Frage ist offen?' : 'Notiz'} value={e.text} maxLength={MAX_NOTIZ + 1}
            onChange={(ev) => setE({ ...e, text: ev.target.value })} fehler={fehler} />
        </div>
      </div>
      {(hatFaelligkeit(e.art) || hatZustaendig(e.art)) && (
        <div className="row" style={{ alignItems: 'flex-end' }}>
          {hatFaelligkeit(e.art) && <TextField label="Bis wann? (optional)" type="date" value={e.faellig_am} onChange={(ev) => setE({ ...e, faellig_am: ev.target.value })} />}
          {hatZustaendig(e.art) && (
            <SelectField label="Zuständig (optional)" value={e.zustaendig} onChange={(ev) => setE({ ...e, zustaendig: ev.target.value })}>
              <option value="">Niemand bestimmt</option>
              {sortiereTreffTeam(team).map((m) => <option key={m.person_id} value={m.person_id}>{m.vorname} {m.nachname}</option>)}
            </SelectField>
          )}
        </div>
      )}
      <div className="row">
        <Button variante="primary" type="submit" laedt={arbeitet}>{knopf}</Button>
        {abbrechen && <Button onClick={abbrechen}>Abbrechen</Button>}
      </div>
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
        <AufgabeFormular anfang={{ art: a.art, text: a.text, faellig_am: a.faellig_am ?? '', zustaendig: a.zustaendig ?? '' }} team={team} knopf="Änderung speichern" artWaehlbar
          speichern={async (e) => { await lauf(() => aendereAufgabe(a.id, { art: e.art, text: e.text, faellig_am: hatFaelligkeit(e.art) ? e.faellig_am : '', zustaendig: hatZustaendig(e.art) ? e.zustaendig : '' })); setModus('ansicht'); }}
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

/** Notizen und Listen des Treffs: To-dos, Einkauf, offene Fragen. Sie bleiben, bis jemand sie erledigt; das ganze Team darf alles. */
export function NotizenTab({ treff: t }: { treff: TreffDetailDaten }) {
  const heute = heuteIso();
  const aufgaben = useLaden(() => listeAufgaben(t.id), `aufgaben-${t.id}`);
  const team = useLaden(() => holeTreffTeam(t.id), `aufgaben-team-${t.id}`);
  useLive(['treff_aufgaben'], () => aufgaben.neuLaden());
  const ids = [...new Set((aufgaben.daten ?? []).flatMap((a) => [a.erstellt_von, a.erledigt_von, a.zustaendig]).filter((x): x is string => !!x))].sort();
  const namenL = useLaden(() => holeNamen(ids), `aufgaben-namen-${t.id}-${ids.join(',')}`);
  const [filter, setFilter] = useState<Filter>('alle');
  const [fehler, setFehler] = useState<string | null>(null);

  const alle = aufgaben.daten ?? [];
  const z = zaehleJeArt(alle);
  const sichtbar = alle.filter((a) => filter === 'alle' || a.art === filter);
  const offene = sortiereAufgaben(sichtbar.filter((a) => !a.erledigt));
  const erledigte = sortiereAufgaben(sichtbar.filter((a) => a.erledigt && !imArchiv(a, heute)));
  const archiviert = sichtbar.filter((a) => imArchiv(a, heute)).length;
  const mitglieder = (team.daten ?? []) as Mitglied[];

  async function lauf(aktion: () => Promise<void>): Promise<void> {
    setFehler(null);
    try { await aktion(); aufgaben.neuLaden(); } catch (e) { setFehler(fehlerText(e)); throw e; }
  }

  const karte = (a: Aufgabe) => <AufgabeZeile key={a.id} a={a} heute={heute} team={mitglieder} namen={namenL.daten ?? null} lauf={lauf} />;

  return (
    <div className="stack">
      <Card>
        <h2>Neue Notiz</h2>
        <AufgabeFormular key={filter} anfang={leereAufgabe(filter === 'alle' ? 'todo' : filter)} team={mitglieder} knopf="Hinzufügen" artWaehlbar
          speichern={(e) => lauf(() => legeAufgabeAn(t.id, e))} />
      </Card>

      {fehler && <Alert ton="error">{fehler}</Alert>}
      {aufgaben.fehler && <Alert ton="error">{aufgaben.fehler}</Alert>}

      <Card>
        <nav className="row" aria-label="Notizen filtern">
          <Button klein variante={filter === 'alle' ? 'primary' : 'standard'} aria-pressed={filter === 'alle'} onClick={() => setFilter('alle')}>Alle ({Object.values(z).reduce((s, n) => s + n, 0)})</Button>
          {ARTEN.map((x) => (
            <Button key={x.art} klein variante={filter === x.art ? 'primary' : 'standard'} aria-pressed={filter === x.art} onClick={() => setFilter(x.art)}>{x.icon} {x.mehrzahl} ({z[x.art]})</Button>
          ))}
        </nav>

        {aufgaben.laedt && <Spinner />}
        {!aufgaben.laedt && offene.length === 0 && <EmptyState icon="🎉" titel="Nichts offen">Hier ist alles erledigt.</EmptyState>}
        <ul className="list" aria-label="Offene Notizen" style={{ marginTop: 'var(--space-3)' }}>{offene.map(karte)}</ul>

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
