# RIFFSHOT RACING

Experiência inicial de corrida e combate veicular para navegador, com identidade própria de hard rock/ficção científica retrô, neon, metal cromado e arte moderna sem pixel art.

**Sinta a batida. Pise fundo. Abra fogo.**

## Tecnologias

- JavaScript
- Phaser 3
- Three.js (garagem, circuitos e câmeras 3D carregados sob demanda)
- Vite

## Estado atual

Primeira experiência visual navegável:

- Abertura animada com logo original **RIFFSHOT RACING** e o slogan oficial; Enter, clique ou toque permitem avançar.
- Menu com **1 JOGADOR**, **CO-OP** e **ONLINE**. Os dois últimos permanecem bloqueados e mostram “Em breve”.
- **Seleção de Personagem** com seis pilotos, retratos procedurais, biografias e atributos; Raze Riot foi substituído por Dax Voltage, técnico de ressonância e engenharia de som.
- **Garagem 3D** com três pinturas cosméticas; o GLB Air Blade aparece somente no desenvolvimento local, enquanto a versão pública exibe ORIGINAL RACER, com plataformas, painéis industriais, iluminação neon e braço mecânico articulado.
- **Estação de Equipe** com painéis holográficos assimétricos, valores reais do campeonato, barra de SCORE, telemetria, piloto e veículo. O próximo rival é explicitamente indicado como em desenvolvimento após a qualificação.
- **Dificuldade Normal/Difícil**, selecionada antes do piloto e mantida durante a sessão.
- **Campeonato local salvo:** recompensas de SCORE e MONEY independentes, limite de oito provas por tentativa, meta por pontos, resultado pendente, reinício confirmado e continuação após recarregar.
- Duas pistas 3D originais, **NEON FURNACE** e **VOLTAGE RUN**, com grid, três bots, física arcade, colisões, checkpoints, quatro voltas, classificação e resultados.
- **START RACE** mostra somente a pista atribuída e CONFIRMAR/VOLTAR; retornar não muda a atribuição. Após concluir uma corrida, o ciclo segue sem repetição até usar as duas pistas, evitando repetição consecutiva entre ciclos.
- Toda corrida inicia em **TERCEIRA PESSOA**, independentemente da câmera usada antes. **C** alterna suavemente com a **ISOMÉTRICA** somente na corrida atual.
- Visual retrofuturista: tipografia metálica, neon e arte procedural, sem pixel art. O modelo externo provisório tem uso restrito a desenvolvimento e testes locais; consulte `CREDITS.md`.
- Trilha sintética original de rock arcade, ativada pela primeira interação, com controle de som.

Fluxo atual: **Abertura → Menu → Dificuldade → Seleção de Personagem → Seleção de Veículo → Estação de Equipe → Pista → Corrida → Resultados**.

O desenvolvimento será incremental, conforme as funcionalidades forem solicitadas e as decisões arquiteturais aprovadas.

## Executar localmente

Requer Node.js 20.19+ da linha 20, ou Node.js 22.12+ (incluindo versões posteriores compatíveis), e npm.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://127.0.0.1:5173`. Para parar o servidor, use `Ctrl+C` no terminal.

No PowerShell com execução de scripts desabilitada, use `npm.cmd` e `npx.cmd` no lugar de `npm` e `npx`; não é necessário alterar a política de segurança do Windows. Reinicie o servidor de desenvolvimento se ele já estava aberto antes da instalação do Three.js.

O GLB local `public/models/cars/air_blade_rock_n_roll_racing.glb` é opcional e serve apenas para testes/desenvolvimento; está ignorado pelo Git. Se estiver disponível em `npm run dev`, a garagem usa esse modelo. Se estiver ausente ou inválido, e sempre no build de produção, é usado um veículo 3D procedural original nas três pinturas. A interface informa qual apresentação está ativa. A garagem exige WebGL 2.

### Controles

