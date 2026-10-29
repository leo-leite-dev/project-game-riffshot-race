# Verificação de publicação — créditos e pacote público

## Escopo desta release

Publicação autorizada pelo proprietário da versão acumulada de RIFFSHOT RACING: loja, Thunder Bug, atributos, vida/dano/respawn, rodas, câmeras e motores, com atribuições acessíveis e README atualizado. As verificações de gameplay da etapa anterior estão em [VEHICLE_COMBAT_VERIFICATION.md](VEHICLE_COMBAT_VERIFICATION.md); **não foram reapresentadas como testes novos desta preparação**.

Mudanças próprias desta preparação:

- Botão compartilhado **Créditos e licenças** abre `credits.html` em nova aba. HTML acessível e TXT integral vêm da mesma fonte `THIRD_PARTY_NOTICES.md`; também funcionam no desenvolvimento.
- Atribuição dos cinco autores, títulos, fontes, licença declarada CC BY 4.0 e adaptações, incluindo Fan do Thunder e otimização. Nenhum modelo foi reclassificado como CC0.
- Créditos da trilha Neon Ignition e dos motores/efeitos originais, sem samples externos e sem conceder licença nova ao conteúdo próprio.
- Avisos MIT integrais de Phaser, Three.js e eventemitter3.
- Pacote selecionado em `assets/vehicles/` com cinco GLBs e manifesto de autoria/licença, bytes e SHA-256. Dev/build normais não precisam da pasta privada nem repetem a otimização do Thunder.
- `npm run assets:prepare` regenera explicitamente o pacote a partir dos cinco originais fixos. `referencias-locais/`, `public/models/` histórico, capturas, saves, segredos e saídas locais não são incluídos na publicação.
- README com link de produção, controles/estado atuais, gratuidade/créditos fictícios, atribuições e instruções de build/deploy no padrão do projeto. QR Code/doações permanecem planejados, sem implementação.

## Seleção e resultados atuais

O impacto desta preparação é **créditos, empacotamento e distribuição**; não altera novamente regras físicas ou formato de save. Seguindo AGENTS §11, não foram repetidos bots, campeonatos, física, exclusão de progresso ou toda a suíte Playwright.

| Verificação executada | Aprovados | Falhas | Ignorados |
| --- | ---: | ---: | ---: |
| Contratos do plugin de assets e pacote de release | 12 | 0 | 0 |
| Escape/geração dos créditos da mesma fonte | 2 | 0 | 0 |
| Créditos e pacote distribuído no navegador | 4 | 0 | 0 |
| **Total desta preparação** | **18** | **0** | **0** |

Os 12 casos de assets compreendem oito do plugin e quatro do pacote, incluindo emissão byte a byte, tamanho/hash, origem fixa, métodos, traversal/links e preparação isolada. Os dois casos de créditos validam texto escapado e HTML/TXT consistentes. Os quatro casos de navegador validam conteúdo público/MIT, botão/layout, teclado e integridade dos cinco payloads servidos.

Comandos efetivamente executados:

```powershell
node --import tsx scripts/prepareVehicleAssets.ts
node --import tsx --test --test-timeout=30000 tests/vehicle-assets-plugin.unit.ts tests/release-assets.unit.ts
node --import tsx --test --test-timeout=15000 tests/public-credits.unit.ts
npx.cmd --no-install playwright test tests/public-credits.spec.ts --project=desktop --retries=0 --max-failures=1 --timeout=60000
```

O Playwright teve **4 aprovados em 11,1 s**, sem retries. Usou servidores isolados de dev/preview, sem save real do proprietário; verificou os cinco hashes/tamanhos em URLs de produção local. A página de créditos foi capturada em 1280×800 e 390×844; o botão também foi conferido na largura mínima de 280 px. Isso valida viewports emulados, não aparelhos físicos.

## Build e imagens

**Build aprovado pelo servidor Playwright para a mesma versão da aplicação.** Não repetido depois por mudanças exclusivamente documentais. Permanece aviso não impeditivo sobre chunk maior que 500 kB; não foi suprimido.

Todos os cinco payloads estão abaixo de 25 MiB. Thunder: **25.452.592 bytes (24,27 MiB)**; total do pacote: **53.909.488 bytes**. O original de 28.914.440 bytes não é substituído. Build inclui somente os cinco nomes da allowlist, sem `race_car2.glb` duplicado nem antigos Sci - Fi Buggy/Air Blade.

Capturas reais geradas e examinadas:

- `previews-ui/creditos-desktop.png`
- `previews-ui/creditos-mobile.png`
- `previews-ui/creditos-botao-jogo.png`

Revisão de diff e `git diff --check` sem erros de whitespace. Auditoria direcionada não encontrou credenciais nos arquivos candidatos; valores de autenticação não são registrados. Alterações locais preexistentes de `AGENTS.md` e `.opencode/agents/normandy.md` ficam fora deste commit de publicação.

## Fluxo de publicação

- GitHub: https://github.com/leo-leite-dev/project-rock-n-racing-ia
- Branch: `main`.
- Produção: https://project-rock-n-racing-ia.pages.dev
- Créditos: https://project-rock-n-racing-ia.pages.dev/credits.html
- Cloudflare Pages já integrado ao GitHub: push em `main` aciona `npm run build` e publica `dist`.

Este documento registra as verificações locais antes do push. **A confirmação do deploy específico deve ser consultada no check Cloudflare Pages do commit**, com seu SHA e URL, e na inspeção pública posterior. O check antigo não foi tratado como aprovação da release nova. Nenhum serviço novo, custo obrigatório, fluxo Workers ou autenticação própria foi criado.

## Limites e ressalvas preservados

- Créditos cumprem as atribuições declaradas; não certificam titularidade. As ressalvas de procedência do Race Car/Tasneem e Camaro/Transformers Universe continuam explícitas. O proprietário decidiu manter os modelos e autorizou a publicação.
- Não executada a suíte completa de gameplay nem testes antigos não relacionados. O pacote público e a página de créditos têm cobertura própria; resultados históricos continuam identificados como históricos.
- Sem validação de GPU física, FPS/VRAM, Safari/Firefox ou percepção auditiva dos motores. Capturas não comprovam fluidez.
- Originais privados são necessários apenas para regenerar/inspecionar alguns modelos e experimentos de teste, não para o build normal de um clone público.
