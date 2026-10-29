import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function inline(value) {
  // This deliberately small renderer only accepts escaped text, emphasis/code
  // and plain HTTP(S) URLs. Source HTML/scripts and arbitrary protocols stay text.
  return escape(value).replace(/https?:\/\/[^\s<>]+/g, raw => {
    const url = raw.replace(/[.,;]+$/, '');
    return `<a href="${url}" rel="noopener noreferrer">${url}</a>${raw.slice(url.length)}`;
  }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function renderPublicCredits(source) {
  const body = [];
  let paragraph = [], list = false;
  const flush = () => {
    if (paragraph.length) { body.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; }
    if (list) { body.push('</ul>'); list = false; }
  };
  for (const line of source.replaceAll('\r\n', '\n').split('\n')) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      body.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (line.startsWith('- ')) {
      if (paragraph.length) { body.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; }
      if (!list) { body.push('<ul>'); list = true; }
      body.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (!line.trim()) flush();
    else { if (list) { body.push('</ul>'); list = false; } paragraph.push(line.trim()); }
  }
  flush();
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="robots" content="noindex">
<link rel="icon" href="./favicon.svg" type="image/svg+xml">
<title>Créditos e licenças | RIFFSHOT RACING</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#080b19;color:#edf7ff;font:16px/1.7 Arial,sans-serif}
header,main,footer{max-width:980px;margin:auto;padding:24px clamp(18px,4vw,40px)}
header{border-bottom:1px solid #365470}header strong{font-size:24px;letter-spacing:2px}
nav{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}a{color:#95e6ee;overflow-wrap:anywhere}
nav a{display:inline-flex;min-height:44px;align-items:center;border:1px solid #365470;padding:6px 12px}
a:focus-visible{outline:2px solid #71f6ff;outline-offset:4px}h1{font-size:28px;line-height:1.3}
h2{margin-top:42px;padding-top:20px;border-top:1px solid #365470;color:#71f6ff;font-size:23px}
h3{font-size:19px;color:#ffbf75;margin-top:30px}p,li{overflow-wrap:anywhere}li{margin-bottom:8px}
code{font-size:.9em;color:#ffbf75}footer{border-top:1px solid #365470;color:#a8b8cb}
</style></head><body>
<header><strong>RIFFSHOT RACING</strong><div>Créditos, autoria e licenças dos recursos utilizados</div>
<nav aria-label="Navegação dos créditos"><a href="./">Abrir o jogo</a><a href="./THIRD_PARTY_NOTICES.txt">Avisos completos em texto</a></nav></header>
<main>${body.join('\n')}</main>
<footer>Esta página acompanha a distribuição do jogo. Créditos não implicam endosso dos autores.</footer>
</body></html>\n`;
}

export function publicCreditsPlugin() {
  let root;
  const source = () => readFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  return {
    name: 'public-credits',
    configResolved(config) { root = config.root; },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0];
        if (!['/credits.html', '/THIRD_PARTY_NOTICES.txt'].includes(path)) { next(); return; }
        if (!['GET', 'HEAD'].includes(request.method)) {
          response.statusCode = 405; response.setHeader('Allow', 'GET, HEAD'); response.end(); return;
        }
        void source().then(text => {
          const html = path === '/credits.html';
          const content = html ? renderPublicCredits(text) : text;
          response.setHeader('Content-Type', `${html ? 'text/html' : 'text/plain'}; charset=utf-8`);
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.setHeader('Cache-Control', 'no-cache');
          response.end(request.method === 'HEAD' ? undefined : content);
        }).catch(() => { response.statusCode = 500; response.end('Créditos temporariamente indisponíveis.'); });
      });
    },
    async generateBundle() {
      const text = await source();
      this.emitFile({ type: 'asset', fileName: 'credits.html', source: renderPublicCredits(text) });
      this.emitFile({ type: 'asset', fileName: 'THIRD_PARTY_NOTICES.txt', source: text });
    },
  };
}
