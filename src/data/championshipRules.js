// Shared balance for the implemented opening challenge. SCORE gates progress;
// MONEY is the independent spendable wallet. No upgrade shop is implemented.
export const CHAMPIONSHIP_RULES = Object.freeze({
  maximumRacesPerRival: 8,
  targetScore: 1400,
  rewardsByPosition: Object.freeze({
    1: Object.freeze({ score: 300, money: 1500 }),
    2: Object.freeze({ score: 170, money: 850 }),
    3: Object.freeze({ score: 70, money: 400 }),
    4: Object.freeze({ score: 0, money: 0 }),
  }),
  afterFailure: Object.freeze({ resetScore: true, resetMoney: true, resetAttemptUpgrades: true, preservePilotVehicleDifficulty: true }),
  trackSelection: Object.freeze({
    manualChoiceOnFirstRaceAfterFailure: true,
    automaticAfterFirstRace: true,
    avoidRepeatUntilPoolUsed: true,
    avoidImmediateRepeatAfterCycle: true,
  }),
});