| Tela | Controles |
| --- | --- |
| Abertura | Enter, clique ou toque para pular |
| Menu | ↑ / ↓ ou Tab / Shift+Tab para selecionar; Enter ou Espaço para confirmar; mouse e toque também funcionam |
| Dificuldade | ↑ / ↓, mouse ou toque; Enter confirma Normal/Difícil; Escape retorna ao menu |
| Seleção de Personagem | Setas ou mouse/toque para escolher; Enter, Espaço ou **Confirmar** para salvar e avançar; Escape ou **Voltar** retorna ao menu; Tab / Shift+Tab percorrem pilotos e ações |
| Seleção de Veículo | ← / → ou A / D para pintura; mouse/toque nos carros ou cartões; Enter, Espaço ou **CONFIRMAR** inicia a transferência; Escape ou **VOLTAR** retorna aos pilotos; Tab percorre pinturas e ações |
| Estação de Equipe | Mouse/toque nos módulos; setas ou Tab / Shift+Tab navegam; Enter / Espaço ativa; Escape, **VEÍCULO** ou **SAIR / VOLTAR** retorna à garagem; **START RACE** abre a seleção de pista |
| Pista atribuída | Somente CONFIRMAR e VOLTAR; Enter confirma, Tab percorre as ações, Escape volta sem novo sorteio |
| Corrida | W / ↑ acelera; S / ↓ freia e, perto da parada, dá ré; A / ← vira à esquerda do carro, D / → à direita; Espaço usa freio de mão; C alterna câmera; Escape ou EQUIPE retorna sem consumir a pista |
| Resultados | Tab/setas escolhem ação; Enter confirma. No fracasso 8/8, REINICIAR DESAFIO confirma o reset; MENU/Escape preserva o resultado pendente. Após atingir a meta, VER EQUIPE retorna com dinheiro/melhorias preservados |
| Som | **M** ou botão de som no canto inferior esquerdo ativa/silencia a trilha |

## Personagens e atributos

Os dados ficam em `src/data/characters.js`. Cada piloto possui um `id` estável, nome, perfil, descrição, configuração visual do retrato e um objeto `stats`. A lista `ATTRIBUTES` centraliza chaves, rótulos e finalidade futura dos atributos, evitando números e nomes espalhados na interface.

| Piloto | Perfil | Velocidade | Aceleração | Controle | Resistência | Agressividade/contato |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Vera Volt | Equilibrada | 6 | 6 | 6 | 6 | 6 |
| Kira Comet | Velocidade | 9 | 8 | 5 | 4 | 4 |
| Echo-7 | Precisão | 5 | 6 | 9 | 6 | 4 |
| Atlas Knox | Resistência | 4 | 3 | 5 | 10 | 8 |
| Dax Voltage | Engenharia de som | 6 | 5 | 4 | 6 | 9 |
| Zuri Spark | Arrancada | 6 | 10 | 7 | 3 | 4 |

Todos têm 30 pontos, numa escala de **1 a 10**. Esses valores são ratings de design, não km/h. Na corrida, velocidade, aceleração, controle e resistência modulam os parâmetros arcade de condução/impacto; agressividade modula o impulso no contato entre veículos e está preparada para sistemas ofensivos futuros.

Apenas **confirmar** altera a escolha canônica de piloto no campeonato. O Registry do Phaser recebe uma projeção dos IDs para as cenas existentes. Navegar pelos retratos ou cancelar não substitui a escolha confirmada; piloto, veículo, pintura e dificuldade são persistidos localmente. Com escolhas completas, 1 JOGADOR mostra CONTINUAR e abre a equipe (ou o resultado pendente); antes disso mantém o fluxo dificuldade → piloto → veículo.

Os controladores de jogador e bots consultam os ratings sem depender da interface de seleção.

## Garagem, veículo e estado do campeonato

`src/data/vehicles.js` centraliza o modelo, o material pintável, as três pinturas e os atributos-base:

| Versão | Cor | Velocidade | Aceleração | Controle | Resistência |
| --- | --- | ---: | ---: | ---: | ---: |
| INFERNO | `#E53935` | 75 | 70 | 65 | 60 |
| NEON | `#1677FF` | 75 | 70 | 65 | 60 |
| VOLT | `#FFD027` | 75 | 70 | 65 | 60 |

A escala-base é 0–100. As pinturas são cosméticas e não alteram os atributos. O veículo usa física arcade; o piloto aplica os modificadores documentados no código. As confirmações passam pelo serviço de campeonato e persistem veículo/pintura; o Registry expõe os mesmos IDs para compatibilidade, sem duplicar carteira ou pontuação. O GLB Air Blade é somente local; a versão pública usa **ORIGINAL RACER** procedural.

