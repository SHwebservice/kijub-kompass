import { describe, it, expect } from 'vitest';
import { einladungsStatus } from './Personen';

describe('einladungsStatus', () => {
  it('angemeldet, wenn ein Konto verknüpft ist', () => {
    expect(einladungsStatus({ auth_user_id: 'u', eingeladen_am: null }).text).toBe('Angemeldet');
  });
  it('eingeladen, wenn nur eine Einladung raus ist', () => {
    expect(einladungsStatus({ auth_user_id: null, eingeladen_am: '2026-01-01' }).text).toBe('Eingeladen');
  });
  it('sonst noch nicht eingeladen', () => {
    expect(einladungsStatus({ auth_user_id: null, eingeladen_am: null }).text).toBe('Noch nicht eingeladen');
  });
});
