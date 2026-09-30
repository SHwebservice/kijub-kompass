import { zaehleZukuenftigeDienste } from '../treffs/api';
import { entfernenFrage } from './logik';

/**
 * Fragt vor dem Entfernen aus einem Treff nach – mit Hinweis, wie viele künftige Dienste wegfallen.
 * Lässt sich die Zahl nicht ermitteln, wird trotzdem (ohne Zahl) gefragt.
 */
export async function bestaetigeTreffEntfernen(treffId: string, treffName: string, personId: string, name: string, ab: string): Promise<boolean> {
  const n = await Promise.resolve(zaehleZukuenftigeDienste(treffId, personId, ab)).then((x) => x ?? 0, () => 0);
  return window.confirm(entfernenFrage(name, treffName, n));
}
