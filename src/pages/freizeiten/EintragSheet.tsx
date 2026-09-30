import { useState } from 'react';
import { fehlerText } from '../../lib/fehler';
import { aendereEintrag, loescheEintrag, trageEin } from '../../freizeiten/api';
import { darfFreitext, eintragTitel, type PlanEintrag } from '../../freizeiten/plan';
import { formatKurz, wochentagLang, formatDatum } from '../../freizeiten/logik';
import { kategorieIcon, kategorieLabel } from '../../katalog/kategorien';
import type { RolleInFreizeit } from '../../lib/rollen';
import { Sheet } from '../../components/Sheet';
import { Alert, Button } from '../../components/ui';
import { ProgrammAuswahl } from './ProgrammAuswahl';

export type SheetZiel =
  | { art: 'neu'; datum: string; slotId: string; slotName: string }
  | { art: 'eintrag'; eintrag: PlanEintrag; slotName: string; darfAendern: boolean; verfasser: string | null };

interface Props {
  freizeitId: string;
  rolle: RolleInFreizeit;
  ziel: SheetZiel;
  schliessen: () => void;
  /** Nach jeder Änderung: Daten neu laden. */
  geaendert: () => void;
}

/** Fenster zum Eintragen, Ansehen, Ändern und Entfernen eines Wochenplan-Eintrags. */
export function EintragSheet({ freizeitId, rolle, ziel, schliessen, geaendert }: Props) {
  const [waehlen, setWaehlen] = useState(ziel.art === 'neu');
  const [notiz, setNotiz] = useState(ziel.art === 'eintrag' ? (ziel.eintrag.notiz ?? '') : '');
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const datum = ziel.art === 'neu' ? ziel.datum : ziel.eintrag.datum;
  const titel = `${wochentagLang(datum)}, ${formatDatum(datum)} · ${ziel.slotName}`;

  async function ausfuehren(aktion: () => Promise<void>) {
    setArbeitet(true); setFehler(null);
    try { await aktion(); geaendert(); schliessen(); }
    catch (e) { setFehler(fehlerText(e, 'Das hat nicht geklappt.')); setArbeitet(false); }
  }

  const wahl = (werte: { angebot_id: string | null; freitext: string | null }) => ziel.art === 'neu'
    ? ausfuehren(() => trageEin(freizeitId, ziel.datum, ziel.slotId, { ...werte, notiz: null }))
    : ausfuehren(() => aendereEintrag(ziel.eintrag.id, werte));

  return (
    <Sheet titel={titel} schliessen={schliessen}>
      {fehler && <Alert ton="error">{fehler}</Alert>}

      {waehlen ? (
        <>
          {ziel.art === 'eintrag' && <p><Button klein onClick={() => setWaehlen(false)}>← Zurück</Button></p>}
          <ProgrammAuswahl
            freitextErlaubt={darfFreitext(rolle)}
            waehleAngebot={(id) => void wahl({ angebot_id: id, freitext: null })}
            waehleFreitext={(t) => void wahl({ angebot_id: null, freitext: t })}
          />
        </>
      ) : ziel.art === 'eintrag' ? (
        <div className="stack">
          <div className={ziel.eintrag.angebot_kategorie ? `plan__eintrag kat--${ziel.eintrag.angebot_kategorie}` : 'plan__eintrag'}>
            <strong>{eintragTitel(ziel.eintrag)}</strong>
            {ziel.eintrag.angebot_kategorie && <small>{kategorieIcon(ziel.eintrag.angebot_kategorie)} {kategorieLabel(ziel.eintrag.angebot_kategorie)}</small>}
            <small>{formatKurz(ziel.eintrag.datum)} · {ziel.slotName}{ziel.verfasser ? ` · eingetragen von ${ziel.verfasser}` : ''}</small>
          </div>

          {ziel.darfAendern ? (
            <>
              <div className="field">
                <label className="field__label" htmlFor="eintrag-notiz">Notiz</label>
                <textarea id="eintrag-notiz" className="input" rows={4} value={notiz} onChange={(e) => setNotiz(e.target.value)}
                  placeholder="z. B. Material, Treffpunkt, Besonderheiten" style={{ padding: 'var(--space-3)' }} />
              </div>
              <div className="row">
                <Button variante="primary" laedt={arbeitet} disabled={notiz.trim() === (ziel.eintrag.notiz ?? '')}
                  onClick={() => void ausfuehren(() => aendereEintrag(ziel.eintrag.id, { notiz: notiz.trim() || null }))}>Notiz speichern</Button>
                <Button disabled={arbeitet} onClick={() => setWaehlen(true)}>Programmpunkt ändern</Button>
                <Button variante="danger" disabled={arbeitet}
                  onClick={() => { if (window.confirm('Diesen Eintrag entfernen?')) void ausfuehren(() => loescheEintrag(ziel.eintrag.id)); }}>Entfernen</Button>
              </div>
            </>
          ) : (
            <>
              {ziel.eintrag.notiz ? <p style={{ whiteSpace: 'pre-line' }}>{ziel.eintrag.notiz}</p> : <p className="field__hint">Keine Notiz.</p>}
              {rolle === 'teamer' && <p className="field__hint">Du kannst nur deine eigenen Einträge ändern.</p>}
            </>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}
