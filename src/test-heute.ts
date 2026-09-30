import type { HeuteDaten } from './heute/api';

/** Ein leerer Stand der Startseite (Antwort von fn_heute ohne Inhalte) für die Tests. */
export const leererStand = (): HeuteDaten => ({
  notizen: [], team: [], plan: [], bestand: [], orte: {}, wuensche: [], treffNamen: {},
  bewerbungen: 0, vorschlaege: 0, nachweise: 0, fehler: 0,
  protokolliert: [], offeneNotizen: {}, seit: null, neu: [], neuGesamt: 0,
});
