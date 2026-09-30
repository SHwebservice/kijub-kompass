import axe from 'axe-core';

/**
 * Prüft mit axe-core, ob das Gerenderte die gängigen Regeln der Barrierefreiheit verletzt (Beschriftungen, Rollen, Überschriften,
 * Tabellenköpfe, doppelte Kennungen …). Farbkontraste prüft tests/betrieb/kontrast.test.ts (jsdom kennt keine Farben);
 * „region“ entfällt, weil einzelne Seiten ohne die Rahmenseite gezeigt werden.
 */
export async function axeVerstoesse(bereich: Element): Promise<string[]> {
  const ergebnis = await axe.run(bereich, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  return ergebnis.violations.map((v) => `${v.id}: ${v.help} – ${v.nodes.slice(0, 3).map((n) => `${n.target.join(' ')} [${n.html.slice(0, 90)}]`).join(' | ')}`);
}
