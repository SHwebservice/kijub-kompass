import { useCallback, useState } from 'react';
import { useAuth } from '../../lib/auth-kontext';
import { useLaden } from '../../lib/laden';
import { useLive } from '../../lib/live';
import { fehlerText } from '../../lib/fehler';
import {
  holeNamen, listeEintraege, listeSlots, slotHinzufuegen, slotPositionen, type FreizeitDetailDaten,
} from '../../freizeiten/api';
import { formatKurz, heuteIso, tageVonBis, UEBERNACHTUNG, wochentagLang } from '../../freizeiten/logik';
import {
  ABEND, darfEintragAendern, darfEintragen, darfSlotsVerwalten, eintragTitel, kannAbendHinzufuegen, naechstePosition,
  sortiereSlots, tauschPositionen, zellen, zellenSchluessel, type PlanEintrag, type Slot,
} from '../../freizeiten/plan';
import { kategorieIcon } from '../../katalog/kategorien';
import type { RolleInFreizeit } from '../../lib/rollen';
import { Alert, Button, Spinner } from '../../components/ui';
import { EintragSheet, type SheetZiel } from './EintragSheet';

/** Wochenplan: pro Tag und Zeitabschnitt (Slot) beliebig viele Programmpunkte aus dem Katalog oder als Freitext. */
export function PlanTab({ freizeit: f, rolle }: { freizeit: FreizeitDetailDaten; rolle: RolleInFreizeit }) {
  const { ich } = useAuth();
  const slotsL = useLaden(() => listeSlots(f.id), `slots-${f.id}`);
  const eintraegeL = useLaden(() => listeEintraege(f.id), `eintraege-${f.id}`);
  const verfasserIds = [...new Set((eintraegeL.daten ?? []).map((e) => e.erstellt_von).filter((x): x is string => !!x))].sort();
  const namenL = useLaden(() => holeNamen(verfasserIds), `namen-${f.id}-${verfasserIds.join(',')}`);
  useLive(['plan_eintraege', 'freizeit_slots'], () => { slotsL.neuLaden(); eintraegeL.neuLaden(); });
  const [ziel, setZiel] = useState<SheetZiel | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState(false);

  const schliessen = useCallback(() => setZiel(null), []);
  if (!ich) return null;

  const slots: Slot[] = sortiereSlots(slotsL.daten ?? []);
  const tage = tageVonBis(f.start_datum, f.ende_datum);
  const zelle = zellen(eintraegeL.daten ?? []);
  const heute = heuteIso();
  const namen = namenL.daten ?? {};
  const verwaltung = darfSlotsVerwalten(rolle);

  async function slotAktion(aktion: () => Promise<void>) {
    setArbeitet(true); setFehler(null);
    try { await aktion(); slotsL.neuLaden(); } catch (e) { setFehler(fehlerText(e)); } finally { setArbeitet(false); }
  }

  function oeffne(e: PlanEintrag, slot: Slot) {
    setZiel({ art: 'eintrag', eintrag: e, slotName: slot.name, darfAendern: darfEintragAendern(rolle, e, ich!.id), verfasser: e.erstellt_von ? (namen[e.erstellt_von] ?? null) : null });
  }

  return (
    <div>
      {(slotsL.fehler || eintraegeL.fehler || fehler) && <Alert ton="error">{slotsL.fehler ?? eintraegeL.fehler ?? fehler}</Alert>}
      {(slotsL.laedt || eintraegeL.laedt) && <Spinner />}

      {verwaltung && f.typ === UEBERNACHTUNG && kannAbendHinzufuegen(slots) && !slotsL.laedt && (
        <p><Button klein disabled={arbeitet} onClick={() => void slotAktion(() => slotHinzufuegen(f.id, ABEND, naechstePosition(slots)))}>+ Abend-Slot hinzufügen</Button></p>
      )}

      {!slotsL.laedt && !eintraegeL.laedt && tage.map((tag) => (
        <section key={tag} className={`plan__tag${tag === heute ? ' plan__tag--heute' : ''}`} aria-labelledby={`tag-${tag}`}>
          <h2 id={`tag-${tag}`}>{wochentagLang(tag)}, {formatKurz(tag).slice(3)}{tag === heute ? ' · heute' : ''}</h2>
          <div className="plan__slots">
            {slots.map((slot) => {
              const eintraege = zelle.get(zellenSchluessel(tag, slot.id)) ?? [];
              return (
                <div key={slot.id} className="plan__slot" role="group" aria-label={`${slot.name} am ${formatKurz(tag)}`}>
                  <div className="plan__slot-kopf">
                    <span>{slot.name}</span>
                    {verwaltung && tag === tage[0] && (
                      <span className="row" style={{ gap: 0 }}>
                        <Button klein variante="ghost" aria-label={`Zeitabschnitt „${slot.name}“ nach oben`} disabled={arbeitet || !tauschPositionen(slots, slot.id, -1)}
                          onClick={() => { const t = tauschPositionen(slots, slot.id, -1); if (t) void slotAktion(() => slotPositionen(t)); }}>▲</Button>
                        <Button klein variante="ghost" aria-label={`Zeitabschnitt „${slot.name}“ nach unten`} disabled={arbeitet || !tauschPositionen(slots, slot.id, 1)}
                          onClick={() => { const t = tauschPositionen(slots, slot.id, 1); if (t) void slotAktion(() => slotPositionen(t)); }}>▼</Button>
                      </span>
                    )}
                  </div>
                  {eintraege.map((e) => (
                    <button key={e.id} type="button" className={`plan__eintrag${e.angebot_kategorie ? ` kat--${e.angebot_kategorie}` : ''}`} onClick={() => oeffne(e, slot)}>
                      <strong>{kategorieIcon(e.angebot_kategorie)} {eintragTitel(e)}</strong>
                      {e.notiz && <small>📝 {e.notiz}</small>}
                      {e.erstellt_von && namen[e.erstellt_von] && <small>von {namen[e.erstellt_von]}</small>}
                    </button>
                  ))}
                  {darfEintragen(rolle) && (
                    <Button klein block onClick={() => setZiel({ art: 'neu', datum: tag, slotId: slot.id, slotName: slot.name })}>
                      + Eintragen<span className="sr-only"> ({slot.name}, {formatKurz(tag)})</span>
                    </Button>
                  )}
                  {!darfEintragen(rolle) && eintraege.length === 0 && <span className="field__hint">—</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {ziel && (
        <EintragSheet freizeitId={f.id} rolle={rolle} ziel={ziel} schliessen={schliessen} geaendert={() => { eintraegeL.neuLaden(); }} />
      )}
    </div>
  );
}
