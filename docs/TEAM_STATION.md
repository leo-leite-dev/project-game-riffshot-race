# Estação de Equipe — composição metálica e configurações

## Implementação

A referência local orientou a composição: título laranja em placa de metal, retratos laterais, painel central da carreira, estatísticas segmentadas, dois previews de veículos, cinco módulos e START RACE destacado. **A imagem de referência não é usada como textura nem copiada para a distribuição.** Fundo industrial, lua, correntes, molduras, ícones e título são arte procedural original de `StationArt.ts`, gerada uma vez em Canvas2D e reutilizada pelo cache. É uma recriação por código da composição/estilo, não reprodução pixel a pixel.

- `RacePreparationScene.ts` mantém dados reais, regras e navegação; `StationLayout.ts` contém disposição desktop e adaptação de retrato/paisagem.
- `StationButton.ts` e `StationStats.ts` fornecem molduras, ações e barras segmentadas específicas. Os valores não foram alterados para imitar os números da referência.
- `GarageWorld.ts` mantém renderer compartilhado e modelos atuais. Somente previews da preparação recebem enquadramento próximo e luzes vermelhas/roxas; atlas e pinturas originais são preservados. A miniatura do rival restaura as dimensões do preview vivo após sua captura.
- `openingRival.ts` identifica **Ravik Ferro, O Fundidor**, na apresentação e no primeiro adversário da corrida. Seu rosto original tem cabelo curto, visor parcial grafite, óptica âmbar, cicatrizes e cabos de cobre. Não usa o retrato protegido da referência. Não adiciona piloto jogável nem modifica schema, saldo, pontuação ou atributos físicos.
- Rótulos: MONEY, DIVISÃO, CORRIDAS, PONTUAÇÃO NECESSÁRIA e PONTUAÇÃO ATUAL. Qualificação, farming e prêmio único continuam disponíveis.

## Engrenagem e segurança

O botão textual de apagar foi retirado da interface principal. A engrenagem é um botão HTML de **48×48 px**, somente ícone, com nome acessível **Configurações** e destaque na navegação por teclado.

`StationSettings.ts` monta um diálogo nativo local à estação com som global (o mesmo `MenuMusic`/`audio-state` de M e dos motores), **APAGAR PROGRESSO** com aviso e confirmação nativa existentes, e FECHAR. Não há controles fictícios, segundo mute ou preferências novas no save. Abrir/fechar ou mudar som não grava progresso.

Tab/Shift+Tab ficam no diálogo; Escape fecha e devolve foco à engrenagem. Enter/espaço ativam uma ação sem chegar ao jogo ao fundo. O diálogo começa em FECHAR, não na operação destrutiva. DOM/listeners são removidos no shutdown.

O serviço de exclusão permanece inalterado: somente seus saves/backups são removidos, com proteção de conflito/falhas. Cancelar preserva tudo. Falha mantém a carreira e o painel aberto com aviso; sucesso volta à abertura. Não se usa `localStorage.clear()` nem se promete rollback de eventual remoção parcial.

## Verificação proporcional ao impacto

**Quatro casos distintos de navegador aprovados, zero falhas pendentes e zero ignorados nas seleções aprovadas.** Não foram executados testes unitários funcionais nesta tarefa; sintaxe não entra na contagem. Não se repetiram física, bots, corrida completa, migrações, otimização de GLBs ou toda a suíte Playwright, pois esses comportamentos não foram alterados.

Comandos executados:

```powershell
npx.cmd --no-install playwright test tests/team-station.spec.ts tests/erase-progress.spec.ts --project=desktop --retries=0 --max-failures=1 --timeout=90000
npx.cmd --no-install playwright test tests/team-station.spec.ts --project=desktop --retries=0 --max-failures=1 --timeout=90000
npx.cmd --no-install playwright test tests/team-station.spec.ts --project=desktop --grep "configurações da equipe" --retries=0 --max-failures=1 --timeout=90000
```

Histórico sem retries automáticos:

- Primeiro comando: **2 aprovados**, 1 falha na asserção visual e 1 não executado. Exclusão/cancelamento/reload/isolamento e falha de armazenamento passaram. A asserção tentava usar `getBounds()` num Graphics, sem essa API; corrigida para inspecionar o preview real.
- Segundo: **2 aprovados**, incluindo estação desktop/mobile/paisagem e som/foco/prêmio. Os dois de exclusão não foram repetidos sem necessidade.
- Terceiro: **1 aprovado**, repetição do caso de configurações após acrescentar destaque na engrenagem e verificar abertura por Tab/Enter. Não é um quinto caso distinto.

**Build final aprovado pelo servidor Playwright**, sem repetição posterior da mesma versão. Permanece aviso não impeditivo de chunk acima de 500 kB. Sintaxe nos módulos novos/alterados e `git diff --check` passaram. Nenhuma dependência instalada.

Capturas reais geradas e examinadas:

- `previews-ui/estacao-equipe-desktop.png` — 1664×940.
- `previews-ui/estacao-equipe-mobile.png` — 390×844.
- `previews-ui/estacao-equipe-paisagem.png` — 844×390.
- `previews-ui/estacao-configuracoes-desktop.png`.
- `previews-ui/estacao-configuracoes-mobile.png`.

Usados saves isolados, sem tocar no progresso real. Testes legados afetados tiveram expectativas de retrato/rótulos/bounds atualizadas, mas não foram todos executados; alguns fluxos antigos ainda precisam ser alinhados à separação anterior LOJA/MINHA GARAGEM. A matriz de premiações não foi repetida: o teste desta tela preserva a navegação ao prêmio com o modal fechado.

## Limites

Texturas têm chaves fixas e são geradas somente no primeiro uso; molduras/barras redesenham em layout/interação, não num loop adicional. Isso não é medição de GPU. Viewports emulados/capturas não comprovam desempenho físico, fluidez ou acessibilidade completa do canvas. A interface própria mantém diferenças ilustrativas em relação à referência e usa modelos/pinturas reais.

Não houve commit, push ou deploy desta mudança. Alterações anteriores da garagem e arquivos locais do proprietário foram preservados.