`src/championship/Championship.js` é o único serviço compartilhado pelas cenas. `championshipState.js` implementa transições puras e validação; `championshipStorage.js` é o adaptador local. `src/data/raceState.js` apenas lê esse estado canônico para o painel. O início mantém o saldo anterior de **$ 2.000**, divisão **B**, zero corridas e SCORE zero; os exemplos de referência não substituem esses dados reais.

## Corridas implementadas

`src/data/raceTracks.js` contém duas pistas fechadas originais: **NEON FURNACE** (indústria e neon vermelho/laranja) e **VOLTAGE RUN** (noite, curvas técnicas e trechos elevados azul/violeta). O traçado central também define superfície, bordas, largura e checkpoints ordenados.

Ao escolher **1 JOGADOR**, a tela Normal/Difícil vem antes do piloto. `src/data/raceDifficulty.js` centraliza os parâmetros da IA: antecipação, resposta de direção, erro de trajetória e desejo de ultrapassagem. Dificuldade não aumenta o limite físico de velocidade.

Cada corrida tem quatro participantes — jogador e três bots — e quatro voltas. A física arcade independente calcula aceleração, freio/reversa, direção, inércia lateral, colisão entre carros e contato com barreiras. Checkpoints sequenciais validam volta e chegada; classificação e resultados vêm do estado simulado. W/↑ acelera, S/↓ freia ou reverte, A/D ou ←/→ dirigem e Espaço usa o freio de mão.

A chegada registra pista, dificuldade, tempo, colocação, SCORE e MONEY da corrida no campeonato uma única vez. A tela de resultados exibe esse recibo; abrir/voltar/recarregar não aplica prêmios novamente. Compras permanecem desativadas até haver loja real.

### SCORE, MONEY e progressão implementados

**SCORE não é dinheiro:** acumula no desafio, não pode ser gasto e é o único recurso que determina progressão. **MONEY** é saldo independente, disponível para futuras compras; loja e compras reais ainda não existem, portanto esta versão não faz débitos nem simula aquisição de peças.

As recompensas estão centralizadas em `championshipRules.js`:

| Colocação | SCORE | MONEY |
| --- | ---: | ---: |
| 1º | 300 | $ 1.500 |
| 2º | 170 | $ 850 |
| 3º | 70 | $ 400 |
| 4º | 0 | $ 0 |

Cada resultado válido soma os dois recursos e uma corrida, com limite de **8**. A meta inicial é **1.400 SCORE**. O resultado precisa corresponder à prova ativa, pista, dificuldade e piloto, com quatro chegadas válidas; o recibo e o ledger de IDs premiados são salvos no mesmo registro. Provas abandonadas não concedem recompensas nem contam como realizadas. Recarregar durante uma prova não retoma a posição dos veículos: permite reiniciá-la na mesma pista, sem consumir o ciclo.

Ao atingir a meta, inclusive na oitava corrida, o objetivo é marcado como concluído e a vitória aparece nos resultados. MONEY, melhorias e seleções são preservados. **Não há outro rival/divisão implementado:** o jogo informa “Próximo rival em desenvolvimento”, mantém o desafio concluído e não inventa um avanço ou novas provas. Na Estação de Equipe, novo início fica indisponível e identificado; o desafio não reinicia silenciosamente.

Em **8/8 sem a meta**, os resultados e totais permanecem até o jogador clicar **REINICIAR DESAFIO**. Menu e Escape não confirmam o reset. A reinicialização arquiva o resumo/histórico da tentativa, zera MONEY, SCORE, níveis de melhorias e corridas, preserva piloto/veículo/pintura/dificuldade e inicia a próxima tentativa. Melhorias são apenas dados preparados para o futuro; atualmente não podem ser adquiridas.

### Atribuição e exceção de pistas

O campeonato contém pista pendente, ciclo restante, última concluída e histórico da tentativa. Em condições normais há somente CONFIRMAR/VOLTAR: voltar/abandonar/recarregar não sorteia de novo. O ciclo usa todas as pistas antes de renová-las, evitando repetir a última entre ciclos.

Após confirmar o reinício por fracasso, **somente a primeira corrida da nova tentativa** oferece as duas pistas. A disponibilidade e a escolha confirmada sobrevivem ao reload; confirmar/abandonar não consome a exceção. Ela termina quando o primeiro resultado válido é registrado, e o rodízio automático continua a partir da pista utilizada. O histórico da nova tentativa começa vazio; tentativas anteriores ficam arquivadas separadamente.

### Salvamento local e recuperação segura

