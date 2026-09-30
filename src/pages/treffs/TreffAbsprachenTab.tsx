import { useState, type FormEvent } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import { aendereNotiz, bestaetige, bestaetigungZurueck, holeNamen, loescheNotiz } from '../../freizeiten/api';
import { formatDatum } from '../../freizeiten/logik';
import { istBestaetigtVon, namenListe, type Notiz } from '../../freizeiten/notizen';
import { legeTreffAbspracheAn, listeTreffAbsprachen, type TreffDetailDaten } from '../../treffs/api';
import { darfTreffAbspracheBestaetigen, darfTreffVerwalten } from '../../treffs/logik';
import type { RolleInTreff } from '../../lib/rollen';
import { Alert, Badge, Button, Card, EmptyState, Spinner, TextField } from '../../components/ui';

const datumZeit = (iso: string) => `${formatDatum(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

interface FormProps {
  beschriftung: string;
  anfang?: { text: string; datum: string | null };
  speichern: (text: string, datum: string | null) => Promise<void>;
  abbrechen?: () => void;
}

/** Text und – optional – ein Datum, an das die Absprache gekoppelt ist. */
function AbspracheFormular({ beschriftung, anfang, speichern, abbrechen }: FormProps) {
  const [text, setText] = useState(anfang?.text ?? '');
  const [datum, setDatum] = useState(anfang?.datum ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setFehler('Bitte einen Text eingeben.'); return; }
    if (text.trim().length > 2000) { setFehler('Der Text darf höchstens 2000 Zeichen lang sein.'); return; }
    setFehler(null); setArbeitet(true);
    try {
      await speichern(text, datum || null);
      if (!anfang) { setText(''); setDatum(''); }
    } catch { /* Der Fehler wird von der Seite angezeigt; die Eingaben bleiben stehen. */ } finally { setArbeitet(false); }
  }

  return (
    <form onSubmit={(e) => void absenden(e)} noValidate>
      <div className="field">
        <label className="field__label" htmlFor={`abspr-${beschriftung}`}>{beschriftung}</label>
        <textarea id={`abspr-${beschriftung}`} className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          aria-invalid={fehler ? true : undefined} style={{ padding: 'var(--space-3)' }} />
        {fehler && <span className="field__error">{fehler}</span>}
      </div>
      <TextField label="Gilt für einen bestimmten Tag (optional)" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
      <div className="row">
        <Button variante="primary" type="submit" laedt={arbeitet}>{anfang ? 'Änderung speichern' : 'Speichern'}</Button>
        {abbrechen && <Button onClick={abbrechen}>Abbrechen</Button>}
      </div>
    </form>
  );
}

/** Absprachen des Treffs: die Treffleitung schreibt sie, alle im Treff bestätigen sie. */
export function TreffAbsprachenTab({ treff: t, rolle }: { treff: TreffDetailDaten; rolle: RolleInTreff }) {
  const { ich } = useAuth();
  const absprachen = useLaden(() => listeTreffAbsprachen(t.id), `treffabsprachen-${t.id}`);
  const ids = [...new Set((absprachen.daten ?? []).flatMap((n) => [n.erstellt_von, ...n.bestaetigungen.map((b) => b.person_id)]).filter((x): x is string => !!x))].sort();
  const namenL = useLaden(() => holeNamen(ids), `treff-namen-${t.id}-${ids.join(',')}`);
  useLive(['notizen', 'notiz_bestaetigungen'], () => absprachen.neuLaden());
  const [bearbeite, setBearbeite] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  if (!ich) return null;

  const namen = namenL.daten ?? {};
  const schreiben = darfTreffVerwalten(rolle);
  const bestaetigen = darfTreffAbspracheBestaetigen(rolle);

  async function lauf(aktion: () => Promise<void>) {
    setFehler(null);
    try { await aktion(); absprachen.neuLaden(); } catch (e) { setFehler(fehlerText(e)); throw e; }
  }
  const still = (p: Promise<void>) => p.catch(() => undefined);

  const karte = (n: Notiz) => {
    if (bearbeite === n.id) {
      return (
        <li key={n.id} className="list__item" style={{ display: 'block' }}>
          <AbspracheFormular beschriftung="Absprache bearbeiten" anfang={{ text: n.text, datum: n.datum }} abbrechen={() => setBearbeite(null)}
            speichern={async (text, datum) => {
              await lauf(() => aendereNotiz(n.id, { geltung: datum ? 'tag' : 'gesamt', datum, text }));
              setBearbeite(null);
            }} />
        </li>
      );
    }
    const bestaetigt = istBestaetigtVon(n, ich.id);
    return (
      <li key={n.id} className="list__item" style={{ display: 'block' }}>
        <p style={{ whiteSpace: 'pre-line', marginBottom: 'var(--space-2)' }}>{n.text}</p>
        <div className="list__meta" style={{ marginBottom: 'var(--space-2)' }}>
          {n.erstellt_von && <span>{namen[n.erstellt_von] ?? 'Jemand'}</span>}
          <span>{datumZeit(n.created_at)}</span>
          {n.datum && <Badge>Für {formatDatum(n.datum)}</Badge>}
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {bestaetigen && (
            <Button klein variante={bestaetigt ? 'primary' : 'standard'} aria-pressed={bestaetigt}
              onClick={() => void still(lauf(() => (bestaetigt ? bestaetigungZurueck(n.id, ich.id) : bestaetige(n.id, ich.id))))}>
              👍 {bestaetigt ? 'Bestätigt' : 'Bestätigen'}
            </Button>
          )}
          {schreiben && <Button klein onClick={() => setBearbeite(n.id)}>Bearbeiten</Button>}
          {schreiben && (
            <Button klein variante="danger" onClick={() => { if (window.confirm('Diese Absprache löschen?')) void still(lauf(() => loescheNotiz(n.id))); }}>Löschen</Button>
          )}
        </div>
        {n.bestaetigungen.length > 0 && (
          <p className="field__hint" style={{ marginTop: 'var(--space-2)' }}>Bestätigt von {namenListe(n.bestaetigungen.map((b) => b.person_id), namen)}</p>
        )}
      </li>
    );
  };

  return (
    <div className="stack">
      {(absprachen.fehler || fehler) && <Alert ton="error">{absprachen.fehler ?? fehler}</Alert>}
      {absprachen.laedt && <Spinner />}
      {schreiben && (
        <Card>
          <AbspracheFormular beschriftung="Neue Absprache" speichern={(text, datum) => lauf(() => legeTreffAbspracheAn(t.id, { geltung: datum ? 'tag' : 'gesamt', datum, text }))} />
        </Card>
      )}
      {!absprachen.laedt && (absprachen.daten?.length ?? 0) === 0 && <EmptyState icon="🤝" titel="Noch keine Absprachen" />}
      <ul className="list">{(absprachen.daten ?? []).map(karte)}</ul>
    </div>
  );
}
