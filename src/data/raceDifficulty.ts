export const DIFFICULTIES = Object.freeze({
  normal: Object.freeze({
    id: 'normal', label: 'Normal', lookahead: 17, brakeAnticipation: 0.73,
    steeringGain: 1.82, steeringError: 0.045, reaction: 0.34,
    overtakeDesire: 0.36, targetSpeed: 0.84,
  }),
  hard: Object.freeze({
    id: 'hard', label: 'Difícil', lookahead: 27, brakeAnticipation: 0.92,
    steeringGain: 2.35, steeringError: 0.035, reaction: 0.12,
    overtakeDesire: 0.78, targetSpeed: 0.92,
  }),
});
