import { isValidChampionshipState, migrateChampionshipState } from './championshipState.js';

export const CHAMPIONSHIP_SAVE_KEY = 'riffshot-racing:championship:v1';
export const CHAMPIONSHIP_BACKUP_KEY = `${CHAMPIONSHIP_SAVE_KEY}:backup`;

// Explicit, user-confirmed deletion only. Never clear the origin's storage:
// unrelated applications and preferences do not belong to the championship.
export function eraseChampionship(storage, expectedRaw) {
  if (!storage) return { ok: false, warning: 'Armazenamento indisponível. Não foi possível apagar o progresso salvo.' };
  try {
    if (storage.getItem(CHAMPIONSHIP_SAVE_KEY) !== expectedRaw) return { ok: false,
      warning: 'O progresso mudou em outra aba. Recarregue antes de confirmar a exclusão.' };
    const names = new Set([CHAMPIONSHIP_BACKUP_KEY, CHAMPIONSHIP_SAVE_KEY]);
    if (typeof storage.key === 'function' && Number.isInteger(storage.length)) {
      // Snapshot before removing: deletion changes localStorage's key indices.
      for (let index = 0; index < storage.length; index += 1) {
        const name = storage.key(index);
        if (typeof name === 'string' && /^riffshot-racing:championship:v\d+(?::backup)?$/.test(name)) names.add(name);
      }
    }
    const keys = [...names].filter(name => name !== CHAMPIONSHIP_SAVE_KEY);
    keys.push(CHAMPIONSHIP_SAVE_KEY); // Preserve the primary if backup removal fails.
    for (const key of keys) {
      storage.removeItem(key);
      if (storage.getItem(key) !== null) throw new Error('Exclusão bloqueada');
    }
    return { ok: true, warning: null };
  } catch {
    return { ok: false, warning: 'Não foi possível concluir a exclusão do save e dos backups. Progresso em memória mantido; recarregue antes de tentar novamente.' };
  }
}

function decode(raw) {
  try {
    const state = JSON.parse(raw);
    if ([1, 2].includes(state?.schemaVersion)) {
      const migrated = migrateChampionshipState(state);
      if (!migrated) return { state: null,
        warning: 'Save de campeonato inválido para migração. Original e backup preservados; gravação bloqueada.' };
      return { state: migrated, warning: null, migrated: true };
    }
    if (state?.schemaVersion !== 3) return { state: null,
      warning: 'Versão de campeonato desconhecida. Migração bloqueada; save original preservado.' };
    if (!isValidChampionshipState(state)) return { state: null,
      warning: 'Save de campeonato inválido. Original e backup preservados; gravação bloqueada.' };
    return { state, warning: null };
  } catch {
    return { state: null, warning: 'Save de campeonato ilegível. Original e backup preservados; gravação bloqueada.' };
  }
}

// The historical key remains stable, independently of the payload schema.
// Other versioned keys are unknown and never replaced/recovered automatically.
function unknownVersionPresent(storage) {
  if (typeof storage.key !== 'function' || !Number.isInteger(storage.length)) return false;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key === 'string' && /^riffshot-racing:championship:v\d+$/.test(key)
      && key !== CHAMPIONSHIP_SAVE_KEY) return true;
  }
  return false;
}

export function loadChampionship(storage) {
  let raw = null;
  if (!storage) return { state: null, raw, writable: false, warning: 'Armazenamento indisponível.' };
  try {
    raw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
    if (raw !== null && typeof raw !== 'string') return { state: null, raw: null, writable: false,
      warning: 'Resposta inválida do armazenamento; gravação bloqueada.' };
    if (unknownVersionPresent(storage)) return { state: null, raw, writable: false,
      warning: 'Outra versão do campeonato foi encontrada. Migração desconhecida bloqueada; saves preservados.' };
    if (raw === null) {
      if (storage.getItem(CHAMPIONSHIP_BACKUP_KEY) !== null) return { state: null, raw, writable: false,
        warning: 'Save principal ausente, mas há backup anterior. Cópia preservada; gravação bloqueada até revisão.' };
      return { state: null, raw, writable: true, warning: null };
    }
    const decoded = decode(raw);
    return { ...decoded, raw, writable: decoded.state !== null };
  } catch {
    return { state: null, raw, writable: false, warning: 'Não foi possível acessar o armazenamento; gravação bloqueada.' };
  }
}

export function saveChampionship(storage, nextState, previousRaw) {
  const failed = warning => ({ ok: false, raw: typeof previousRaw === 'string' ? previousRaw : null, warning });
  if (!isValidChampionshipState(nextState)) return failed('Estado de campeonato inválido; nada foi gravado.');
  if (!storage) return failed('Armazenamento indisponível.');
  if (previousRaw !== null && typeof previousRaw !== 'string') return failed('Save anterior inválido; gravação bloqueada.');
  try {
    const currentRaw = storage.getItem(CHAMPIONSHIP_SAVE_KEY);
    if (currentRaw !== previousRaw) return failed('Save alterado por outra aba. Recarregue antes de salvar.');
    if (unknownVersionPresent(storage)) return failed('Versão desconhecida encontrada; migração e gravação bloqueadas.');
    if (currentRaw === null && storage.getItem(CHAMPIONSHIP_BACKUP_KEY) !== null) {
      return failed('Save principal ausente com backup anterior. Cópia preservada; gravação bloqueada.');
    }
    if (currentRaw !== null) {
      const decoded = decode(currentRaw);
      if (!decoded.state) return failed(decoded.warning);
    }
    const raw = JSON.stringify(nextState);
    // A backup failure aborts before touching the primary. Web Storage setItem
    // is atomic: a failed primary write leaves its previous value intact.
    if (currentRaw !== null) {
      try {
        storage.setItem(CHAMPIONSHIP_BACKUP_KEY, currentRaw);
      } catch {
        return failed('Não foi possível preservar o backup (quota ou acesso). Save principal preservado.');
      }
    }
    try {
      storage.setItem(CHAMPIONSHIP_SAVE_KEY, raw);
    } catch {
      return failed('Não foi possível gravar o campeonato (quota ou acesso). Save anterior preservado.');
    }
    return { ok: true, raw, warning: null };
  } catch {
    return failed('Não foi possível acessar o armazenamento; nada foi gravado.');
  }
}
