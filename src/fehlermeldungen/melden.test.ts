import { describe, it, expect, vi } from 'vitest';
import { bereinige, bereinigePfad, erzeugeMelder, fehlerAngaben, installiereFehlerMeldung } from './melden';

describe('Bereinigen', () => {
  it('entfernt Kennungen, Mail-Adressen und Zahlenfolgen', () => {
    expect(bereinige('Person 123e4567-e89b-12d3-a456-426614174000 von anna@kijub.de, Tel. +49 6233 123456'))
      .toBe('Person :id von [mail], Tel. [zahl]');
  });
  it('kurze Zahlen bleiben (Zeilen, Fehlercodes)', () => {
    expect(bereinige('Zeile 42, Code 23505')).toBe('Zeile 42, Code 23505');
  });
  it('Adresse ohne Suchteil, Anker und Kennungen', () => {
    expect(bereinigePfad('/treffs/123e4567-e89b-12d3-a456-426614174000/protokoll?x=1#oben')).toBe('/treffs/:id/protokoll');
    expect(bereinigePfad('')).toBe('/');
  });
});

describe('Fehlerangaben', () => {
  it('liest Error, Text und Objekte mit „message“; bereinigt Meldung und Stapel', () => {
    const e = new Error('kaputt bei anna@kijub.de');
    e.stack = 'Error: kaputt\n  at x (app.js:1:1)\n  anna@kijub.de';
    const a = fehlerAngaben(e)!;
    expect(a.meldung).toBe('kaputt bei [mail]');
    expect(a.stapel).not.toContain('anna');
    expect(fehlerAngaben('Text')).toEqual({ meldung: 'Text', stapel: null });
    expect(fehlerAngaben({ message: 'Objekt' })).toEqual({ meldung: 'Objekt', stapel: null });
  });
  it('leere, unbekannte und ignorierte Fehler ergeben nichts', () => {
    for (const x of [undefined, null, 42, '', '   ', {}, 'ResizeObserver loop completed with undelivered notifications.', 'Script error.', new TypeError('Failed to fetch'), 'NetworkError when attempting to fetch resource.', 'Load failed']) {
      expect(fehlerAngaben(x)).toBeNull();
    }
  });
  it('lange Meldungen werden gekürzt', () => {
    expect(fehlerAngaben('x'.repeat(1000))!.meldung).toHaveLength(400);
  });
});

describe('Melder', () => {
  const bauen = (max?: number) => {
    const senden = vi.fn().mockResolvedValue(undefined);
    let pfad = '/treffs/123e4567-e89b-12d3-a456-426614174000/notizen';
    const melder = erzeugeMelder({ senden, version: 'abc1234', pfad: () => pfad, ...(max ? { max } : {}) });
    return { senden, melder, setzePfad: (p: string) => { pfad = p; } };
  };
  const warte = () => new Promise((r) => setTimeout(r, 0));

  it('sendet Version, bereinigte Seite, Meldung und Stapel', async () => {
    const { senden, melder } = bauen();
    melder(new Error('x is not defined'));
    await warte();
    expect(senden).toHaveBeenCalledWith('abc1234', '/treffs/:id/notizen', 'x is not defined', expect.any(String));
  });
  it('dieselbe Meldung an derselben Stelle nur einmal, an anderer Stelle erneut', async () => {
    const { senden, melder, setzePfad } = bauen();
    melder('kaputt'); melder('kaputt'); melder('kaputt');
    setzePfad('/mehr');
    melder('kaputt');
    await warte();
    expect(senden).toHaveBeenCalledTimes(2);
  });
  it('pro Sitzung höchstens fünf verschiedene Fehler', async () => {
    const { senden, melder } = bauen();
    for (let i = 0; i < 12; i += 1) melder(`Fehler ${i}`);
    await warte();
    expect(senden).toHaveBeenCalledTimes(5);
  });
  it('Fehler beim Senden stören nie', async () => {
    const senden = vi.fn().mockRejectedValue(new Error('offline'));
    const melder = erzeugeMelder({ senden, version: 'v', pfad: () => '/' });
    expect(() => melder('kaputt')).not.toThrow();
    await warte();
    expect(senden).toHaveBeenCalled();
  });
  it('ignorierte Fehler werden nicht gesendet und zählen nicht mit', async () => {
    const { senden, melder } = bauen(2);
    melder('Script error.'); melder(new TypeError('Failed to fetch'));
    melder('echter Fehler 1'); melder('echter Fehler 2');
    await warte();
    expect(senden).toHaveBeenCalledTimes(2);
  });
});

describe('Hören auf Fehler der Seite', () => {
  it('meldet Fehler und abgelehnte Promises; die Abmeldung beendet das Hören', () => {
    const melder = vi.fn();
    const ziel = new EventTarget();
    const aus = installiereFehlerMeldung(melder, ziel as unknown as Window);
    const fehler = new ErrorEvent('error', { error: new Error('A'), message: 'A' });
    ziel.dispatchEvent(fehler);
    const ablehnung = new Event('unhandledrejection') as Event & { reason?: unknown };
    ablehnung.reason = 'B';
    ziel.dispatchEvent(ablehnung);
    expect(melder).toHaveBeenNthCalledWith(1, fehler.error);
    expect(melder).toHaveBeenNthCalledWith(2, 'B');
    aus();
    ziel.dispatchEvent(new ErrorEvent('error', { error: new Error('C') }));
    expect(melder).toHaveBeenCalledTimes(2);
  });
});
