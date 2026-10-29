import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPublicCredits, publicCreditsPlugin } from '../scripts/publicCreditsPlugin.ts';

test('créditos: renderiza texto escapado, títulos, listas e links HTTP sem executar HTML do documento', () => {
  const html = renderPublicCredits('# Créditos\n\n## Modelos\n\n- **Autor**: Exemplo\n- Fonte: https://example.com/model\n\n<script>alert(1)</script>\n\n`Código próprio`');
  assert.ok(html.includes('<html lang="pt-BR">'));
  assert.ok(html.includes('<h2>Modelos</h2>'));
  assert.ok(html.includes('<strong>Autor</strong>'));
  assert.ok(html.includes('href="https://example.com/model"'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<code>Código próprio</code>'));
  assert.ok(html.includes('THIRD_PARTY_NOTICES.txt'));
});

test('créditos: build emite HTML e texto integral da mesma fonte sem copiar referências', async () => {
  const plugin = publicCreditsPlugin() as unknown as {
    configResolved(config: { root: string }): void;
    generateBundle(this: { emitFile(item: { fileName: string; source: string }): void }): Promise<void>;
  };
  const emitted: { fileName: string; source: string }[] = [];
  // fileURLToPath avoids Windows apostrophe/percent-encoding differences.
  const { fileURLToPath } = await import('node:url');
  plugin.configResolved({ root: fileURLToPath(new URL('..', import.meta.url)) });
  await plugin.generateBundle.call({ emitFile: (item: { fileName: string; source: string }) => emitted.push(item) });
  assert.deepEqual(emitted.map(item => item.fileName), ['credits.html', 'THIRD_PARTY_NOTICES.txt']);
  assert.equal(emitted[0].source, renderPublicCredits(emitted[1].source));
  for (const name of ['Chenchanchong', 'Tasneem', 'Primus03', 'jaack', 'Brian Trepanier', 'Neon Ignition', 'Arnout Kazemier']) {
    assert.ok(emitted[0].source.includes(name), name);
  }
});
