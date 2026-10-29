import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireChampionshipWriter, CHAMPIONSHIP_WRITER_LOCK } from '../src/championship/championshipWriter.ts';

const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function manager() {
  let busy = false;
  return { request(name: string, options: LockOptions, callback: LockGrantedCallback<void>) {
    assert.equal(name, CHAMPIONSHIP_WRITER_LOCK);
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (busy) return Promise.resolve(callback(null));
    busy = true;
    const lock: Lock = { name, mode: 'exclusive' };
    return Promise.resolve(callback(lock)).finally(() => { busy = false; });
  } };
}
test('writer: só uma aba tem a lease e outra só entra após liberação explícita', async () => {
  const locks = manager(), events: string[] = [];
  const release = acquireChampionshipWriter(locks as unknown as LockManager, () => events.push('first'), () => events.push('fail-first'));
  const second = acquireChampionshipWriter(locks as unknown as LockManager, () => events.push('second'), () => events.push('blocked'));
  await flush();
  assert.deepEqual(events, ['first', 'blocked']);
  second(); release(); await flush();
  const third = acquireChampionshipWriter(locks as unknown as LockManager, () => events.push('third'), () => events.push('fail-third'));
  assert.deepEqual(events, ['first', 'blocked', 'third']);
  third(); await flush();
});
test('writer: ausência da API falha fechada sem iniciar spinlock ou gravar armazenamento', () => {
  let acquired = 0, unavailable = 0;
  const release = acquireChampionshipWriter(null as unknown as LockManager, () => acquired++, () => unavailable++);
  assert.equal(acquired, 0); assert.equal(unavailable, 1); release();
});
for (const mode of ['throw', 'reject']) test(`writer: API ${mode} bloqueia escrita e trata a falha`, async () => {
  let unavailable = 0;
  const release = acquireChampionshipWriter({ request() {
    if (mode === 'throw') throw new Error('Unavailable');
    return Promise.reject(new Error('Unavailable'));
  } } as unknown as LockManager, () => assert.fail('não deve conceder lease'), () => unavailable++);
  await flush(); assert.equal(unavailable, 1); release();
});
test('writer: destruir antes da concessão não reativa uma sessão encerrada', async () => {
  let acquired = 0;
  let grant: LockGrantedCallback<void> | undefined;
  const release = acquireChampionshipWriter({ request(_name: string, _options: LockOptions, cb: LockGrantedCallback<void>) {
    grant = cb; return Promise.resolve();
  } } as unknown as LockManager, () => acquired++, () => assert.fail('sessão encerrada'));
  release(); grant?.(null); await flush(); assert.equal(acquired, 0);
});
