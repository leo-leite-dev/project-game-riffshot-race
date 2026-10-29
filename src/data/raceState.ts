import type Phaser from 'phaser';

// Read-only access to the canonical state. No provisional wallet/score mirror.
export function getRaceState(registry: Pick<Phaser.Data.DataManager, 'get'>) {
  return registry.get('championship');
}
