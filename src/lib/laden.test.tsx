import { describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useLaden } from './laden';

describe('useLaden', () => {
  it('lädt, liefert dann die Daten', async () => {
    const { result } = renderHook(() => useLaden(async () => 42, 'a'));
    expect(result.current.laedt).toBe(true);
    await waitFor(() => expect(result.current.daten).toBe(42));
    expect(result.current.laedt).toBe(false);
    expect(result.current.fehler).toBeNull();
  });

  it('„nichts gefunden" (null) ist ein Ergebnis: das Laden ist beendet', async () => {
    const { result } = renderHook(() => useLaden(async () => null, 'a'));
    await waitFor(() => expect(result.current.laedt).toBe(false));
    expect(result.current.daten).toBeNull();
    expect(result.current.fehler).toBeNull();
  });

  it('meldet Fehler als Text, ohne Technikdetails', async () => {
    const { result } = renderHook(() => useLaden(async () => { throw new Error('SELECT kaputt'); }, 'a'));
    await waitFor(() => expect(result.current.fehler).not.toBeNull());
    expect(result.current.fehler).toBe('Die Daten konnten nicht geladen werden.');
    expect(result.current.laedt).toBe(false);
  });

  it('übersetzt Berechtigungsfehler', async () => {
    const { result } = renderHook(() => useLaden(async () => { throw { code: '42501', message: 'x' }; }, 'a'));
    await waitFor(() => expect(result.current.fehler).toBe('Dafür fehlt die Berechtigung.'));
  });

  it('beim Wechsel des Schlüssels erscheinen nie die Daten des vorherigen Eintrags', async () => {
    let freigeben: (v: string) => void = () => undefined;
    const lader = vi.fn((k: string) => (k === 'a' ? Promise.resolve('Daten A') : new Promise<string>((r) => { freigeben = r; })));
    const { result, rerender } = renderHook(({ k }) => useLaden(() => lader(k), k), { initialProps: { k: 'a' } });
    await waitFor(() => expect(result.current.daten).toBe('Daten A'));
    rerender({ k: 'b' });
    expect(result.current.daten).toBeNull();
    expect(result.current.laedt).toBe(true);
    await act(async () => { freigeben('Daten B'); });
    await waitFor(() => expect(result.current.daten).toBe('Daten B'));
  });

  it('ein verspätetes Ergebnis eines alten Schlüssels wird verworfen', async () => {
    let alteAntwort: (v: string) => void = () => undefined;
    const lader = (k: string) => (k === 'a' ? new Promise<string>((r) => { alteAntwort = r; }) : Promise.resolve('Daten B'));
    const { result, rerender } = renderHook(({ k }) => useLaden(() => lader(k), k), { initialProps: { k: 'a' } });
    rerender({ k: 'b' });
    await waitFor(() => expect(result.current.daten).toBe('Daten B'));
    await act(async () => { alteAntwort('Daten A (zu spät)'); });
    expect(result.current.daten).toBe('Daten B');
  });

  it('neuLaden lädt erneut und lässt die alten Daten bis dahin stehen', async () => {
    let n = 0;
    const { result } = renderHook(() => useLaden(async () => ++n, 'a'));
    await waitFor(() => expect(result.current.daten).toBe(1));
    act(() => result.current.neuLaden());
    expect(result.current.daten).toBe(1);
    expect(result.current.laedt).toBe(false);
    await waitFor(() => expect(result.current.daten).toBe(2));
  });
});
