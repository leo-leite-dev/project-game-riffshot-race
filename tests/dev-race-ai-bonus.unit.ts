import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDevRaceAIBonus, DEFAULT_DEV_RACE_AI_BONUS, normalizeDevRaceAIBonus } from '../src/race/DevRaceAIBonus.ts';
import { deriveHandlingStats } from '../src/race/RaceSimulation.ts';

test('bônus de IA usa 0% como padrão e limita valores a 0–20%', () => {
  assert.deepEqual(DEFAULT_DEV_RACE_AI_BONUS, { botsPercent: 0, rivalPercent: 0 });
  assert.deepEqual(normalizeDevRaceAIBonus({ botsPercent: 12.7, rivalPercent: -4 }), { botsPercent: 13, rivalPercent: 0 });
  assert.deepEqual(normalizeDevRaceAIBonus({ botsPercent: 900, rivalPercent: 'x' }), { botsPercent: 20, rivalPercent: 0 });
});

test('bônus melhora velocidade, aceleração e curva sem modificar os atributos originais', () => {
  const base = deriveHandlingStats({ speed: 70, acceleration: 65, control: 60, tires: 60 });
  const boosted = applyDevRaceAIBonus(base, 20);
  for (const key of ['maxSpeed', 'acceleration', 'grip', 'steering'] as const) {
    assert.equal(boosted[key], base[key] * 1.2);
  }
  assert.equal(base.maxSpeed, deriveHandlingStats({ speed: 70, acceleration: 65, control: 60, tires: 60 }).maxSpeed);
});
