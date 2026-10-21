import { useState, type FormEvent } from 'react';
import { aendereNotiz, bestaetige, bestaetigungZurueck, loescheNotiz } from '../../freizeiten/api';
import { formatDatum } from '../../freizeiten/logik';
import { istBestaetigtVon, namenListe, type Notiz } from '../../freizeiten/notizen';
import { Badge, Button, TextField } from '../../components/ui';

/**
 * Absprachen des Treffs (Art „Absprache“ im Reiter Notizen): die Treffleitung schreibt sie, alle im Treff bestätigen sie.
 * Sie liegen weiter in der Tabelle `notizen` (Dienstplan-Badge, Startseite und Mitteilungen bleiben unverändert).
 */

export const MAX_ABSPRACHE = 2000;

const datumZeit = (iso: string) => `${formatDatum(iso.slice(0, 10))} ${iso.slice(11, 16)}`;

export function pruefeAbsprache(text: string): string | null {
  if (!text.trim()) return 'Bitte einen Text eingeben.';
  if (text.trim().length > MAX_ABSPRACHE) return `Der Text darf höchstens ${MAX_ABSPRACHE} Zeichen lang sein.`;
  return null;
}

/** Vergangen ist eine Absprache, deren Tag vor heute liegt; Absprachen ohne Tag gelten immer. */
export const istVergangen = (n: Pick<Notiz, 'datum'>, heute: string) => !!n.datum && n.datum < heute;

/** Text und – optional – der Tag, für den die Absprache gilt. */
export function AbspracheFelder({ text, datum, fehler, setText, setDatum }: {
  text: string; datum: string; fehler: string | null; setText: (t: string) => void; setDatum: (d: string) => void;
}) {
  return (
    <>
      <div className="field">
        <label className="field__label" htmlFor="absprache-text">Absprache</label>
        <textarea id="absprache-text" className="input" rows={3} value={text} maxLength={MAX_ABSPRACHE + 1} onChange={(e) => setText(e.target.value)}
          aria-invalid={fehler ? true : undefined} style={{ padding: 'var(--space-3)' }} />
        {fehler && <span className="field__error">{fehler}</span>}
      </div>
      <TextField label="Gilt für einen bestimmten Tag (optional)" type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
    </>
  );
}

function AbspracheBearbeiten({ n, speichern, abbrechen }: { n: Notiz; speichern: (text: string, datum: string | null) => Promise<void>; abbrechen: () => void }) {
  const [text, setText] = useState(n.text);
  const [datum, setDatum] = useState(n.datum ?? '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    const f = pruefeAbsprache(text);
    setFehler(f);
    if (f) return;
    setArbeitet(true);
    try { await speichern(text, datum || null); } catch { /* Die Seite zeigt den Fehler; die Eingaben bleiben stehen. */ } finally { setArbeitet(false); }
  }

  return (
    <form onSubmit={(e) => void absenden(e)} noValidate className="stack">
      <AbspracheFelder text={text} datum={datum} fehler={fehler} setText={setText} setDatum={setDatum} />
      <div className="row">
        <Button variante="primary" type="submit" laedt={arbeitet}>Änderung speichern</Button>
        <Button onClick={abbrechen}>Abbrechen</Button>
      </div>
    </form>
  );
}

interface ZeilenProps {
  n: Notiz;
  ichId: string;
  namen: Record<string, string>;
  schreiben: boolean;
  bestaetigen: boolean;
  lauf: (aktion: () => Promise<void>) => Promise<void>;
}

export function AbspracheZeile({ n, ichId, namen, schreiben, bestaetigen, lauf }: ZeilenProps) {
  const [bearbeite, setBearbeite] = useState(false);
  const still = (p: Promise<void>) => p.catch(() => undefined);

  if (bearbeite) {
    return (
      <li className="list__item" style={{ display: 'block' }}>
        <AbspracheBearbeiten n={n} abbrechen={() => setBearbeite(false)} speichern={async (text, datum) => {
          await lauf(() => aendereNotiz(n.id, { geltung: datum ? 'tag' : 'gesamt', datum, text }));
          setBearbeite(false);
        }} />
      </li>
    );
  }
  const bestaetigt = istBestaetigtVon(n, ichId);
  return (
    <li className="list__item" style={{ display: 'block' }}>
      <p style={{ whiteSpace: 'pre-line', marginBottom: 'var(--space-2)' }}>{n.text}</p>
      <div className="list__meta" style={{ marginBottom: 'var(--space-2)' }}>
        <Badge>🤝 Absprache</Badge>
        {n.datum && <Badge ton="accent">Für {formatDatum(n.datum)}</Badge>}
        {n.erstellt_von && <span>{namen[n.erstellt_von] ?? 'Jemand'}</span>}
        <span>{datumZeit(n.created_at)}</span>
      </div>
      <div className="row" style={{ gap: 'var(--space-2)' }}>
        {bestaetigen && (
          <Button klein variante={bestaetigt ? 'primary' : 'standard'} aria-pressed={bestaetigt}
            onClick={() => void still(lauf(() => (bestaetigt ? bestaetigungZurueck(n.id, ichId) : bestaetige(n.id, ichId))))}>
            👍 {bestaetigt ? 'Bestätigt' : 'Bestätigen'}
          </Button>
        )}
        {schreiben && <Button klein variante="ghost" onClick={() => setBearbeite(true)}>Bearbeiten</Button>}
        {schreiben && (
          <Button klein variante="ghost" onClick={() => { if (window.confirm('Diese Absprache löschen?')) void still(lauf(() => loescheNotiz(n.id))); }}>Löschen</Button>
        )}
      </div>
      {n.bestaetigungen.length > 0 && (
        <p className="field__hint" style={{ marginTop: 'var(--space-2)' }}>Bestätigt von {namenListe(n.bestaetigungen.map((b) => b.person_id), namen)}</p>
      )}
    </li>
  );
}
