import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// In den Seiten-Tests ist useLive global abgeschaltet (src/test-setup.ts); hier wird die echte Fassung geprüft.
const { kanal, supabaseMock } = vi.hoisted(() => {
  const handler: { fn: (() => void)[] } = { fn: [] };
  const kanal = {
    on: vi.fn((_art: string, _filter: unknown, fn: () => void) => { handler.fn.push(fn); return kanal; }),
    subscribe: vi.fn(),
    handler,
  };
  return { kanal, supabaseMock: { channel: vi.fn(() => kanal), removeChannel: vi.fn() } };
});
vi.mock('./supabase', () => ({ supabase: supabaseMock, konfiguriert: true }));

beforeEach(() => { vi.useFakeTimers(); kanal.handler.fn = []; vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

async function echtesUseLive() {
  return (await vi.importActual<typeof import('./live')>('./live')).useLive;
}

describe('useLive', () => {
  it('abonniert jede Tabelle einmal auf allen Ereignissen', async () => {
    const useLive = await echtesUseLive();
    renderHook(() => useLive(['plan_eintraege', 'notizen'], () => undefined));
    expect(supabaseMock.channel).toHaveBeenCalledTimes(1);
    expect(kanal.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'plan_eintraege' }, expect.any(Function));
    expect(kanal.on).toHaveBeenCalledWith('postgres_changes', { event: '*', schema: 'public', table: 'notizen' }, expect.any(Function));
    expect(kanal.subscribe).toHaveBeenCalledTimes(1);
  });

  it('fasst viele schnelle Änderungen zu einem Aufruf zusammen', async () => {
    const useLive = await echtesUseLive();
    const beiAenderung = vi.fn();
    renderHook(() => useLive(['notizen'], beiAenderung, 300));
    act(() => { kanal.handler.fn[0]!(); kanal.handler.fn[0]!(); kanal.handler.fn[0]!(); });
    expect(beiAenderung).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(299); });
    expect(beiAenderung).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2); });
    expect(beiAenderung).toHaveBeenCalledTimes(1);
  });

  it('ruft immer die aktuelle Funktion auf (kein veralteter Stand)', async () => {
    const useLive = await echtesUseLive();
    const alt = vi.fn(); const neu = vi.fn();
    const { rerender } = renderHook(({ f }) => useLive(['notizen'], f), { initialProps: { f: alt } });
    rerender({ f: neu });
    act(() => { kanal.handler.fn[0]!(); vi.advanceTimersByTime(400); });
    expect(alt).not.toHaveBeenCalled();
    expect(neu).toHaveBeenCalledTimes(1);
    expect(supabaseMock.channel).toHaveBeenCalledTimes(1);       // kein neuer Kanal bei bloßer Funktionsänderung
  });

  it('räumt beim Verlassen auf: Kanal schließen und ausstehenden Aufruf verwerfen', async () => {
    const useLive = await echtesUseLive();
    const beiAenderung = vi.fn();
    const { unmount } = renderHook(() => useLive(['notizen'], beiAenderung));
    act(() => { kanal.handler.fn[0]!(); });
    unmount();
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(kanal);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(beiAenderung).not.toHaveBeenCalled();
  });

  it('andere Tabellen bauen einen neuen Kanal', async () => {
    const useLive = await echtesUseLive();
    const { rerender } = renderHook(({ t }) => useLive(t, () => undefined), { initialProps: { t: ['notizen'] } });
    rerender({ t: ['notizen', 'freizeit_team'] });
    expect(supabaseMock.channel).toHaveBeenCalledTimes(2);
    expect(supabaseMock.removeChannel).toHaveBeenCalledTimes(1);
  });
});