O save é JSON de **schemaVersion 1** na chave `riffshot-racing:championship:v1`, com revisão, IDs únicos, seleções, carteira, SCORE, corridas, níveis de melhorias, atribuição/ciclo de pistas, tentativas anteriores e recibo pendente. O carregamento valida tipos, IDs e consistência. Antes de substituir um save válido, sua cópia integral anterior é preservada em `riffshot-racing:championship:v1:backup`.

Não existe um formato legado comprovado para migrar. Saves inválidos, versões desconhecidas (incluindo `:v2` no mesmo namespace) e backup órfão sem principal são preservados e bloqueiam gravações automáticas. Não há `localStorage.clear()`, migração inventada ou promoção automática do backup. A interface e o anúncio acessível avisam **PROGRESSO TEMPORÁRIO / NÃO SALVO**; também avisam ao detectar alterações de outra aba. Falhas de acesso/quota mantêm a sessão em memória, sem repetir gravações em loop. Nessa condição, recarregar pode perder as alterações não gravadas.

O backup anterior não é histórico ilimitado, e a comparação antes de gravar reduz conflitos entre abas, mas **não é uma transação multiaba nem proteção contra edição deliberada do save**. Use uma aba de jogo por vez. localStorage é específico da origem: trocar host/porta/domínio ou limpar dados do site não transfere o progresso. Não há autenticação/backend; o adaptador pode futuramente ser substituído pela integração Game-IA.

## Integração Phaser + Three.js

Phaser mantém cenas, controles, simulação e HUD. **Na corrida**, `RaceCanvasLayer` coloca o canvas Three diretamente sob o canvas Phaser transparente, sem cópia ou upload 3D→CanvasTexture por frame. O canvas Three tem `pointer-events: none`; teclado/mouse continuam no Phaser e o botão de som fica acima das duas camadas. O renderer é compartilhado, sem criar outro contexto Three por corrida. O Phaser precisa pedir contexto com alpha no boot, mas as demais telas continuam desenhando seu fundo opaco.

**Garagem e Estação de Equipe** preservam a ponte offscreen anterior (CanvasTexture até 1100×600 e 30 FPS). Ao sair da corrida, o canvas Three é removido do DOM, o CSS da composição é restaurado, eventos/timers e recursos exclusivos são liberados e o renderer volta a servir as prévias offscreen. Carregamentos assíncronos antigos são invalidados antes de montar um mundo/redimensionar o renderer.

`RaceSimulation` mantém timestep fixo de 1/60 s, avançado pelo único loop Phaser; `PlayerController` e `BotController` alimentam a mesma física. Câmeras só leem posições/orientações. O renderer redesenha uma vez por frame Phaser, sem outro `requestAnimationFrame`/`setAnimationLoop`. A corrida usa o relógio monotônico do loop com proteção contra saltos para que suavização de delta da interface não alongue indevidamente a contagem regressiva.

### Câmeras e qualidade visual

`src/data/raceCameras.js` centraliza altura, distância, FOV, resposta e duração de transição; `RaceCameraRig` separa essas regras de apresentação da corrida. A isométrica usa projeção ortográfica e segue o jogador. A terceira pessoa usa FOV de 62° (70° em retrato), altura/distância ajustadas ao tamanho do carro, acompanhamento com atraso e mira adiante. A direção da câmera é suavizada por ângulo e taxa máxima, inclusive em colisões, paradas e giros; não muda os controles do carro. A câmera é uma preferência visual da corrida ativa, não um estado persistente do campeonato; toda prova nova começa em terceira pessoa.

**C** faz uma passagem suave de posição, rotação e projeção. Comandos repetidos são ignorados durante a transição. O HUD informa o modo ativado brevemente. **Cada nova corrida começa em terceira pessoa** e não herda a isométrica da prova anterior. A direção usa apenas a orientação física do veículo: o sinal de A/D foi corrigido no adaptador humano sem alterar o controlador geométrico dos bots. S primeiro freia e então aplica aceleração negativa para a ré; W freia a ré antes de acelerar à frente. O freio não cruza zero por overshoot. Em ré, a mudança de orientação segue naturalmente a cinemática do carro, não uma troca de eixos de câmera.

O sistema de raio recolhe o braço de câmera diante da pista, defensas e estruturas, com limite antes da superfície. É uma prevenção simples, não colisão completa de volume: obstruções parciais e ângulos extremos ainda podem exigir ajuste.

