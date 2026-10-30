/** Pure data shared by the browser loader and Vite's asset mapping. */
export type RaceAudioSampleKind = 'shot' | 'hit' | 'skid';
export interface RaceAudioAsset {
  readonly kind: RaceAudioSampleKind;
  /** Original owner-supplied basename, kept privately until license confirmation. */
  readonly sourceFileName: string;
  /** Stable internal identifier; these files are never emitted to public builds. */
  readonly fileName: string;
  readonly url: string;
}

export const RACE_AUDIO_ASSETS: readonly RaceAudioAsset[] = Object.freeze([
  Object.freeze({ kind: 'shot' as const, sourceFileName: 'canhão_disparo_windowmaker.mp3',
    fileName: 'canhao_disparo_windowmaker.mp3', url: '/__local-audio/canhao_disparo_windowmaker.mp3' }),
  Object.freeze({ kind: 'hit' as const, sourceFileName: 'impacto_disparo.mp3',
    fileName: 'impacto_disparo.mp3', url: '/__local-audio/impacto_disparo.mp3' }),
  Object.freeze({ kind: 'skid' as const, sourceFileName: 'pneu_derrapando.mp3',
    fileName: 'pneu_derrapando.mp3', url: '/__local-audio/pneu_derrapando.mp3' }),
]);
