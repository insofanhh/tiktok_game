import { describe, expect, it } from 'vitest';
import { normalizeTikTokUsername, runtimeSettingsSchema } from './runtime-settings.js';

describe('normalizeTikTokUsername', () => {
  it('accepts usernames with or without @', () => {
    expect(normalizeTikTokUsername('@creator_live')).toBe('creator_live');
    expect(normalizeTikTokUsername('creator_live')).toBe('creator_live');
  });

  it('extracts the username from a TikTok live URL', () => {
    expect(normalizeTikTokUsername('https://www.tiktok.com/@creator_live/live')).toBe('creator_live');
  });
});

describe('runtimeSettingsSchema', () => {
  it('uses a 10 minute round for existing settings files', () => {
    const settings = runtimeSettingsSchema.parse({ mode: 'live', username: 'creator_live' });
    expect(settings.roundDurationMinutes).toBe(10);
    expect(settings.maxPlayers).toBeNull();
  });

  it('accepts round durations from 1 to 120 minutes', () => {
    expect(runtimeSettingsSchema.parse({
      mode: 'mock',
      username: '',
      roundDurationMinutes: 1,
    }).roundDurationMinutes).toBe(1);
    expect(runtimeSettingsSchema.safeParse({
      mode: 'mock',
      username: '',
      roundDurationMinutes: 121,
    }).success).toBe(false);
  });
});


describe('saved player limits', () => {
  it.each([null, 1, 50, 501])('accepts and preserves limit %s through JSON storage', maxPlayers => {
    const settings = runtimeSettingsSchema.parse({ mode:'mock', username:'', maxPlayers });
    expect(runtimeSettingsSchema.parse(JSON.parse(JSON.stringify(settings))).maxPlayers).toBe(maxPlayers);
  });
  it.each([0, -1, 1.5, Infinity, NaN, '50', '', true, Number.MAX_SAFE_INTEGER + 1])('rejects invalid saved limit %s', maxPlayers => {
    expect(runtimeSettingsSchema.safeParse({ mode:'mock', username:'', maxPlayers }).success).toBe(false);
  });
});