O acabamento das pistas ganhou laterais do tabuleiro elevado, pilares até o chão e plano de chão maior, sem mudar os traçados. A altura visual dos carros foi alinhada à superfície. Os postes/luzes usam instâncias e o mapa/HUD é atualizado a 10 Hz; a câmera e os veículos continuam acompanhando o loop.

### Resolução, fallback e medições

O modo direto limita o framebuffer a **1280×720**, preservando proporção, e o pixel ratio solicitado a **1,25**. O tamanho CSS segue a área real do Phaser, inclusive após resize/orientação. Não há garantia de 60 FPS: é necessário medir em computadores com GPU compatível.

Se a composição alpha não for suportada ou a montagem falhar, usa-se a ponte CanvasTexture anterior. Para diagnóstico ou preferência de compatibilidade, abra o jogo com **`?raceRenderer=texture`** (por exemplo `http://127.0.0.1:5173/?raceRenderer=texture`). A preferência de fallback também pode ser definida no Registry da sessão como `racePresentationMode = 'texture'`. Isso mantém física/câmeras, mas volta a copiar o frame, com custo maior de composição.

Medição local automatizada, **Chromium/ANGLE com SwiftShader (software)**: baseline anterior ~4–5 FPS; rodada atual mediu 9,6 FPS em uma amostra, e 5,1 FPS na composição direta (1152×720, zero cópias) versus 6,5 FPS no fallback (1063×620, 12 cópias na janela medida). As amostras e resoluções diferem; não demonstram ganho comparável nem representam GPU física. O passe Three medido (~0,7 ms) é tempo de submissão em CPU, não tempo de GPU. A otimização confirmada é a remoção das cópias na composição direta; 60 FPS e fluidez contínua ainda precisam de validação manual em hardware real.

`GarageResources` mantém um único renderer por instância do jogo. Desenvolvimento local carrega o GLB Air Blade uma vez; produção usa ORIGINAL RACER procedural. Os quatro carros de uma corrida compartilham a geometria-base e possuem pinturas independentes. Materiais e texturas do GLB nunca são copiados ao build público, nem a animação de suspensão é executada.

O braço acompanha a pré-seleção; ao confirmar, alinha, desce, fecha as garras, ergue o veículo e o transporta lateralmente antes da transição. Durante a transferência, novos comandos ficam bloqueados.

Ao sair da cena, materiais exclusivos, esqueletos, geometria do ambiente e textura de composição são liberados; continua apenas o cache compartilhado, reutilizado na preparação e nos retornos. Ao destruir o jogo, renderer, ambiente e recursos do modelo também são descartados. Carregamentos tardios não montam uma tela que já foi encerrada. `observeGameSize` mantém o canvas e os controles sincronizados com o tamanho real do contêiner, inclusive ao girar a tela em dispositivos móveis.

Para substituir o modelo futuramente, ajuste `modelUrl` e `paintMaterial` em `vehicles.js` e confira a orientação e a região pintável do novo GLB. A normalização de tamanho e as telas de seleção/preparação não dependem dos nomes das malhas do Air Blade.

## Trilha sonora placeholder

**Neon Ignition** é uma composição sintética original de oito compassos a 136 BPM, criada em `src/audio/rockLoop.js`: riff com power chords e distorção, baixo, bumbo, caixa e pratos gerados por síntese e ruído. Não utiliza gravações, músicas comerciais, samples ou transcrições de obras conhecidas.

O loop de aproximadamente 14,1 segundos é renderizado uma vez com `OfflineAudioContext` e reproduzido por uma única fonte no contexto de áudio do Phaser, gerenciada por `src/audio/MenuMusic.js`. Assim, continua entre as telas sem reiniciar ou sobrepor trilhas, e a síntese não roda no loop do jogo.

- O navegador exige interação: antes do primeiro Enter, clique ou toque, a abertura pode ficar silenciosa. O botão **Som: ativar** também inicia o áudio.
- Volume de saída inicial de 18%, com margem de pico e transições suaves ao silenciar; o volume percebido também depende do sistema e dos alto-falantes.
- **M** e o botão de som permitem silenciar; ocultar ou desfocar a página também silencia a saída.
- Se a API não existir ou a geração falhar, a navegação continua normalmente e o botão informa **Som indisponível**.
- A fonte e os listeners globais são liberados ao destruir o jogo.

