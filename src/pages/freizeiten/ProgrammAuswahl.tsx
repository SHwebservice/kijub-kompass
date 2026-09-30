import { useState } from 'react';
import { useLaden } from '../../lib/laden';
import { listeAngebote } from '../../freizeiten/api';
import { filtereAngebote } from '../../freizeiten/plan';
import { KATEGORIEN_ANGEBOT, kategorieIcon, kategorieLabel } from '../../katalog/kategorien';
import { Alert, Button, EmptyState, Spinner, TextField } from '../../components/ui';

interface Props {
  /** Freitext (statt Katalog-Punkt) darf nur die Leitung/Koordination eintragen. */
  freitextErlaubt: boolean;
  waehleAngebot: (angebotId: string) => void;
  waehleFreitext: (text: string) => void;
}

/** Auswahl eines Programmpunkts aus dem Katalog (mit Suche und Kategorie) oder – für die Leitung – eines Freitexts. */
export function ProgrammAuswahl({ freitextErlaubt, waehleAngebot, waehleFreitext }: Props) {
  const angebote = useLaden(listeAngebote, 'angebote');
  const [modus, setModus] = useState<'katalog' | 'freitext'>('katalog');
  const [suche, setSuche] = useState('');
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [freitext, setFreitext] = useState('');

  const treffer = filtereAngebote(angebote.daten ?? [], suche, kategorie);

  return (
    <div>
      {freitextErlaubt && (
        <div className="tabs" role="tablist" aria-label="Art des Eintrags">
          <button role="tab" aria-selected={modus === 'katalog'} className="tabs__tab" onClick={() => setModus('katalog')}>Aus dem Katalog</button>
          <button role="tab" aria-selected={modus === 'freitext'} className="tabs__tab" onClick={() => setModus('freitext')}>Freitext</button>
        </div>
      )}

      {modus === 'freitext' && freitextErlaubt ? (
        <form onSubmit={(e) => { e.preventDefault(); if (freitext.trim()) waehleFreitext(freitext.trim()); }}>
          <TextField label="Was steht an?" value={freitext} onChange={(e) => setFreitext(e.target.value)} maxLength={200}
            hinweis={'z. B. „Ausflug ins Schwimmbad“ oder „Elterncafé“'} />
          <Button variante="primary" type="submit" disabled={!freitext.trim()}>Eintragen</Button>
        </form>
      ) : (
        <>
          <TextField label="Suchen" type="search" value={suche} onChange={(e) => setSuche(e.target.value)} placeholder="Name des Programmpunkts" autoComplete="off" />
          <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }} role="group" aria-label="Kategorie">
            <Button klein variante={kategorie === null ? 'primary' : 'standard'} onClick={() => setKategorie(null)}>Alle</Button>
            {KATEGORIEN_ANGEBOT.map((k) => (
              <Button key={k.id} klein variante={kategorie === k.id ? 'primary' : 'standard'} onClick={() => setKategorie(kategorie === k.id ? null : k.id)}>
                {k.icon} {k.label}
              </Button>
            ))}
          </div>
          {angebote.fehler && <Alert ton="error">{angebote.fehler}</Alert>}
          {angebote.laedt && <Spinner />}
          {!angebote.laedt && (angebote.daten?.length ?? 0) === 0 && (
            <EmptyState icon="📚" titel="Der Katalog ist noch leer">
              {freitextErlaubt ? 'Bis Programmpunkte im Katalog stehen, kannst du einen Freitext eintragen.' : 'Sobald die Koordination Programmpunkte angelegt hat, kannst du sie hier auswählen.'}
            </EmptyState>
          )}
          {!angebote.laedt && (angebote.daten?.length ?? 0) > 0 && treffer.length === 0 && <p>Nichts gefunden.</p>}
          <ul className="list">
            {treffer.slice(0, 50).map((a) => (
              <li key={a.id}>
                <button type="button" className="list__item" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={() => waehleAngebot(a.id)}>
                  <span className="list__main">
                    <span className="list__title">{a.name}</span>
                    <span className="list__meta">
                      <span>{kategorieIcon(a.kategorie)} {kategorieLabel(a.kategorie)}</span>
                      {a.dauer && <span>{a.dauer}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {treffer.length > 50 && <p className="field__hint">Die ersten 50 Treffer werden gezeigt – bitte die Suche eingrenzen.</p>}
        </>
      )}
    </div>
  );
}
