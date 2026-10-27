# RIFFSHOT RACING

Experiência inicial de corrida e combate veicular para navegador, com identidade própria de hard rock/ficção científica retrô, neon, metal cromado e arte moderna sem pixel art.

**Sinta a batida. Pise fundo. Abra fogo.**

## Tecnologias

- JavaScript
- Phaser 3
- Three.js (apresentação 3D da garagem, carregada sob demanda)
- Vite

## Estado atual

Primeira experiência visual navegável:

- Abertura animada com logo original **RIFFSHOT RACING** e o slogan oficial; Enter, clique ou toque permitem avançar.
- Menu com **1 JOGADOR**, **CO-OP** e **ONLINE**. Os dois últimos permanecem bloqueados e mostram “Em breve”.
- **Seleção de Personagem** com seis pilotos, retratos procedurais, biografias e atributos; Raze Riot foi substituído por Dax Voltage, técnico de ressonância e engenharia de som.
- **Garagem 3D** com três pinturas cosméticas; o GLB Air Blade aparece somente no desenvolvimento local, enquanto a versão pública exibe ORIGINAL RACER, com plataformas, painéis industriais, iluminação neon e braço mecânico articulado.
- **Estação de Equipe** com painéis holográficos assimétricos, temporada, telemetria, piloto, rival provisório, veículo e módulos “Em breve”. Créditos, divisão, corridas e pontuação foram preservados.
- **START RACE** abre somente “Corrida em desenvolvimento”, com retorno à preparação; não existe gameplay de corrida nesta etapa.
- Visual retrofuturista: tipografia metálica, neon e arte procedural, sem pixel art. O modelo externo provisório tem uso restrito a desenvolvimento e testes locais; consulte `CREDITS.md`.
- Trilha sintética original de rock arcade, ativada pela primeira interação, com controle de som.

Fluxo atual: **Abertura → Menu → Seleção de Personagem → Seleção de Veículo → Estação de Equipe → Corrida em desenvolvimento**.

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
| Seleção de Personagem | Setas ou mouse/toque para escolher; Enter, Espaço ou **Confirmar** para salvar e avançar; Escape ou **Voltar** retorna ao menu; Tab / Shift+Tab percorrem pilotos e ações |
| Seleção de Veículo | ← / → ou A / D para pintura; mouse/toque nos carros ou cartões; Enter, Espaço ou **CONFIRMAR** inicia a transferência; Escape ou **VOLTAR** retorna aos pilotos; Tab percorre pinturas e ações |
| Estação de Equipe | Mouse/toque nos módulos; setas ou Tab / Shift+Tab navegam; Enter / Espaço ativa; Escape, **VEÍCULO** ou **SAIR / VOLTAR** retorna à garagem; **START RACE** abre o aviso de desenvolvimento |
| Corrida em desenvolvimento | Enter, Escape ou **VOLTAR** retorna à preparação |
| Som | **M** ou botão de som no canto inferior esquerdo ativa/silencia a trilha |

## Personagens e atributos

Os dados ficam em `src/data/characters.js`. Cada piloto possui um `id` estável, nome, perfil, descrição, configuração visual do retrato e um objeto `stats`. A lista `ATTRIBUTES` centraliza chaves, rótulos e finalidade futura dos atributos, evitando números e nomes espalhados na interface.

| Piloto | Perfil | Velocidade | Aceleração | Controle | Resistência | Agressividade |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Vera Volt | Equilibrada | 6 | 6 | 6 | 6 | 6 |
| Kira Comet | Velocidade | 9 | 8 | 5 | 4 | 4 |
| Echo-7 | Precisão | 5 | 6 | 9 | 6 | 4 |
| Atlas Knox | Resistência | 4 | 3 | 5 | 10 | 8 |
| Dax Voltage | Engenharia de som | 6 | 5 | 4 | 6 | 9 |
| Zuri Spark | Arrancada | 6 | 10 | 7 | 3 | 4 |

Todos têm 30 pontos, numa escala de **1 a 10**. Esses valores são notas de balanceamento, não km/h ou unidades físicas. Os perfis favorecem velocidade máxima, retomada, direção, tolerância a impactos ou eficiência ofensiva; a conversão para parâmetros de corrida será definida quando a simulação existir.

Apenas **confirmar** salva `selectedCharacterId` no registro do Phaser, compartilhado entre cenas. A garagem resolve esse identificador usando `getSelectedCharacter(registry)` e já exibe o piloto escolhido. Navegar pelos retratos ou cancelar não substitui a última escolha confirmada. Ao voltar à seleção, ela é restaurada; recarregar a página limpa a escolha. Não há persistência permanente nesta etapa.

