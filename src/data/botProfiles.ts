export type BotProfileId = 'rival' | 'challenger' | 'opportunist';

// Driving intent only. No vehicle ratings, forces, damage or finishing rules.
export interface BotProfile {
  precision: number; lineOffset: number; preview: number; brakeAnticipation: number;
  overtakeBias: number; risk: number; consistency: number;
}
export interface BotBehavior extends Readonly<BotProfile> { readonly phase: number }

export const BOT_PROFILES: Readonly<Record<BotProfileId, Readonly<BotProfile>>> = Object.freeze({
  // Precise and aggressive, with the smallest variation between races.
  rival: Object.freeze({ precision: 1.12, lineOffset: 1.4, preview: 1, brakeAnticipation: 1,
    overtakeBias: 0.08, risk: 0.75, consistency: 0.035 }),
  // Camaro: bolder apex, later braking, earlier passing attempts; less consistent.
  challenger: Object.freeze({ precision: 1.04, lineOffset: 1.8, preview: 0.94, brakeAnticipation: 0.9,
    overtakeBias: 0.18, risk: 0.95, consistency: 0.08 }),
  // Armored: leave recovery room and wait for a less loaded corner to pass.
  // Its resistance comes from the real vehicle, never from this profile.
  opportunist: Object.freeze({ precision: 1.08, lineOffset: 1, preview: 1.08, brakeAnticipation: 1.12,
    overtakeBias: -0.08, risk: 0.35, consistency: 0.045 }),
});

// Evaluation metadata ONLY: an NPC win-share goal, never winner probabilities.
// The controller deliberately does not consume these weights.
export const BOT_BALANCE_GOAL = Object.freeze({
  meaning: 'goal' as const,
  metric: 'npc-win-share' as const,
  weights: Object.freeze({ rival: 0.7, challenger: 0.15, opportunist: 0.15 }),
});

const generic: Readonly<BotProfile> = Object.freeze({ precision: 1, lineOffset: 1.4,
  preview: 1, brakeAnticipation: 1, overtakeBias: 0, risk: 0.5, consistency: 0 });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Resolve once per participant/race. Seed changes bounded driving choices,
 * not pace caps or a desired outcome. Omitted/non-finite seeds use the base form.
 * Pass a new participant (or change aiSeed) when starting a different race. */
export function resolveBotBehavior(profile?: BotProfileId, seed?: number, participantId = ''): BotBehavior {
  const base = profile ? BOT_PROFILES[profile] ?? generic : generic;
  let hash = 0;
  for (const letter of participantId) hash = (hash * 31 + letter.charCodeAt(0)) | 0;
  const seeded = seed !== undefined && Number.isFinite(seed);
  let state = (hash ^ (seeded ? seed | 0 : 0)) >>> 0;
  const signed = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000 * 2 - 1;
  };
  const variation = seeded ? base.consistency : 0;
  return Object.freeze({
    ...base,
    precision: base.precision * (1 + signed() * variation),
    lineOffset: base.lineOffset * (1 + signed() * variation),
    preview: base.preview * (1 + signed() * variation),
    brakeAnticipation: base.brakeAnticipation * (1 + signed() * variation),
    overtakeBias: base.overtakeBias + signed() * variation,
    risk: clamp(base.risk + signed() * variation, 0, 1),
    phase: seeded ? (signed() + 1) * Math.PI : (hash >>> 0) % 628 / 100,
  });
}
