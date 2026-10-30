import type { HandlingStats } from './RaceSimulation.ts';

export const DEV_RACE_AI_BONUS_KEY = 'riffshot.dev-race-ai-bonus.v1';
export const DEV_RACE_AI_BONUS_MAX = 20;

export interface DevRaceAIBonus {
  botsPercent: number;
  rivalPercent: number;
}

export const DEFAULT_DEV_RACE_AI_BONUS: Readonly<DevRaceAIBonus> = Object.freeze({
  botsPercent: 0,
  rivalPercent: 0,
});

export function normalizeDevRaceAIBonus(value: unknown): DevRaceAIBonus {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const percent = (key: keyof DevRaceAIBonus) => {
    const number = Number(record[key]);
    return Number.isFinite(number) ? Math.max(0, Math.min(DEV_RACE_AI_BONUS_MAX, Math.round(number))) : 0;
  };
  return { botsPercent: percent('botsPercent'), rivalPercent: percent('rivalPercent') };
}

export function loadDevRaceAIBonus(): DevRaceAIBonus {
  try {
    const stored = globalThis.localStorage?.getItem(DEV_RACE_AI_BONUS_KEY);
    return stored ? normalizeDevRaceAIBonus(JSON.parse(stored)) : { ...DEFAULT_DEV_RACE_AI_BONUS };
  } catch {
    return { ...DEFAULT_DEV_RACE_AI_BONUS };
  }
}

export function saveDevRaceAIBonus(value: unknown): DevRaceAIBonus {
  const normalized = normalizeDevRaceAIBonus(value);
  try { globalThis.localStorage?.setItem(DEV_RACE_AI_BONUS_KEY, JSON.stringify(normalized)); }
  catch { /* Local tuning is optional; unavailable storage must not stop a race. */ }
  return normalized;
}

/** Boosts only performance inputs used by a bot's driving/curve calculations. */
export function applyDevRaceAIBonus(stats: HandlingStats, percent: number): HandlingStats {
  const multiplier = 1 + Math.max(0, Math.min(DEV_RACE_AI_BONUS_MAX, Number(percent) || 0)) / 100;
  return {
    ...stats,
    maxSpeed: stats.maxSpeed * multiplier,
    acceleration: stats.acceleration * multiplier,
    grip: stats.grip * multiplier,
    steering: stats.steering * multiplier,
  };
}
