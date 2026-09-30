import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Bei voller Auslastung (Datenbank-Tests laufen parallel) dürfen asynchrone Erwartungen länger dauern,
// sonst fallen Tests zufällig durch. Gefundene Fehler bleiben Fehler – nur das Warten wird großzügiger.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

// Die Live-Aktualisierung (Realtime) wird in Seiten-Tests abgeschaltet; ihr Verhalten prüft src/lib/live.test.tsx.
vi.mock('./lib/live', () => ({ useLive: () => undefined }));

// Mitteilungen (Web-Push) werden in Seiten-Tests nicht wirklich versendet; geprüft wird nur, dass sie ausgelöst werden.
// Das Verhalten der Sendefunktion selbst prüft src/mitteilungen/senden.test.ts (mit echtem Modul via importActual).
vi.mock('./mitteilungen/senden', () => ({ sendePush: vi.fn(), sendeMitteilung: vi.fn(), PushFehler: class PushFehler extends Error {} }));
