import type { CSSProperties } from 'react';
import { freizeitFarbe } from '../freizeiten/logik';

interface MitFarbe { id: string; farbe?: string | null }

/** Stil für einen Listeneintrag oder eine Karte mit Farbstreifen der Freizeit (zusammen mit der Klasse `fz-streifen`). */
export const fzStreifen = (f: MitFarbe): CSSProperties => ({ '--fz-farbe': freizeitFarbe(f.id, f.farbe) } as CSSProperties);

/** Farbpunkt vor dem Namen einer Freizeit; rein zur Wiedererkennung, für Hilfsmittel ausgeblendet. */
export function FzPunkt({ freizeit }: { freizeit: MitFarbe }) {
  return <span className="fz-punkt" aria-hidden="true" style={{ background: freizeitFarbe(freizeit.id, freizeit.farbe) }} />;
}
