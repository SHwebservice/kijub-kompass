import { describe, it, expect } from 'vitest';
import { zugangsStatus } from './Personen';

describe('zugangsStatus', () => {
  it('Zugang eingerichtet, wenn ein Konto verknüpft ist', () => {
    expect(zugangsStatus({ auth_user_id: 'u' }).text).toBe('Zugang eingerichtet');
  });
  it('sonst noch kein Zugang', () => {
    expect(zugangsStatus({ auth_user_id: null }).text).toBe('Noch kein Zugang');
  });
});
