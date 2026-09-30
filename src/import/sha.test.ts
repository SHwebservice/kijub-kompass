import { describe, it, expect, vi, afterEach } from 'vitest';
import { sha256Hex } from './kijuko';

afterEach(() => { vi.unstubAllGlobals(); });

describe('sha256Hex', () => {
  it('berechnet den bekannten Wert für „abc“', async () => {
    expect(await sha256Hex(new TextEncoder().encode('abc').buffer as ArrayBuffer)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('ohne crypto.subtle (Seite ohne HTTPS) gibt es eine klare Meldung statt eines Rätsels', async () => {
    vi.stubGlobal('crypto', {});
    await expect(sha256Hex(new ArrayBuffer(1))).rejects.toThrow(/crypto\.subtle ist nicht verfügbar/);
  });
});
