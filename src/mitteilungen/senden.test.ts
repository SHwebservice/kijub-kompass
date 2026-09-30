import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// In den Seiten-Tests ist senden.ts global ersetzt (src/test-setup.ts); hier wird die echte Fassung geprüft.
const invoke = vi.hoisted(() => vi.fn());
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke } }, konfiguriert: true }));

const echt = async () => vi.importActual<typeof import('./senden')>('./senden');

beforeEach(() => { invoke.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); });

const erfolg = { empfaenger: 2, geraete: 3, gesendet: 3, entfernt: 0, fehlgeschlagen: 0 };

describe('sendeMitteilung', () => {
  it('ruft die Funktion mit Art, Bezug und Zusatz auf und gibt das Ergebnis zurück', async () => {
    invoke.mockResolvedValue({ data: erfolg, error: null });
    const { sendeMitteilung } = await echt();
    expect(await sendeMitteilung('hinweis', 'abc', { a: 1 })).toEqual(erfolg);
    expect(invoke).toHaveBeenCalledWith('push-senden', { body: { art: 'hinweis', ref: 'abc', extra: { a: 1 } } });
  });

  it('ohne Bezug und Zusatz: null und leeres Objekt', async () => {
    invoke.mockResolvedValue({ data: erfolg, error: null });
    const { sendeMitteilung } = await echt();
    await sendeMitteilung('test');
    expect(invoke).toHaveBeenCalledWith('push-senden', { body: { art: 'test', ref: null, extra: {} } });
  });

  it('liest die Meldung der Funktion aus dem Fehler', async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ fehler: 'Diese Mitteilung wurde gerade schon gesendet' }), { status: 409 }) } });
    const { sendeMitteilung, PushFehler } = await echt();
    const e = await sendeMitteilung('hinweis', 'x').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(PushFehler);
    expect((e as Error).message).toBe('Diese Mitteilung wurde gerade schon gesendet');
    expect((e as { status: number }).status).toBe(409);
  });

  it('ohne lesbare Antwort gibt es eine allgemeine Meldung', async () => {
    const { sendeMitteilung } = await echt();
    invoke.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    await expect(sendeMitteilung('test')).rejects.toThrow('Die Mitteilung konnte nicht gesendet werden.');
    invoke.mockResolvedValue({ data: null, error: { context: new Response('<html>Bad Gateway</html>', { status: 502 }) } });
    await expect(sendeMitteilung('test')).rejects.toThrow('Die Mitteilung konnte nicht gesendet werden.');
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ anderes: 1 }), { status: 500 }) } });
    await expect(sendeMitteilung('test')).rejects.toThrow('Die Mitteilung konnte nicht gesendet werden.');
  });
});

describe('sendePush (ohne zu warten)', () => {
  it('gibt sofort zurück und löst den Versand aus', async () => {
    invoke.mockResolvedValue({ data: erfolg, error: null });
    const { sendePush } = await echt();
    expect(sendePush('hinweis', 'abc')).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('ein Fehler wird nur in der Konsole vermerkt und wirft nicht', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ fehler: 'Dafür fehlt die Berechtigung.' }), { status: 403 }) } });
    const { sendePush } = await echt();
    sendePush('hinweis', 'abc');
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('Mitteilung nicht gesendet:', 'Dafür fehlt die Berechtigung.'));
  });

  it('auch ein Netzwerkfehler (Ausnahme) bleibt folgenlos', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    invoke.mockRejectedValue(new Error('offline'));
    const { sendePush } = await echt();
    sendePush('hinweis', 'abc');
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
  });
});
