import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VEHICLE_MODEL_ASSETS } from '../src/visuals/vehicles/vehicleModels.ts';
import { validateVehiclePayload } from './vehicleAssetsPlugin.ts';

const attribution: Record<string, { author: string; title: string; source: string; adaptations: string; notice: string }> = {
  'thunder_bug.glb': {
    author: 'Chenchanchong', title: 'race car',
    source: 'https://sketchfab.com/3d-models/race-car-97768c0e69744cd5922ddc5a9fd59266',
    adaptations: 'Derivado sem perdas: recompressão PNG, remoção de UVs não usados, compactação de índices, união de vértices idênticos e deduplicação de dados/imagens. Preserva pixels, triângulos, UVs usados e animação Fan. Apresentação em memória: escala, alinhamento, pivôs e animação própria das rodas.',
    notice: 'THIRD_PARTY_NOTICES.md#thunder-bug--race-car',
  },
  'race_car.glb': {
    author: 'Tasneem', title: 'Race Car',
    source: 'https://sketchfab.com/3d-models/race-car-517dfa8823394b178c9c313d7e68fb7f',
    adaptations: 'Binário inalterado. Apresentação em memória: escala, alinhamento +90°, pivôs e animação própria das rodas; estepe fixo. race_car2.glb é somente um alias de catálogo, sem payload duplicado.',
    notice: 'THIRD_PARTY_NOTICES.md#race-car-2--race-car',
  },
  'camaro.glb': {
    author: 'Primus03', title: "Transformers Universe: Drive-By's Vehicle Form",
    source: 'https://sketchfab.com/3d-models/transformers-universe-drive-bys-vehicle-form-1eee5b31a3dd46ef9b91a95b9261e7f8',
    adaptations: 'Binário inalterado. CAMARO é o nome de catálogo. Apresentação em memória: escala, alinhamento, pivôs e animação própria das rodas.',
    notice: 'THIRD_PARTY_NOTICES.md#camaro--transformers-universe-drive-bys-vehicle-form',
  },
  'armored_car_death_race.glb': {
    author: 'jaack', title: 'Armored car (death race)',
    source: 'https://sketchfab.com/3d-models/armored-car-death-race-ea76bac506f04676b8514951b67994f8',
    adaptations: 'Binário inalterado. Adaptado para iron-bastion em memória: escala, alinhamento −90°, pivôs e animação própria das rodas.',
    notice: 'THIRD_PARTY_NOTICES.md#armored-car--armored-car-death-race',
  },
  'widowmaker_-_death_race_2000.glb': {
    author: 'Brian Trepanier', title: 'Widowmaker - Death Race 2000',
    source: 'https://sketchfab.com/3d-models/widowmaker-death-race-2000-15b6eb31787446879f063bb9b25cbc5c',
    adaptations: 'Binário inalterado. Adaptado para widowmaker em memória: escala, alinhamento −34,52°, seleção de rodas por regiões cilíndricas, pivôs e animação própria das rodas.',
    notice: 'THIRD_PARTY_NOTICES.md#widowmaker--widowmaker---death-race-2000',
  },
};

const sha256 = (source: Buffer) => createHash('sha256').update(source).digest('hex');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function fixedDirectory(root: string, parts: string[]) {
  let directory = await realpath(root);
  for (const part of parts) {
    const expected = join(directory, part);
    if (await realpath(expected) !== expected) throw new Error('Preparação bloqueada: diretório redirecionado.');
    directory = expected;
  }
  return directory;
}

// Explicit packaging command only. Reads exactly the five fixed source names;
// never scans private references and never writes to their directory.
export async function prepareVehicleAssets({ root = projectRoot, optimizeThunder }: {
  root?: string; optimizeThunder?: (source: Buffer) => { output: Buffer };
} = {}) {
  const sourceDirectory = await fixedDirectory(root, ['referencias-locais', 'Vehicles']);
  const destination = await fixedDirectory(root, ['public', 'assets', 'models', 'vehicles']);
  const payloads = [], entries = [];
  for (const asset of VEHICLE_MODEL_ASSETS) {
    const sourcePath = join(sourceDirectory, asset.fileName);
    if (await realpath(sourcePath) !== sourcePath) throw new Error(`Preparação bloqueada: fonte redirecionada (${asset.fileName}).`);
    const file = await open(sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    let source;
    try {
      if (!(await file.stat()).isFile()) throw new Error(`Fonte inválida: ${asset.fileName}.`);
      source = await file.readFile();
    } finally { await file.close(); }
    if (asset.fileName === 'thunder_bug.glb' && !optimizeThunder) {
      ({ optimizeThunderBug: optimizeThunder } = await import('./optimizeThunderBug.ts'));
    }
    if (asset.fileName === 'thunder_bug.glb' && !optimizeThunder) throw new Error('Otimizador Thunder Bug indisponível.');
    const output = asset.fileName === 'thunder_bug.glb' && optimizeThunder ? optimizeThunder(source).output : source;
    validateVehiclePayload(output, asset.fileName);
    entries.push({
      fileName: asset.fileName, url: asset.url, ...attribution[asset.fileName],
      license: 'CC BY 4.0', licenseURL: 'https://creativecommons.org/licenses/by/4.0/',
      sourceBytes: source.length, sourceSha256: sha256(source), bytes: output.length, sha256: sha256(output),
    });
    payloads.push(output);
  }
  // Check every destination before the first write; no symlink can overwrite an
  // original or an unrelated file. A failed preparation never falls back to it.
  for (const fileName of [...VEHICLE_MODEL_ASSETS.map(asset => asset.fileName), 'manifest.json']) {
    const path = join(destination, fileName);
    try {
      if (!(await lstat(path)).isFile() || await realpath(path) !== path) throw new Error('Preparação bloqueada: destino redirecionado.');
    } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  }
  const manifest = { version: 1, assets: entries };
  for (const [index, asset] of VEHICLE_MODEL_ASSETS.entries()) {
    await writeFile(join(destination, asset.fileName), payloads[index], { flag: 'w', mode: 0o644 });
  }
  // Publish the manifest last; interrupted copies fail integrity validation.
  await writeFile(join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const manifest = await prepareVehicleAssets();
    for (const entry of manifest.assets) console.log(`${entry.fileName}: ${entry.bytes} bytes SHA-256 ${entry.sha256}`);
  } catch {
    console.error('Falha na preparação dos cinco assets: verifique as fontes aprovadas, os destinos e a integridade dos GLBs.');
    process.exitCode = 1;
  }
}