Uma futura cena de corrida poderá importar o mesmo helper e consultar `character.stats`, sem depender da interface. Nenhum efeito físico foi aplicado antecipadamente.

## Garagem, veículo e estado provisório

`src/data/vehicles.js` centraliza o modelo, o material pintável, as três pinturas e os atributos-base:

| Versão | Cor | Velocidade | Aceleração | Controle | Resistência |
| --- | --- | ---: | ---: | ---: | ---: |
| INFERNO | `#E53935` | 75 | 70 | 65 | 60 |
| NEON | `#1677FF` | 75 | 70 | 65 | 60 |
| VOLT | `#FFD027` | 75 | 70 | 65 | 60 |

A escala é 0–100. As pinturas são cosméticas; não alteram desempenho, não aplicam bônus do piloto e não implementam física. A confirmação salva `selectedVehicleId` e `selectedPaintId` no mesmo registro do Phaser que preserva o piloto. Focar uma pintura não altera a escolha já confirmada. Tudo é temporário: recarregar a página limpa as escolhas. Com o GLB local, o protótipo identifica o carro como AIR BLADE; a versão pública usa a designação neutra **ORIGINAL RACER** e geometria procedural original.

`src/data/raceState.js` centraliza os valores provisórios: PLAYER 1, 2.000 créditos, divisão B, 0 de 8 corridas, 1.400 pontos necessários e 0 pontos atuais. Pista, melhorias e reparos mostram “Em breve”; não descontam créditos nem alteram peças ou atributos.

### Integração Phaser + Three.js

Decisão aprovada: Phaser mantém cenas, controles, áudio e interface; Three.js apresenta o modelo GLB e o ambiente da oficina. `GarageScene` faz a ponte. O Three renderiza em um canvas fora do DOM; a imagem é composta no único canvas visível do Phaser por uma `CanvasTexture`. **Não há outro `requestAnimationFrame` nem `setAnimationLoop`.**

A prévia é limitada a 1100×600 pixels e a até 30 renderizações por segundo, independentemente da atualização da interface. A rotação usa tempo decorrido, com proteção contra saltos após pausas; só o carro focado gira na seleção. Com movimento reduzido, a rotação decorativa é mais lenta, mas a transferência mecânica é preservada. As peças estáticas da oficina são agrupadas por material para reduzir chamadas de desenho. A cópia da prévia tem um custo de composição, limitado por esses tetos; FPS em GPU real e dispositivos físicos ainda precisa de avaliação manual.

`GarageResources` mantém um único renderer e um único carregamento do GLB por instância do jogo. As cópias compartilham geometrias, texturas e materiais não pintáveis; seus esqueletos e materiais `AirBladeColor` são independentes. Os mapas PBR e o verniz são preservados. A animação interna “Suspension animation” não é executada. O arquivo original não é alterado.

O braço acompanha a pré-seleção; ao confirmar, alinha, desce, fecha as garras, ergue o veículo e o transporta lateralmente antes da transição. O ciclo dura aproximadamente 6,8 segundos de animação, com aceleração/desaceleração suaves. A duração real pode aumentar em máquinas lentas ou com a aba em segundo plano. Durante a transferência, novos comandos ficam bloqueados.

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

Para uma verificação crítica e curta do build público: intro, menu, seleção de piloto, veículo procedural, Estação de Equipe, retorno e ausência do GLB em `dist`:

```bash
npm run test:smoke
```

O smoke test executa um único fluxo desktop com timeout de 45 segundos, zero retries e parada na primeira falha. A suíte completa (solicitada separadamente) amplia cobertura para desktop, mobile e paisagem. O Playwright inicia e encerra seus próprios servidores nas portas 5173 e 4173; feche uma execução manual de `npm run dev`/`npm run preview` antes de testar. A reutilização só é ativada explicitamente com `PLAYWRIGHT_REUSE_SERVER=1`.

O Playwright inicia o Vite e a prévia do build automaticamente e verifica abertura, fluxo completo, bloqueios, confirmação/cancelamento de piloto, atributos, retorno, redimensionamento, entradas repetidas e erros de console em Chromium desktop, mobile e paisagem emulados. Também verifica ativação e sinal do áudio, mute, ausência de trilhas duplicadas e navegação sem síntese disponível ou com falha de geração simulada. Inclui navegação no build de produção. As capturas de tela ficam em `test-results/`, ignorado pelo Git. Os testes detalhados importam a URL exata do módulo de entrada usada pela página, inclusive a versão HMR, para inspecionar uma única instância real do Phaser.

