// Driving intent only: neither difficulty nor the rival profile changes forces
// or vehicle ratings. Normal leaves a wider corner margin and more reaction time.
export const DIFFICULTIES = Object.freeze({
  normal: Object.freeze({
    id: 'normal', label: 'Normal', lookahead: 17, brakeAnticipation: 0.73,
    steeringGain: 1.82, steeringError: 0.045, reaction: 0.34,
    overtakeDesire: 0.36, targetSpeed: 0.84,
    corneringSafety: 0.78,
  }),
  hard: Object.freeze({
    id: 'hard', label: 'Difícil', lookahead: 23, brakeAnticipation: 0.82,
    steeringGain: 2.55, steeringError: 0.018, reaction: 0.08,
    overtakeDesire: 0.98, targetSpeed: 1.06,
    corneringSafety: 1,
  }),
});
