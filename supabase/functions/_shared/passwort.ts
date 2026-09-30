// Erzeugt Startpasswörter für neue Zugänge. Reines TypeScript ohne Deno-Abhängigkeit,
// damit es auch in den normalen Tests (tests/functions/) geprüft werden kann.

// >>> passwort (identisch mit _shared/passwort.ts – wird durch tests/functions geprüft)
// Ohne leicht verwechselbare Zeichen (0/O, 1/l/I) – die Koordination gibt das Passwort mündlich/per Nachricht weiter.
export const PASSWORT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export const GRUPPEN = 3;
export const GRUPPENLAENGE = 4;

/** Zufälliger Index in [0, n) ohne Modulo-Verzerrung (Rejection Sampling). */
function zufallsIndex(n: number, zufall: (b: Uint8Array) => Uint8Array): number {
  const grenze = 256 - (256 % n);
  for (;;) {
    const b = zufall(new Uint8Array(1))[0]!;
    if (b < grenze) return b % n;
  }
}

/** Z. B. "Xk7m-Qp4s-Rt9w": 12 Zeichen aus 57 möglichen ≈ 70 Bit Zufall. */
export function erzeugePasswort(
  zufall: (b: Uint8Array) => Uint8Array = (b) => { crypto.getRandomValues(b as Uint8Array<ArrayBuffer>); return b; },
): string {
  const gruppen: string[] = [];
  for (let g = 0; g < GRUPPEN; g++) {
    let s = '';
    for (let i = 0; i < GRUPPENLAENGE; i++) s += PASSWORT_ALPHABET[zufallsIndex(PASSWORT_ALPHABET.length, zufall)];
    gruppen.push(s);
  }
  return gruppen.join('-');
}
// <<< passwort
