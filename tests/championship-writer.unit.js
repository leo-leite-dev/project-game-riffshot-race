import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireChampionshipWriter, CHAMPIONSHIP_WRITER_LOCK } from '../src/championship/championshipWriter.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function manager() {
  let busy = false;
  return { request(name, options, callback) {
    assert.equal(name, CHAMPIONSHIP_WRITER_LOCK);
    assert.deepEqual(options, { mode: 'exclusive', ifAvailable: true });
    if (busy) return Promise.resolve(callback(null));
    busy = true;
    return Promise.resolve(callback({ name })).finally(() => { busy = false; });
  } };
}
test('writer: só uma aba tem a lease e outra só entra após liberação explícita', async () => {
  const locks = manager(), events = [];
  const release = acquireChampionshipWriter(locks, () => events.push('first'), () => events.push('fail-first'));
  const second = acquireChampionshipWriter(locks, () => events.push('second'), () => events.push('blocked'));
  await flush();
  assert.deepEqual(events, ['first', 'blocked']);
  second(); release(); await flush();
  const third = acquireChampionshipWriter(locks, () => events.push('third'), () => events.push('fail-third'));
  assert.deepEqual(events, ['first', 'blocked', 'third']);
  third(); await flush();
});
test('writer: ausência da API falha fechada sem iniciar spinlock ou gravar armazenamento', () => {
  let acquired = 0, unavailable = 0;
  const release = acquireChampionshipWriter(null, () => acquired++, () => unavailable++);
  assert.equal(acquired, 0); assert.equal(unavailable, 1); release();
});
for (const mode of ['throw', 'reject']) test(`writer: API ${mode} bloqueia escrita e trata a falha`, async () => {
  let unavailable = 0;
  const release = acquireChampionshipWriter({ request() {
    if (mode === 'throw') throw new Error('Unavailable');
    return Promise.reject(new Error('Unavailable'));
  } }, () => assert.fail('não deve conceder lease'), () => unavailable++);
  await flush(); assert.equal(unavailable, 1); release();
});
test('writer: destruir antes da concessão não reativa uma sessão encerrada', async () => {
  let grant, acquired = 0;
  const release = acquireChampionshipWriter({ request(_name, _options, cb) {
    grant = cb; return Promise.resolve();
  } }, () => acquired++, () => assert.fail('sessão encerrada'));
  release(); grant({}); await flush(); assert.equal(acquired, 0);
});
