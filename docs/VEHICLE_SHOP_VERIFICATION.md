# Verificação da loja e prêmio — 28/10/2026

## Impacto e seleção

Catálogo/modelos, economia persistente, migração de saves, posse/equipamento, prêmio único, qualificação com farming, gravação por uma aba e telas de seleção/loja/equipe/resultado/premiação. A corrida foi aberta apenas para conferir o uso dos GLBs no jogador/rival; não houve alteração da física ou execução indiscriminada de testes de pistas, controles e bots.

**80 casos Node distintos aprovados:** 38 novos de economia, 19 regressões de save, 1 de premiações no serviço, 15 de modelos/allowlist, 1 do catálogo, 5 de lease do escritor e 1 de seleção durante corrida/recibo. O caso de compra bloqueada por corrida/recibo foi repetido após o reforço da seleção e não é somado outra vez. Zero falhas pendentes ou casos ignorados reportados nas seleções finais do Node.

**8 casos Playwright distintos aprovados**, combinando a execução inicial e as repetições direcionadas após mudanças relevantes. Não foi executada a matriz completa de projetos/suítes. Os casos usam o projeto desktop; dentro dos casos de UI afetada, o viewport muda explicitamente para 390×844 para validar/capturar o layout mobile.

## Comandos Node

```powershell
node --import tsx --test --test-timeout=15000 tests/vehicle-shop.unit.ts
node --import tsx --test --test-timeout=15000 --test-name-pattern="^(storage |migração de save|migração desconhecida|versão :v2|nenhum backup|falha no backup|falha no principal|conflito entre abas|save rejeita|schema confere)" tests/championship.unit.ts
node --import tsx --test --test-timeout=15000 --test-name-pattern="^serviço aplica as quatro premiações" tests/championship-service.unit.ts
node --import tsx --test --test-timeout=30000 tests/vehicle-models.unit.ts tests/vehicle-assets-plugin.unit.ts
node --import tsx --test --test-timeout=30000 --test-name-pattern="GLB real armored_car_death_race" tests/vehicle-models.unit.ts
node --import tsx --test --test-timeout=30000 --test-name-pattern="^(loader transforma|destroy descarta|cache retém|fábrica usa)" tests/vehicle-models.unit.ts
node --import tsx --test --test-timeout=15000 --test-name-pattern="^catálogo tem cinco carros, três iniciais e Race Car recebe exatamente duas cargas de nitro$" tests/race-simulation.unit.ts
node --import tsx --test --test-timeout=15000 --test-name-pattern="^(writer:|merge parcial|loja: corrida ativa e recibo)" tests/championship-writer.unit.ts tests/championship.unit.ts tests/vehicle-shop.unit.ts
```

O primeiro teste real de dimensões do Armored teve expectativa numérica corrigida após medição dos vértices reais e passou na repetição direcionada; não se contou a tentativa falha como aprovação. Sintaxe (`node --check`) e whitespace (`git diff --check`) também foram conferidos, sem serem somados como testes funcionais.

## Comandos de navegador e diagnóstico

```powershell
npx.cmd --no-install playwright test tests/vehicle-shop.spec.ts --project=desktop --retries=0 --max-failures=1 --timeout=120000

npx.cmd --no-install playwright test tests/vehicle-shop.spec.ts --project=desktop --grep "Camaro custa|cinco opções|meta antes|oitava corrida|economia entre abas|produção da loja" --retries=0 --max-failures=1 --timeout=120000
```

Histórico sem retries automáticos:

1. Primeira execução: **1 falha de espera, 6 não executados**. O helper aguardava só seis segundos, menos que a transferência real do braço (~7 s). A compra já estava concluída; foi corrigida a espera explícita, sem acelerar/pular a animação.
2. Após o ajuste e melhoria do enquadramento: **7 aprovados**. Revisão das imagens reais encontrou divisão do preview na equipe por redimensionamento compartilhado, não detectada pelos asserts funcionais. Corrigido o tamanho do renderizador após a miniatura; acrescentada asserção de tamanho. Melhorado o layout mobile e a espera da câmera antes de capturar.
3. Repetição dos seis casos afetados/novo: **5 aprovados, 1 falha de preparação**. O caso novo de duas abas abria desnecessariamente duas garagens pesadas em SwiftShader, afetando a espera de fade. Foi reduzido ao serviço na segunda aba, mantendo-a no menu, sem relaxar a regra de economia.
4. Repetido **apenas “economia entre abas”**: **1 aprovado**. Servidores iniciados com configuração temporária em `C:\Users\Sille\AppData\Local\Temp\opencode\rock-racing-existing-build.config.mjs`, herdando a configuração do projeto e substituindo apenas o comando do preview para reutilizar o `dist` já construído da mesma versão:

```powershell
npx.cmd --no-install playwright test tests/vehicle-shop.spec.ts --config "C:\Users\Sille\AppData\Local\Temp\opencode\rock-racing-existing-build.config.mjs" --project=desktop --grep "economia entre abas" --retries=0 --max-failures=1 --timeout=120000
```

Nenhum caso foi marcado como skip para esconder incompatibilidade. Os demais testes não executados pelo filtro não contam como aprovação. Nenhum save real do proprietário foi utilizado.

## Build e capturas

`npm run build` foi executado pelos servidores configurados no Playwright para cada versão com alteração relevante da aplicação. A versão final foi aprovada, incluindo carregamento real dos quatro GLBs no preview em 4183. Não houve repetição de build no último diagnóstico, que alterou somente o preparo do teste. Permanece o aviso não impeditivo de bundle acima de 500 kB. `dist/models/vehicles/` foi conferido e contém apenas os quatro GLBs distintos; Race Car 2 reutiliza Race Car.

Capturas reais produzidas:

- `previews-ui/compra-inicial-desktop.png`
- `previews-ui/compra-inicial-mobile.png`
- `previews-ui/equipe-camaro-mobile.png`
- `previews-ui/loja-fase2-bloqueada-desktop.png`
- `previews-ui/loja-fase2-bloqueada-mobile.png`
- `previews-ui/resultado-meta-farming-desktop.png`
- `previews-ui/equipe-meta-premio-desktop.png`
- `previews-ui/premio-rival-desktop.png`
- `previews-ui/premio-rival-mobile.png`
- `previews-ui/loja-widowmaker-adquirido.png`
- `previews-ui/corrida-modelos-rival.png`
- `previews-ui/loja-producao-bloqueio.png`

Imagens da seleção, bloqueio mobile, equipe desktop/mobile, prêmio mobile, resultado, Widowmaker adquirido e corrida foram abertas para inspeção. As capturas de equipe foram regeneradas e revisadas após corrigir o renderizador compartilhado.

## Limites

- Testes legados diretamente afetados tiveram fixtures/expectativas adaptadas, mas não foram executados todos os specs antigos. Nenhuma suíte completa de gameplay/Playwright foi executada.
- O experimento antigo do buggy depende de um original que não está na pasta atual; essa integração experimental não foi validada aqui.
- Nenhuma medição de FPS em GPU física, telefone real, Safari ou Firefox. SwiftShader e capturas não comprovam fluidez nem animação de rodas.
- Modelos mantêm atlas/texturas originais e rodas estáticas onde não há articulação aprovada. Não se promete repintura da carroceria nesta etapa.
- A fase 2 não está implementada; preço de 15.000 permanece visível, mas Race Car 2 não pode ser comprado/equipado.
- Direitos de redistribuição dos assets exigem revisão antes da publicação, em especial a malha do Race Car e a procedência do arquivo chamado Camaro. Não houve commit, push ou deploy.