**Limitação:** esta trilha é um placeholder sintetizado, não uma gravação de guitarra nem uma produção musical final. Nenhum arquivo de áudio externo precisa ser baixado. O módulo pode ser substituído por uma trilha autoral produzida futuramente.

### Build e prévia local

```bash
npm run build
npm run preview
```

A prévia é local, normalmente em `http://127.0.0.1:4173`. O build é gerado em `dist/`, que não é versionado.

O build Vite exclui o GLB Air Blade e emite apenas os recursos revisados e avisos de licença. A verificação de publicação confirma que o modelo não aparece em `dist`.

### Testes de navegador

```bash
npx playwright install chromium
npm test
```

Para uma verificação crítica e curta do build público: intro, menu, dificuldade, piloto, veículo procedural, pista, corrida, aceleração do jogador e ausência do GLB em `dist`:

```bash
npm run test:smoke
npm run test:race
npm run test:camera
npm run test:controls
npm run test:championship
npm.cmd test -- --project=desktop tests/championship-flow.spec.js --retries=0 --max-failures=1
npm.cmd test -- --project=desktop tests/race-flow.spec.js --retries=0 --max-failures=1
```

O smoke test executa um único fluxo desktop com timeout de 60 segundos, zero retries e parada na primeira falha. `npm run test:race`, `npm run test:camera`, `npm run test:controls` e `npm run test:championship` executam testes puros Node sem navegador. Os fluxos Playwright direcionados são `npm run test:championship:flow` e `npm.cmd test -- --project=desktop tests/race-flow.spec.js --retries=0 --max-failures=1`. A suíte completa continua disponível em `npm test`, quando for solicitada. Playwright inicia/encerra servidores isolados nas portas 5183 e 4183 para evitar conflitos com outros projetos.

O Playwright inicia o Vite e a prévia do build automaticamente e verifica abertura, fluxo completo, bloqueios, confirmação/cancelamento de piloto, atributos, retorno, redimensionamento, entradas repetidas e erros de console em Chromium desktop, mobile e paisagem emulados. Também verifica ativação e sinal do áudio, mute, ausência de trilhas duplicadas e navegação sem síntese disponível ou com falha de geração simulada. Inclui navegação no build de produção. As capturas de tela ficam em `test-results/`, ignorado pelo Git. Os testes detalhados importam a URL exata do módulo de entrada usada pela página, inclusive a versão HMR, para inspecionar uma única instância real do Phaser.

`tests/garage.spec.js` cobre carregamento local, recoloração, fallback, seleção e braço. `tests/race-simulation.unit.js` valida simulação/dificuldades, ambas as pistas e conclusão dos bots. `tests/race-camera.unit.js` verifica enquadramento, transição, obstáculos, ângulos e suavização a 30/60/120 Hz; `tests/track-assignment.unit.js` verifica ciclos, retorno e conclusão idempotente. O fluxo de navegador direcionado cobre duas pistas/câmeras, resize, controles, HUD, resultados, preferência, composição/fallback e retorno à garagem/menu. Para concluir rapidamente a prova no teste, um controlador de teste conduz o jogador pela física real: isso não equivale a validar quatro voltas pilotadas por uma pessoa. Aparelhos físicos, GPU, Safari e Firefox continuam pendentes.

Os testes de campeonato verificam as quatro premiações, SCORE independente de MONEY, chegada idempotente, sucesso antecipado/exato em 8/8, reset somente após confirmação, seleções e exceção de pista persistentes. Também cobrem save v1, backup, corrupção, versão desconhecida, quota, conflito de abas e armazenamento bloqueado. O fluxo específico de navegador usa uma chegada pela simulação real e fixtures de carreira para os limites de sucesso/fracasso; fixtures de melhorias não representam uma loja implementada.

Revise manualmente o enquadramento em toda a rotação, a pintura sob as luzes, o contato das garras com a carroceria e o peso/ritmo da transferência. As capturas automatizadas permitem revisar composição, mas não comprovam a qualidade percebida da animação contínua.

## Estrutura e decisões desta etapa

