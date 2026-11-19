import type { PilotId } from './pilotIds.ts';

export type UltimateId =
  | 'axel-double-shot'
  | 'neon-kira-hack-stop'
  | 'brok-thorn-freeze'
  | 'leonard-lyon-defensive-leap'
  | 'rox-z7-forced-acceleration'
  | 'vyra-noctis-position-swap'
  | 'dagger-raven-bat-lift'
  | 'cyber-dragon-fire-mark'
  | 'drax-mare-spin-shot'
  | 'drax-mare-water-shield';

export type UltimateDefinition = {
  readonly id: UltimateId;
  readonly pilotId: PilotId;
  readonly description: string;
  /** Nome canônico da textura e caminho do asset oficial distribuído em public/. */
  readonly iconKey: string;
  readonly iconPath: string;
  readonly sharedChargeGroup?: 'drax-mare-ultimate';
};

const ultimate = (
  id: UltimateId,
  pilotId: PilotId,
  description: string,
  options?: { sharedChargeGroup?: 'drax-mare-ultimate' },
): UltimateDefinition => Object.freeze({
  id,
  pilotId,
  description,
  iconKey: `ultimate-icon-${id}`,
  iconPath: `/assets/characters/ultimate-icons/${id}.png`,
  ...options,
});

/** Catálogo descritivo das habilidades aprovadas; não executa efeitos na corrida. */
export const ULTIMATES: readonly UltimateDefinition[] = Object.freeze([
  ultimate('axel-double-shot', 'axel-ryder', 'O próximo tiro causa dano dobrado.'),
  ultimate('neon-kira-hack-stop', 'neon-kira', 'Hackeia o veículo inimigo, fazendo-o parar temporariamente.'),
  ultimate('brok-thorn-freeze', 'brok-thorn', 'Congela temporariamente o veículo atingido.'),
  ultimate('leonard-lyon-defensive-leap', 'leonard-lyon', 'Salto defensivo para desviar de disparos.'),
  ultimate('rox-z7-forced-acceleration', 'rox-z7', 'Força o veículo atingido a acelerar intensamente em linha reta, dificultando curvas.'),
  ultimate('vyra-noctis-position-swap', 'vyra-noctis', 'Troca de posição com o carro atingido.'),
  ultimate('dagger-raven-bat-lift', 'dagger-raven', 'Morcegos levantam temporariamente o veículo adversário.'),
  ultimate('cyber-dragon-fire-mark', 'cyber-dragon', 'Marca o adversário para receber um ataque de fogo de um dragão.'),
  ultimate('drax-mare-spin-shot', 'drax-mare', 'Tiro que provoca derrapagem e rodopio.', { sharedChargeGroup: 'drax-mare-ultimate' }),
  ultimate('drax-mare-water-shield', 'drax-mare', 'Escudo de água que bloqueia um disparo.', { sharedChargeGroup: 'drax-mare-ultimate' }),
]);

const ultimatesById = new Map(ULTIMATES.map(ultimate => [ultimate.id, ultimate]));

if (ultimatesById.size !== ULTIMATES.length) {
  throw new Error('Os IDs das Ultimates precisam ser únicos.');
}

export function getUltimate(id: string): UltimateDefinition | undefined {
  return ultimatesById.get(id as UltimateId);
}
