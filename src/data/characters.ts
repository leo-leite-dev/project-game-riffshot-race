import type Phaser from 'phaser';

// Scores are design ratings (1–10), not speeds or physical units. Every pilot
// has 30 points; future simulation can map each rating to its own parameters.
export const ATTRIBUTE_SCALE = 10;
export const ATTRIBUTES = Object.freeze([
  { key: 'speed', label: 'VELOCIDADE', futureRole: 'Potencial de velocidade máxima' },
  { key: 'acceleration', label: 'ACELERAÇÃO', futureRole: 'Ganho de velocidade e retomada' },
  { key: 'handling', label: 'CONTROLE', futureRole: 'Resposta de direção e estabilidade' },
  { key: 'endurance', label: 'RESISTÊNCIA', futureRole: 'Tolerância a danos e impactos' },
  { key: 'aggression', label: 'AGRESSIVIDADE', futureRole: 'Força de contato e eficiência ofensiva' },
].map(Object.freeze));

export const CHARACTERS = Object.freeze([
  {
    id: 'vera-volt', name: 'VERA VOLT', profile: 'EQUILIBRADA',
    description: 'Mecânica de órbita baixa. Equilibra precisão, coragem e um motor sempre no limite.',
    stats: { speed: 6, acceleration: 6, handling: 6, endurance: 6, aggression: 6 },
    portrait: { accent: '#71f6ff', skin: '#b87556', hair: '#201c37', style: 'crest', visor: '#ffb66b' },
  },
  {
    id: 'kira-comet', name: 'KIRA COMET', profile: 'VELOCIDADE',
    description: 'Cartógrafa de corredores solares. Lê tempestades magnéticas à distância e escolhe atalhos que só existem por alguns segundos.',
    stats: { speed: 9, acceleration: 8, handling: 5, endurance: 4, aggression: 4 },
    portrait: { accent: '#ffbe55', skin: '#e8b19a', hair: '#26364b', style: 'solar-cowl', visor: '#71f6ff' },
  },
  {
    id: 'echo-7', name: 'ECHO-7', profile: 'PRECISÃO',
    description: 'Unidade autônoma de recuperação de sondas. Calcula trajetórias em tempo real e protege o que outros pilotos deixam para trás.',
    stats: { speed: 5, acceleration: 6, handling: 9, endurance: 6, aggression: 4 },
    portrait: { accent: '#a6a0ff', skin: '#7e90ad', hair: '#35415a', style: 'salvage', visor: '#b6ffea' },
  },
  {
    id: 'atlas-knox', name: 'ATLAS KNOX', profile: 'RESISTÊNCIA',
    description: 'Supervisor de docas de minério. Conhece cada impacto estrutural pelo som e transforma sucata em blindagem de corrida.',
    stats: { speed: 4, acceleration: 3, handling: 5, endurance: 10, aggression: 8 },
    portrait: { accent: '#ffb769', skin: '#895d4e', hair: '#25263b', style: 'hauler', visor: '#ffdf9c' },
  },
  {
    id: 'dax-voltage', name: 'DAX VOLTAGE', profile: 'ENGENHARIA DE SOM',
    description: 'Técnico de ressonância das arenas orbitais. Afina bobinas de ignição como instrumentos e transforma ruído de motor em vantagem na pista.',
    stats: { speed: 6, acceleration: 5, handling: 4, endurance: 6, aggression: 9 },
    portrait: { accent: '#ffb454', skin: '#a66f55', hair: '#252434', style: 'resonance', visor: '#71f6ff' },
  },
  {
    id: 'zuri-spark', name: 'ZURI SPARK', profile: 'ARRANCADA',
    description: 'Inventora de bobinas de pulso. Monta cada protótipo com peças reaproveitadas e testa a ignição em pistas improvisadas.',
    stats: { speed: 6, acceleration: 10, handling: 7, endurance: 3, aggression: 4 },
    portrait: { accent: '#a9f477', skin: '#6f443e', hair: '#242237', style: 'ponytail', visor: '#c6ff9b' },
  },
].map(character => Object.freeze({
  ...character,
  stats: Object.freeze(character.stats),
  portrait: Object.freeze(character.portrait),
})));

export function getCharacterById(id: string | null) {
  return CHARACTERS.find(character => character.id === id) ?? null;
}

export function getSelectedCharacter(registry: Pick<Phaser.Data.DataManager, 'get'>) {
  return getCharacterById(registry.get('selectedCharacterId'));
}