```text
src/
  main.js                         # Inicialização do Phaser e dimensionamento
  style.css                       # Página que hospeda o canvas
  audio/
    MenuMusic.js                   # Reprodução compartilhada, mute e ciclo de vida
    rockLoop.js                    # Composição sintética original
  data/
    characters.js                  # Seis pilotos, atributos e resolução por ID
    vehicles.js                    # Veículo, pinturas e atributos-base
    raceState.js                   # Acesso de leitura ao campeonato canônico
    raceTracks.js                  # Circuitos e parâmetros visuais
    raceDifficulty.js              # Ajustes de IA Normal/Difícil
    raceCameras.js                 # Configuração de câmera, FOV e suavização
    championshipRules.js           # SCORE/MONEY, meta e limite de corridas
  championship/
    Championship.js                # Serviço único e projeção de IDs para as cenas
    championshipState.js           # Regras puras, resultados e validação
    championshipStorage.js         # Save v1, backup e proteção de versões
  scenes/
    TitleScene.js                 # Apresentação comum e ciclo de vida
    SplashScene.js                 # Abertura e avanço protegido
    MainMenuScene.js               # Modos, seleção e bloqueios
    DifficultySelectionScene.js    # Dificuldade antes do piloto
    CharacterSelectionScene.js     # Seleção, prévia e confirmação do piloto
    GarageScene.js                 # Ponte Phaser/Three e ciclo de vida da prévia
    VehicleSelectionScene.js       # Garagem, pinturas e confirmação mecânica
    RacePreparationScene.js        # Preparação e módulos de navegação
    RaceTrackSelectionScene.js     # NEON FURNACE / VOLTAGE RUN
    RaceScene.js                   # HUD e integração da simulação/rend. 3D
    RaceResultsScene.js            # Classificação dos quatro competidores
    RaceDevelopmentScene.js        # Aviso de corrida em desenvolvimento
  race/
    RaceSimulation.js              # Física arcade, checkpoints e classificação
    BotController.js               # Navegação e decisões dos três bots
    PlayerController.js            # Teclado convertido para input normalizado
    trackMath.js                    # Curvas, projeção e pontos do circuito
    trackAssignment.js             # Pista pendente e ciclos idempotentes de sessão
  ui/
    theme.js                      # Paleta, tipografia e nomes das cenas
    MenuButton.js                 # Botão reutilizável e estado visual
    CharacterCard.js               # Retrato selecionável do elenco
    CharacterDetails.js            # Perfil e barras de atributos
    PreparationModules.js          # Módulos, ícones e indicadores da preparação
    observeGameSize.js             # Sincronização do contêiner e canvas
  visuals/
    logo.js                       # Logo tipográfica original
    characterPortrait.js           # Retratos originais gerados e reutilizados
    RaceBackdrop.js               # Cenário procedural e movimento
    race/
      RaceWorld.js                 # Pista, modelos e iluminação Three.js
      RaceCameraRig.js             # Duas câmeras e transição de projeção
      RaceCanvasLayer.js           # Composição direta sob o HUD Phaser
    garage/
      GarageResources.js           # Renderer e cache compartilhado do GLB
      GarageWorld.js               # Ambiente 3D, plataformas e prévias
      MechanicalArm.js             # Articulação e transferência do veículo
tests/
  navigation.spec.js              # Verificações no navegador real
  characters.spec.js              # Escolha temporária, perfis e responsividade
  audio.spec.js                   # Ativação, mute, sinal e fallback
  garage.spec.js                  # Modelo, pinturas, braço, preparação e recursos
  race-flow.spec.js               # Fluxo da corrida e da tela de resultados
  race-simulation.unit.js         # Física, bots, voltas e ordem em testes Node
  race-camera.unit.js             # Câmeras sem navegador/sem WebGL
  track-assignment.unit.js        # Ciclos e retorno sem novo sorteio
  player-controls.unit.js         # Direção/ré independente da câmera
  championship.unit.js            # Prêmios, tentativas, schema e armazenamento
  championship-service.unit.js    # Integração Registry/save e recarregamento
  championship-flow.spec.js       # Chegada, painel, reload, sucesso e reset
  helpers.js                      # Acesso à instância e monitoramento de erros
```

As telas são cenas independentes do Phaser. `RaceSimulation` calcula o estado em plano X/Z sem importar Phaser ou Three; o Phaser avança esse estado em passos fixos e `RaceWorld` apenas o apresenta. Controladores separados alimentam o mesmo integrador físico. O serviço `Championship` aplica as regras uma vez e grava um estado consistente, enquanto Registry e telas leem projeções desse estado. Nenhuma cena implementa uma carteira ou uma segunda regra de premiação.