`tests/garage.spec.js` acrescenta carregamento único do GLB, cores exatas dos materiais, preservação dos materiais mecânicos, esqueletos independentes, seleção nos carros e cartões, rotação exclusiva e delta time a 30/60/120 FPS simulados, fases do braço, trava de confirmação, campanha, módulos futuros sem efeitos, START e retornos. Verifica estabilidade dos recursos após ciclos de navegação, tratamento de GLB inválido e limites de layout em 1440×900, 390×844, 844×390 e 320×568. A emulação mobile não substitui testes em aparelhos físicos ou Safari/Firefox.

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
    raceState.js                   # Estado provisório da preparação
  scenes/
    TitleScene.js                 # Apresentação comum e ciclo de vida
    SplashScene.js                 # Abertura e avanço protegido
    MainMenuScene.js               # Modos, seleção e bloqueios
    CharacterSelectionScene.js     # Seleção, prévia e confirmação do piloto
    GarageScene.js                 # Ponte Phaser/Three e ciclo de vida da prévia
    VehicleSelectionScene.js       # Garagem, pinturas e confirmação mecânica
    RacePreparationScene.js        # Preparação e módulos de navegação
    RaceDevelopmentScene.js        # Aviso de corrida em desenvolvimento
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
    garage/
      GarageResources.js           # Renderer e cache compartilhado do GLB
      GarageWorld.js               # Ambiente 3D, plataformas e prévias
      MechanicalArm.js             # Articulação e transferência do veículo
tests/
  navigation.spec.js              # Verificações no navegador real
  characters.spec.js              # Escolha temporária, perfis e responsividade
  audio.spec.js                   # Ativação, mute, sinal e fallback
  garage.spec.js                  # Modelo, pinturas, braço, preparação e recursos
  helpers.js                      # Acesso à instância e monitoramento de erros
```

As telas são cenas independentes do Phaser, conforme a arquitetura solicitada. A base compartilhada concentra apenas apresentação e limpeza de eventos, evitando duplicação sem antecipar sistemas de gameplay. As transições possuem uma trava para impedir avanços duplicados. Os dados de personagem são independentes da apresentação e da futura física. O registro nativo do Phaser resolve a necessidade de escolha temporária sem adicionar biblioteca de estado ou banco de dados.

A interface é desenhada no canvas do Phaser. A logo e os seis retratos são gerados uma vez e reutilizados; o cenário estático só é redesenhado quando a tela muda de tamanho. O movimento da pista usa delta time. Eventos, temporizadores e texturas de cenário são liberados ao sair de cada cena. O layout adapta escala e composição para telas estreitas ou baixas em paisagem e respeita a preferência de movimento reduzido do sistema.

O HTML inclui identificação do canvas e anúncios de tela, mas a navegação visual no canvas ainda não equivale a uma interface de botões HTML totalmente acessível a leitores de tela.

## Diretrizes e assistência de desenvolvimento

- `AGENTS.md`: diretrizes permanentes de arquitetura, qualidade, segurança e comunicação.
- `.opencode/agents/normandy.md`: configuração da Normandy, desenvolvedora sênior de jogos e agente principal do OpenCode.
- `opencode.json`: seleção da Normandy como agente padrão do projeto, sem fixar modelo ou provedor de IA.

## Roadmap — ainda não implementado

Os itens abaixo são ideias de trabalho futuro; não são funcionalidades disponíveis nesta versão:

- Manter o GLB Air Blade restrito ao desenvolvimento até substituição por recurso original; confirmar/documentar direitos de todos os identificadores antes de qualquer publicação.
- Implementar corrida jogável, pista, física e controles de veículos, colisões, voltas, classificação e adversários.
- Criar sistemas reais de upgrades, reparos, créditos e economia; atualmente os módulos correspondentes só informam “Em breve”.
- Adicionar veículo e retrato reais do rival; por enquanto, a preparação mostra silhueta e área do rival com indicação de conteúdo futuro.
- Integrar os bônus dos pilotos aos atributos do veículo, após definir balanceamento; não há bônus ou alteração dos atributos-base.
- Persistir progresso e escolhas entre sessões e avaliar integração futura com a plataforma Game-IA.
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
