import { useState, type FormEvent } from 'react';
import { formatKurz, tageVonBis } from '../../freizeiten/logik';
import { validiereNotiz, type Geltung } from '../../freizeiten/notizen';
import type { NotizWerte } from '../../freizeiten/api';
import { Button, SelectField } from '../../components/ui';

interface Props {
  start: string;
  ende: string;
  /** Vorbelegung beim Bearbeiten. */
  anfang?: NotizWerte;
  beschriftung: string;
  speichern: (w: NotizWerte) => Promise<void>;
  abbrechen?: () => void;
}

/** Eingabe für Hinweis oder Absprache: Text, gilt für die ganze Freizeit oder einen bestimmten Tag. */
export function NotizFormular({ start, ende, anfang, beschriftung, speichern, abbrechen }: Props) {
  const tage = tageVonBis(start, ende);
  const [text, setText] = useState(anfang?.text ?? '');
  const [geltung, setGeltung] = useState<Geltung>(anfang?.geltung ?? 'gesamt');
  const [datum, setDatum] = useState(anfang?.datum ?? '');
  const [fehler, setFehler] = useState<{ text?: string; datum?: string }>({});
  const [arbeitet, setArbeitet] = useState(false);

  async function absenden(e: FormEvent) {
    e.preventDefault();
    const f = validiereNotiz({ text, geltung, datum }, tage);
    setFehler(f);
    if (f.text || f.datum) return;
    setArbeitet(true);
    try {
      await speichern({ text, geltung, datum: geltung === 'tag' ? datum : null });
      if (!anfang) { setText(''); setGeltung('gesamt'); setDatum(''); }
    } catch {
      /* Der Fehler wird von der aufrufenden Seite angezeigt; die Eingaben bleiben stehen. */
    } finally { setArbeitet(false); }
  }

  return (
    <form onSubmit={(e) => void absenden(e)} noValidate>
      <div className="field">
        <label className="field__label" htmlFor={`notiz-text-${beschriftung}`}>{beschriftung}</label>
        <textarea id={`notiz-text-${beschriftung}`} className="input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
          aria-invalid={fehler.text ? true : undefined} style={{ padding: 'var(--space-3)' }} />
        {fehler.text && <span className="field__error">{fehler.text}</span>}
      </div>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 180px' }}>
          <SelectField label="Gilt für" value={geltung} onChange={(e) => setGeltung(e.target.value as Geltung)}>
            <option value="gesamt">Die ganze Freizeit</option>
            <option value="tag">Einen bestimmten Tag</option>
          </SelectField>
        </div>
        {geltung === 'tag' && (
          <div style={{ flex: '1 1 180px' }}>
            <SelectField label="Tag" value={datum} onChange={(e) => setDatum(e.target.value)} fehler={fehler.datum}>
              <option value="">– bitte wählen –</option>
              {tage.map((t) => <option key={t} value={t}>{formatKurz(t)}</option>)}
            </SelectField>
          </div>
        )}
      </div>
      <div className="row">
        <Button variante="primary" type="submit" laedt={arbeitet}>{anfang ? 'Änderung speichern' : 'Speichern'}</Button>
        {abbrechen && <Button onClick={abbrechen}>Abbrechen</Button>}
      </div>
    </form>
  );
}