A interface é desenhada no canvas do Phaser. A logo e os seis retratos são gerados uma vez e reutilizados; cenário e pista usam geometrias originais. A simulação usa timestep fixo com acumulador e limites de substeps; Three é renderizado dentro do único loop Phaser. Recursos 3D e eventos são liberados ao sair da cena. O layout adapta-se a telas estreitas/baixas e respeita movimento reduzido.

O HTML inclui identificação do canvas e anúncios de tela, mas a navegação visual no canvas ainda não equivale a uma interface de botões HTML totalmente acessível a leitores de tela.

## Diretrizes e assistência de desenvolvimento

- `AGENTS.md`: diretrizes permanentes de arquitetura, qualidade, segurança e comunicação.
- `.opencode/agents/normandy.md`: configuração da Normandy, desenvolvedora sênior de jogos e agente principal do OpenCode.
- `opencode.json`: seleção da Normandy como agente padrão do projeto, sem fixar modelo ou provedor de IA.

## Funcionalidades planejadas — ainda não implementadas

Os itens abaixo são ideias de trabalho futuro; não são funcionalidades disponíveis nesta versão:

- Manter o GLB Air Blade restrito ao desenvolvimento até substituição por recurso original; confirmar/documentar direitos de todos os identificadores antes de qualquer publicação.
- Expandir o campeonato além das duas pistas e quatro voltas por corrida atuais.
- Implementar loja de upgrades/tuning e reparos usando MONEY. Até haver compras reais, os módulos correspondentes ficam desativados e não descontam valores.
- Adicionar veículo e retrato reais do rival; por enquanto, a preparação mostra silhueta e área do rival com indicação de conteúdo futuro.
- Implementar armas, danos, reparos, loja, melhorias e bônus ofensivos; os atributos de condução já afetam o modelo arcade atual.
- Implementar novos rivais/divisões: somente então criar a transição para o próximo desafio, reiniciando SCORE/RACES e preservando MONEY/melhorias. Hoje a vitória termina com aviso de desenvolvimento.
- Adicionar interface de exportação/recuperação de saves e migrações de formatos futuros conhecidos; avaliar integração Game-IA sem criar autenticação própria.
- Validar desempenho e experiência em navegadores e dispositivos físicos, incluindo GPUs móveis e WebGL 2.
- Confirmar disponibilidade de marca e direitos do título RIFFSHOT RACING, nomes/designs do elenco e autoria da música; consulte `CREDITS.md`. O GLB Air Blade não faz parte do build público.
- Fazer revisão independente dos riscos de semelhança da identidade e da Estação de Equipe antes de publicar.

## Integração futura

O jogo será independente, com previsão de disponibilização no catálogo Game-IA. A autenticação central será responsabilidade da plataforma, sem implementação de autenticação própria nesta etapa.

## Assets e originalidade

O projeto não deve utilizar código, sprites, músicas ou outros assets protegidos de jogos existentes sem autorização. Os elementos gráficos são desenhados pelo projeto; isso não certifica exclusividade jurídica nem ausência de semelhança. Consulte `CREDITS.md` para riscos identificados e atribuições.

O GLB provisório informa autoria **Linomig**, origem Sketchfab e licença declarada **CC BY 4.0**. Consulte `CREDITS.md` para atribuição, alterações e limitação de uso local. Essa licença declarada não confirma direitos sobre o design retratado. O GLB está ignorado pelo Git e só pode ser usado localmente; não inclua o arquivo no staging.

O build Vite desativa a cópia automática de `public/` e emite somente o favicon SVG revisado e os avisos de licença de runtime. Em produção o jogo mostra **ORIGINAL RACER** e não solicita o GLB. Confirme que `dist/models/` está ausente antes de publicar. Música sintetizada, logo, retratos e cenário são gerados pelo projeto; fontes são alternativas do sistema, sem arquivos incluídos. Os riscos de direitos e atribuições estão em `CREDITS.md` e `THIRD_PARTY_NOTICES.md`.

### Cloudflare Pages

Configuração ao conectar `leo-leite-dev/project-rock-n-racing-ia`:

- Branch de produção: `main`.
- Diretório raiz: `/` (raiz do repositório).
- Comando de build: `npm run build`.
- Diretório de saída: `dist`.

Este é um site estático Vite; não usar o fluxo de deploy de Workers nem `wrangler deploy`. Criar/conectar o projeto Pages e autorizar a integração GitHub deve ser feito no painel da conta Cloudflare.
