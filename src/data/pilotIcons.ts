import { getPilotProfile } from './pilotos/index.ts';

/** Chaves das versões de ícone que compartilham a arte oficial dos cards atuais. */
export function pilotIconTextureKey(pilotId: string): string {
  return getPilotProfile(pilotId)?.identityIconKey ?? `pilot-symbol-${pilotId}`;
}

export function pilotWhiteIconTextureKey(pilotId: string): string {
  const identityKey = getPilotProfile(pilotId)?.identityIconKey ?? `pilot-symbol-${pilotId}`;
  return identityKey.replace(/^pilot-symbol-/, 'pilot-symbol-white-');
}

export function pilotPortraitTextureKey(pilotId: string): string {
  return getPilotProfile(pilotId)?.portraitKey ?? `pilot-card-portrait-${pilotId}`;
}
