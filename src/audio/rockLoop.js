// "Neon Ignition": original placeholder pattern, not a transcription or sample.
// Eight bars at 136 BPM. Offline rendering keeps synthesis off the game loop.
const BPM = 136;
const STEP = 60 / BPM / 4;
const ROOTS = [40, 40, 43, 45, 40, 47, 38, 43];
const RIFF = [0, 0, null, 12, 0, null, 7, 0, 0, 0, 10, null, 7, 5, 3, 2];
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export async function renderRockLoop() {
  const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!OfflineContext) throw new Error('Síntese offline indisponível');
  const context = new OfflineContext(1, Math.ceil(ROOTS.length * 16 * STEP * 22050), 22050);
  const mix = context.createGain();
  mix.gain.value = 0.55;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -15;
  compressor.ratio.value = 5;
  mix.connect(compressor).connect(context.destination);

  const distortion = context.createWaveShaper();
  distortion.curve = Float32Array.from({ length: 2048 }, (_, i) => Math.tanh((i / 1023.5 - 1) * 5));
  distortion.oversample = '2x';
  const guitarFilter = context.createBiquadFilter();
  guitarFilter.type = 'lowpass';
  guitarFilter.frequency.value = 2300;
  const guitarLevel = context.createGain();
  guitarLevel.gain.value = 0.23;
  distortion.connect(guitarFilter).connect(guitarLevel).connect(mix);

  const noise = context.createBuffer(1, 22050, 22050);
  const samples = noise.getChannelData(0);
  let seed = 1987;
  for (let i = 0; i < samples.length; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    samples[i] = seed / 0xffffffff * 2 - 1;
  }

  const tone = (midi, time, duration, gain, type, target) => {
    const osc = context.createOscillator();
    const envelope = context.createGain();
    osc.type = type;
    osc.frequency.value = frequency(midi);
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(gain, time + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(envelope).connect(target);
    osc.start(time);
    osc.stop(time + duration + 0.005);
  };

  const percussion = (time, duration, gain, cutoff, highpass = false) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = noise;
    filter.type = highpass ? 'highpass' : 'bandpass';
    filter.frequency.value = cutoff;
    envelope.gain.setValueAtTime(gain, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);
    source.connect(filter).connect(envelope).connect(mix);
    source.start(time);
    source.stop(time + duration);
  };

  ROOTS.forEach((root, bar) => {
    for (let step = 0; step < 16; step += 1) {
      const time = (bar * 16 + step) * STEP;
      const note = RIFF[step];
      if (note !== null) {
        const sustain = step % 4 === 0 ? STEP * 1.5 : STEP * 0.72;
        tone(root + note, time, sustain, 0.48, 'sawtooth', distortion);
        tone(root + note + 7, time, sustain, 0.24, 'sawtooth', distortion);
      }
      if (step % 2 === 0) {
        tone(root - 12, time, STEP * 1.7, 0.48, 'triangle', mix);
        percussion(time, 0.045, step % 4 ? 0.09 : 0.16, 6500, true);
      }
      if ([0, 6, 8, 10].includes(step)) {
        const kick = context.createOscillator();
        const envelope = context.createGain();
        kick.frequency.setValueAtTime(150, time);
        kick.frequency.exponentialRampToValueAtTime(42, time + 0.12);
        envelope.gain.setValueAtTime(0.75, time);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
        kick.connect(envelope).connect(mix);
        kick.start(time);
        kick.stop(time + 0.21);
      }
      if (step === 4 || step === 12 || (bar % 4 === 3 && step === 14)) {
        percussion(time, 0.15, 0.65, 1900);
        tone(54, time, 0.1, 0.2, 'triangle', mix);
      }
      if (step === 0 && bar % 4 === 0) percussion(time, 0.5, 0.22, 5200, true);
    }
  });

  const buffer = await context.startRendering();
  // Leave headroom even if browser implementations differ in their compressor.
  const output = buffer.getChannelData(0);
  let peak = 0;
  for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  if (peak > 0.9) for (let i = 0; i < output.length; i += 1) output[i] *= 0.9 / peak;
  return buffer;
}
