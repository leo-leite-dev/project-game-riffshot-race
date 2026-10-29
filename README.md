# RIFFSHOT RACING

**[Jogar gratuitamente no navegador](https://project-rock-n-racing-ia.pages.dev)**

Experiência inicial de corrida e combate veicular para navegador, com identidade própria de hard rock/ficção científica retrô, neon, metal cromado e arte moderna sem pixel art.

**Sinta a batida. Pise fundo. Abra fogo.**

## Tecnologias

- TypeScript 5.9
- **Migração TypeScript concluída:** o código autoral, os scripts e os testes usam `.ts`. `npm.cmd run typecheck` verifica o projeto em modo estrito; o build Vite permanece uma verificação separada.
- Phaser 3
- Three.js (garagem, circuitos e câmeras 3D carregados sob demanda)
- Vite

## Estado atual

Primeira experiência visual navegável:

- Abertura animada com logo original **RIFFSHOT RACING** e o slogan oficial; Enter, clique ou toque permitem avançar.
- Menu com **1 JOGADOR**, **CO-OP** e **ONLINE**. Os dois últimos permanecem bloqueados e mostram “Em breve”.
- **Seleção de Personagem** com seis pilotos, retratos procedurais, biografias e atributos; Raze Riot foi substituído por Dax Voltage, técnico de ressonância e engenharia de som.
- **Garagem 3D e loja:** seleção inicial de THUNDER BUG, CAMARO e ARMORED CAR; o módulo LOJA / GARAGEM da equipe abre as abas LOJA e MINHA GARAGEM. A loja mantém cinco opções visíveis, incluindo WIDOWMAKER e RACE CAR 2 (bloqueado para a fase 2); adquiridos têm selo **JÁ VENDIDO** e não são selecionáveis. MINHA GARAGEM mostra os adquiridos, inclusive o prêmio do rival, para equipar sem nova cobrança. GLBs com rodas animadas, prévias, plataformas e braço mecânico; a cor escolhida identifica a equipe, preservando os atlas originais dos carros.
- **Estação de Equipe** com placas metálicas, neon vermelho/roxo, título laranja e barras segmentadas; valores reais do campeonato, piloto, veículo e o rival original **Ravik Ferro, O Fundidor**, com WIDOWMAKER. A engrenagem sem texto abre som global e gerenciamento seguro do progresso. Após a qualificação, é possível continuar até oito provas ou escolher um prêmio único; a fase 2 permanece em desenvolvimento. Detalhes em [TEAM_STATION.md](docs/TEAM_STATION.md).
- **Dificuldade Normal/Difícil**, selecionada antes do piloto e mantida durante a sessão.
- **Campeonato local salvo:** recompensas de SCORE e MONEY independentes, compras/inventário, limite de oito provas por tentativa, meta por pontos, resultado pendente, reinício confirmado e continuação após recarregar.
- Duas pistas 3D originais, **NEON FURNACE** e **VOLTAGE RUN**, com grid, três bots, física arcade, colisões, checkpoints, quatro voltas, classificação e resultados.
- **START RACE** mostra somente a pista atribuída e CONFIRMAR/VOLTAR; retornar não muda a atribuição. Após concluir uma corrida, o ciclo segue sem repetição até usar as duas pistas, evitando repetição consecutiva entre ciclos.
- Toda corrida inicia em **TERCEIRA PESSOA**, independentemente da câmera usada antes. **C** alterna suavemente com a **ISOMÉTRICA**; **Z** percorre três aproximações em terceira pessoa, somente na corrida atual.
- Drift natural sob tração, dano por colisão, vida em bolinhas com preenchimento parcial, fumaça, explosão e respawn protegido para jogador e bots; carros com escala visual ×1,3 na corrida.
- Visual retrofuturista: tipografia metálica, neon e arte procedural, sem pixel art.
- Trilha sintética original de rock arcade e perfis de motor sintetizados por veículo, ativados por interação e com controle global de som via M/botão. Escuta dos timbres e desempenho em GPU física ainda precisam de validação.
- **Créditos e licenças:** link no rodapé compartilhado por todos os menus para `./credits.html`, em nova aba, sem recarregar o jogo. A página é gerada de `THIRD_PARTY_NOTICES.md`, com escape do conteúdo Markdown; os avisos completos continuam disponíveis em `THIRD_PARTY_NOTICES.txt`.

Fluxo atual: **Abertura → Menu → Dificuldade → Seleção de Personagem → Seleção de Veículo → Estação de Equipe → Pista → Corrida → Resultados**.

Documentação atual: [loja, inventário e prêmio do rival](docs/VEHICLE_SHOP.md) · [condução, dano, respawn, câmeras e motores](docs/VEHICLE_COMBAT.md). Os documentos distinguem estado implementado, histórico e critérios ainda pendentes de validação; não constituem relatório de testes desta integração.

O jogo é gratuito, sem venda de veículos, itens ou créditos por dinheiro real. MONEY/CR são créditos fictícios obtidos no jogo. Doações opcionais estão planejadas; não há pagamento ou QR Code implementado.

O domínio acima é o endereço de produção. O push em `main` aciona o Cloudflare Pages; o estado do deploy de cada versão aparece no check do commit no GitHub. A preparação de créditos/pacote teve **18 verificações aprovadas** (14 unitárias e 4 casos de navegador), com build e capturas em [RELEASE_VERIFICATION.md](docs/RELEASE_VERIFICATION.md). A migração para TypeScript strict foi verificada com typecheck e build; os testes direcionados mais recentes aprovaram o fluxo de campeonato e os três casos visuais da loja. Esses resultados não equivalem à execução completa das suítes. Os **107 testes unitários e 6 casos de navegador** de [VEHICLE_COMBAT_VERIFICATION.md](docs/VEHICLE_COMBAT_VERIFICATION.md) pertencem à entrega anterior de condução/combate, não a uma reexecução completa nesta release.

O desenvolvimento será incremental, conforme as funcionalidades forem solicitadas e as decisões arquiteturais aprovadas.

## Executar localmente

Requer Node.js 20.19+ da linha 20, ou Node.js 22.12+ (incluindo versões posteriores compatíveis), e npm.

```bash
npm install
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://127.0.0.1:5173`. Para parar o servidor, use `Ctrl+C` no terminal.

No PowerShell com execução de scripts desabilitada, use `npm.cmd` e `npx.cmd` no lugar de `npm` e `npx`; não é necessário alterar a política de segurança do Windows. Reinicie o servidor de desenvolvimento se ele já estava aberto antes da instalação do Three.js.

Os veículos atuais usam os cinco GLBs do pacote selecionado e versionado em `assets/vehicles/`, com fallback procedural. A garagem exige WebGL 2. Desenvolvimento e build normais leem esse pacote, sem precisar de `referencias-locais/` nem executar a otimização de cerca de 30 segundos da etapa anterior. O plugin valida manifesto, tamanho, SHA-256 e estrutura GLB; cada binário deve ter **menos de 25 MiB**. Saves antigos preservam dinheiro, SCORE e progresso; `rift-blaze` agora é apresentado como THUNDER BUG. Consulte [VEHICLE_SHOP.md](docs/VEHICLE_SHOP.md).

`npm run assets:prepare` é uma preparação **explícita**, somente para regenerar o pacote a partir dos cinco originais privados fixos. Não faz parte de `npm run dev` ou `npm run build`. O manifesto registra autor, título, fonte, licença, adaptações, URL pública, bytes e SHA-256. As referências privadas e os modelos históricos em `public/models/` permanecem ignorados e fora da distribuição.

### Controles

| Tela | Controles |
| --- | --- |
| Abertura | Enter, clique ou toque para pular |
| Menu | ↑ / ↓ ou Tab / Shift+Tab para selecionar; Enter ou Espaço para confirmar; mouse e toque também funcionam |
| Dificuldade | ↑ / ↓, mouse ou toque; Enter confirma Normal/Difícil; Escape retorna ao menu |
| Seleção de Personagem | Setas ou mouse/toque para escolher; Enter, Espaço ou **Confirmar** para salvar e avançar; Escape ou **Voltar** retorna ao menu; Tab / Shift+Tab percorrem pilotos e ações |
| Seleção de Veículo / loja | Primeiro ← / → ou A / D escolhe a máquina; Enter avança às cores. Depois, as mesmas teclas escolhem a cor da equipe; Enter compra/equipa conforme saldo, propriedade e bloqueio, e inicia a transferência. Escape volta às máquinas ou, na primeira etapa, à tela anterior. Mouse/toque e Tab também funcionam |
| Estação de Equipe | Mouse/toque nos módulos; setas ou Tab / Shift+Tab navegam; Enter / Espaço ativa; **LOJA / GARAGEM** abre as abas de compra e carros adquiridos; Escape ou **SAIR / VOLTAR** retorna a essa tela; **START RACE** abre a seleção de pista |
| Pista atribuída | Somente CONFIRMAR e VOLTAR; Enter confirma, Tab percorre as ações, Escape volta sem novo sorteio |
| Corrida | W / ↑ acelera; S / ↓ freia e, perto da parada, dá ré; A / ← vira à esquerda do carro, D / → à direita; Espaço usa freio de mão; Shift usa nitro quando disponível (THUNDER BUG); C alterna câmera; Z percorre três aproximações em terceira pessoa; Escape ou EQUIPE retorna sem consumir a pista |
| Resultados | Tab/setas escolhem ação; Enter confirma. No fracasso 8/8, REINICIAR DESAFIO confirma o reset; MENU/Escape preserva o resultado pendente. Após atingir a meta, VER EQUIPE retorna com dinheiro/melhorias preservados |
| Prêmio do rival | Após a qualificação, escolher WIDOWMAKER ou 12.000 créditos encerra o desafio; o carro recebido não troca automaticamente o equipado |
| Som | **M** ou botão de som no canto inferior esquerdo ativa/silencia globalmente trilha e motores; perda de foco/página oculta também silencia |
| Créditos e licenças | Link no canto inferior direito; Tab ou Alt+L para focar, Enter para abrir em nova aba |

## Personagens e atributos

Os dados ficam em `src/data/characters.ts`. Cada piloto possui um `id` estável, nome, perfil, descrição, configuração visual do retrato e um objeto `stats`. A lista `ATTRIBUTES` centraliza chaves, rótulos e finalidade futura dos atributos, evitando números e nomes espalhados na interface.

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

`src/data/vehicles.ts` centraliza cinco veículos, cores de equipe, atributos-base e regras de compra:

| Veículo | Velocidade | Aceleração | Controle | Resistência | Característica |
| --- | ---: | ---: | ---: | ---: | --- |
| THUNDER BUG (`rift-blaze`) | 76 | 84 | 72 | 55 | 2.000 créditos; 2 cargas de nitro, 3 s por carga, pico ×1,35; 4 bolinhas de vida |
| CAMARO (`volt-vector`) | 62 | 76 | 84 | 35 | 800 créditos; sem nitro; 3 bolinhas |
| ARMORED CAR (`iron-bastion`) | 58 | 52 | 56 | 100 | 7.500 créditos; sem nitro; 7 bolinhas |
| RACE CAR 2 (`race-car-2`) | 94 | 92 | 82 | 70 | 15.000 créditos; bloqueado para fase 2; nitro configurado como no Thunder; 5 bolinhas |
| WIDOWMAKER (`widowmaker`) | 88 | 78 | 65 | 90 | 24.000 créditos ou prêmio único do rival; sem nitro; 6 bolinhas |

As cores vermelha (`#E53935`), azul elétrica (`#1677FF`) e amarela (`#FFD027`) identificam equipe/plataforma: os GLBs atuais mantêm seus atlas e não são repintados integralmente. Bots usam a mesma física e o rival conduz WIDOWMAKER. O nome THUNDER BUG preserva o ID histórico `rift-blaze` e a propriedade dos saves.

A escala-base é 0–100, não km/h. Cores são cosméticas. Velocidade, aceleração e controle alimentam a física arcade; resistência aumenta a capacidade de vida, sem segunda redução percentual de dano do veículo. O piloto aplica seus modificadores. Compra/equipamento passam pelo serviço de campeonato, persistindo propriedade e seleção sem duplicar carteira ou pontuação. Reequipar um carro adquirido não cobra novamente; falha ao salvar impede compra/prêmio.

`src/championship/Championship.ts` é o único serviço compartilhado pelas cenas. `championshipState.ts` implementa transições puras e validação; `championshipStorage.ts` é o adaptador local. `src/data/raceState.ts` apenas lê esse estado canônico para o painel. O início mantém o saldo anterior de **$ 2.000**, divisão **B**, zero corridas e SCORE zero; os exemplos de referência não substituem esses dados reais.

## Corridas implementadas

### Histórico: Rift Blaze experimental local — Sci-Fi Buggy

O experimento opt-in com [Sci - Fi Buggy, de TiyaMakes](https://sketchfab.com/3d-models/sci-fi-buggy-085bd97876a64eacbc041299ac945e9c), licença declarada [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), e seu candidato de 27.208.448 bytes são **históricos e superados como apresentação oficial**. Instruções, medições SwiftShader e limitações permanecem em [LOCAL_BUGGY_INSPECTION.md](docs/LOCAL_BUGGY_INSPECTION.md) e [RIFT_BLAZE_OPTIMIZATION.md](docs/RIFT_BLAZE_OPTIMIZATION.md); suas afirmações de produção sem GLB descrevem aquela etapa.

THUNDER BUG usa outro modelo e o derivado sem perdas de **25.452.592 bytes (24,27 MiB)**, contra 28.914.440 bytes do original privado intacto. A distribuição atual contém cinco GLBs distintos; `race_car2.glb` é apenas alias de `race_car.glb`. O buggy antigo e Air Blade não integram o pacote público. Detalhes em [VEHICLE_SHOP.md](docs/VEHICLE_SHOP.md) e [CREDITS.md](CREDITS.md).

### Corridas atuais

`src/data/raceTracks.ts` contém duas pistas fechadas originais: **NEON FURNACE** (indústria e neon vermelho/laranja) e **VOLTAGE RUN** (noite, curvas técnicas e trechos elevados azul/violeta). O traçado central define waypoints, largura, altura visual e checkpoints ordenados; ainda não há tipos de superfície com física própria.

Ao escolher **1 JOGADOR**, a tela Normal/Difícil vem antes do piloto. `src/data/raceDifficulty.ts` centraliza os parâmetros da IA: antecipação, resposta de direção, erro de trajetória e desejo de ultrapassagem. Dificuldade não aumenta o limite físico de velocidade.

Cada corrida tem quatro participantes — jogador e três bots — e quatro voltas. A física arcade independente calcula aceleração, freio/reversa, direção progressiva, inércia lateral e drift sob tração. Um novo impacto na barreira conserva metade da velocidade de entrada, sem repetir essa penalidade a cada passo do mesmo contato. Checkpoints sequenciais validam volta e chegada; classificação e resultados vêm do estado simulado. W/↑ acelera, S/↓ freia ou reverte, A/D ou ←/→ dirigem e Espaço usa o freio de mão. Carro parado não gira no lugar; a resposta da direção cresce com a velocidade.

Colisões causam dano pela aproximação normal, com cooldown de 0,85 s por par de carros. Cada bolinha vale 20 HP e pode ficar parcialmente preenchida no HUD; dano reduz gradualmente aderência/direção, e abaixo de 75% da vida aparece fumaça. Zero HP causa explosão e destruição por 0,8 s, seguida de respawn central, vida cheia, velocidade zero e 1,5 s de proteção. Não há regeneração contínua nem reposição de cargas de nitro. Ré e respawn não rendem progresso extra: o débito de percurso e os gates físicos preservam voltas e chegadas legítimas. Regras e critérios pendentes em [VEHICLE_COMBAT.md](docs/VEHICLE_COMBAT.md).

Em `npm run dev`, **F2** mostra um painel temporário com FPS Three.js, delta/quantidade de passos fixos, posição física e interpolada, correções de barreira/contato e taxa de atualização da câmera. O painel também conta avanços da simulação, atualizações de poses e renders para detectar duplicações. **F3** congela a câmera para comparação; **Shift+F3** volta ao acompanhamento. **F4** desliga contatos entre veículos para comparar a corrida sem colisões; **Shift+F4** os religa. Essas teclas e métricas não são habilitadas no build de produção; o solver continua ligado por padrão.

A chegada registra pista, dificuldade, tempo, colocação, SCORE e MONEY da corrida no campeonato uma única vez. A tela de resultados exibe esse recibo; abrir/voltar/recarregar não aplica prêmios novamente. O módulo VEÍCULO da equipe abre a loja real; upgrades e reparos permanecem indisponíveis.

`docs/GAMEPLAY_REFERENCE.md` separa relatos públicos sobre o clássico de fatos confirmados no código e hipóteses de design. A ROM em `referencias-locais/` não foi aberta, executada, copiada nem adicionada ao Git.

### SCORE, MONEY e progressão implementados

**SCORE não é dinheiro:** acumula no desafio, não pode ser gasto e determina a qualificação. **MONEY** é saldo independente de créditos fictícios usado na compra de veículos dentro do jogo. Carreira nova começa com 2.000 créditos e nenhum carro adquirido; a seleção inicial oferece THUNDER BUG, CAMARO e ARMORED CAR, respeitando o saldo. Upgrades, peças e reparos ainda não podem ser comprados.

As recompensas estão centralizadas em `championshipRules.ts`:

| Colocação | SCORE | MONEY |
| --- | ---: | ---: |
| 1º | 300 | $ 1.500 |
| 2º | 170 | $ 850 |
| 3º | 70 | $ 400 |
| 4º | 0 | $ 0 |

Cada resultado válido soma os dois recursos e uma corrida, com limite de **8**. A meta inicial é **1.400 SCORE**. O resultado precisa corresponder à prova ativa, pista, dificuldade e piloto, com quatro chegadas válidas; o recibo e o ledger de IDs premiados são salvos no mesmo registro. Provas abandonadas não concedem recompensas nem contam como realizadas. Recarregar durante uma prova não retoma a posição dos veículos: permite reiniciá-la na mesma pista, sem consumir o ciclo.

Ao atingir a meta de 1.400 SCORE, inclusive na oitava corrida, o jogador se qualifica para o prêmio. Pode continuar o farming até o limite de oito provas ou encerrar escolhendo **WIDOWMAKER ou 12.000 créditos**, uma única vez. O carro recebido entra no inventário sem trocar o equipado; quem já o possui pode escolher os créditos. Receber o prêmio encerra o desafio e preserva dinheiro/inventário/seleções. **A fase 2 permanece em desenvolvimento:** não há avanço fictício nem novas provas após o encerramento.

Em **8/8 sem a meta**, os resultados e totais permanecem até o jogador clicar **REINICIAR DESAFIO**. Menu e Escape não confirmam o reset. A reinicialização arquiva o resumo/histórico da tentativa, zera MONEY, SCORE, níveis de melhorias e corridas, preserva carros comprados e piloto/veículo/pintura/dificuldade, e inicia a próxima tentativa. Melhorias são apenas dados preparados para o futuro; atualmente não podem ser adquiridas.

### Atribuição e exceção de pistas

O campeonato contém pista pendente, ciclo restante, última concluída e histórico da tentativa. Em condições normais há somente CONFIRMAR/VOLTAR: voltar/abandonar/recarregar não sorteia de novo. O ciclo usa todas as pistas antes de renová-las, evitando repetir a última entre ciclos.

Após confirmar o reinício por fracasso, **somente a primeira corrida da nova tentativa** oferece as duas pistas. A disponibilidade e a escolha confirmada sobrevivem ao reload; confirmar/abandonar não consome a exceção. Ela termina quando o primeiro resultado válido é registrado, e o rodízio automático continua a partir da pista utilizada. O histórico da nova tentativa começa vazio; tentativas anteriores ficam arquivadas separadamente.

### Salvamento local e recuperação segura

Na **Estação de Equipe**, abra a engrenagem **Configurações** e escolha **APAGAR PROGRESSO** para recomeçar desde a abertura. Clique/toque ou use Tab/Shift+Tab e Enter. O navegador pede uma confirmação explícita: cancelar preserva tudo; confirmar apaga o save do campeonato e seus backups, incluindo dinheiro, SCORE, corridas, carros adquiridos, melhorias, histórico e escolhas de piloto/veículo/pintura/dificuldade. A nova carreira começa com os valores iniciais ($ 2.000, SCORE zero e nenhuma escolha confirmada), sem recuperar os dados apagados após recarregar. Não afeta dados de outros projetos nem utiliza `localStorage.clear()`. A exclusão é irreversível; use somente uma aba do jogo. Em conflito ou falha de armazenamento, a equipe e o painel permanecem abertos com aviso. A remoção de várias chaves não é atômica: uma falha intermediária pode deixar parte dos backups já removida, sem reiniciar a carreira em memória ou informar sucesso.

O save é JSON de **schemaVersion 3** na chave estável `riffshot-racing:championship:v1`, com revisão, IDs únicos, seleções, carteira, SCORE, corridas, níveis de melhorias, inventário `ownedVehicleIds`, escolha única `rivalRewardChoice`, atribuição/ciclo de pistas, tentativas anteriores e recibo pendente. Saves v1/v2 válidos são migrados conservadoramente, preservando progresso e concedendo o carro já selecionado sem cobrança retroativa; o ID legado `rift-blaze` agora apresenta THUNDER BUG. O original só é substituído numa gravação normal, com backup anterior preservado.

Saves inválidos, versões desconhecidas (incluindo `:v2` no mesmo namespace) e backup órfão sem principal são preservados e bloqueiam gravações automáticas. Não há `localStorage.clear()` ou promoção automática do backup. A interface e o anúncio acessível avisam **PROGRESSO TEMPORÁRIO / NÃO SALVO**; também avisam ao detectar alterações de outra aba. Falhas de acesso/quota mantêm a sessão em memória, sem repetir gravações em loop. Nessa condição, recarregar pode perder as alterações não gravadas.

O backup anterior não é histórico ilimitado. Web Locks concede a uma única aba a permissão de gravar; outra aba fica temporária, sem comprar, receber prêmio ou apagar. Sem Web Locks, a economia bloqueia essas operações com aviso. Isso não protege contra edição deliberada do save; use uma aba por vez. localStorage é específico da origem: trocar host/porta/domínio ou limpar dados do site não transfere o progresso. Não há autenticação/backend; o adaptador pode futuramente ser substituído pela integração Game-IA. Regras e limitações em [VEHICLE_SHOP.md](docs/VEHICLE_SHOP.md).

## Integração Phaser + Three.js

Phaser mantém cenas, controles, simulação e HUD. **Na corrida**, `RaceCanvasLayer` coloca o canvas Three diretamente sob o canvas Phaser transparente, sem cópia ou upload 3D→CanvasTexture por frame. O canvas Three tem `pointer-events: none`; teclado/mouse continuam no Phaser e o botão de som fica acima das duas camadas. O renderer é compartilhado, sem criar outro contexto Three por corrida. O Phaser precisa pedir contexto com alpha no boot, mas as demais telas continuam desenhando seu fundo opaco.

**Garagem e Estação de Equipe** preservam a ponte offscreen anterior (CanvasTexture até 1100×600 e 30 FPS). Ao sair da corrida, o canvas Three é removido do DOM, o CSS da composição é restaurado, eventos/timers e recursos exclusivos são liberados e o renderer volta a servir as prévias offscreen. Carregamentos assíncronos antigos são invalidados antes de montar um mundo/redimensionar o renderer.

`RaceSimulation` mantém timestep fixo de 1/60 s, avançado pelo único loop Phaser; `PlayerController` e `BotController` alimentam a mesma física. Entre passos, a apresentação interpola posição, direção e velocidade sem alterar o estado físico; o valor suavizado de velocidade também alimenta a mira da câmera. Isso evita que renderizações acima de 60 Hz repitam a última pose. Câmeras só leem poses apresentadas. O renderer redesenha uma vez por frame Phaser, sem outro `requestAnimationFrame`/`setAnimationLoop`.

### Câmeras e qualidade visual

`src/data/raceCameras.ts` centraliza altura, distância, FOV, resposta e duração de transição; `RaceCameraRig` separa essas regras de apresentação da corrida. A isométrica usa projeção ortográfica e segue o jogador. A terceira pessoa usa três aproximações via **Z**, com FOV-base de **62° / 70° / 80°**, altura/distância ajustadas ao tamanho do carro, acompanhamento com atraso e mira adiante. Em retrato, o FOV é adaptado à proporção e à cobertura horizontal necessária para preservar o enquadramento; não é fixo em 70°. A direção da câmera é suavizada por ângulo e taxa máxima, inclusive em colisões, paradas e giros; não muda os controles do carro. A câmera é uma preferência visual da corrida ativa, não um estado persistente do campeonato; toda prova nova começa em terceira pessoa.

**C** faz uma passagem suave de posição, rotação e projeção. Comandos repetidos são ignorados durante a transição. O HUD informa o modo ativado brevemente. **Cada nova corrida começa em terceira pessoa** e não herda a isométrica da prova anterior. A direção usa apenas a orientação física do veículo: o sinal de A/D foi corrigido no adaptador humano sem alterar o controlador geométrico dos bots. S primeiro freia e então aplica aceleração negativa para a ré; W freia a ré antes de acelerar à frente. O freio não cruza zero por overshoot. Em ré, a mudança de orientação segue naturalmente a cinemática do carro, não uma troca de eixos de câmera.

O sistema de raio recolhe o braço de câmera diante da pista, defensas e estruturas, com limite antes da superfície. É uma prevenção simples, não colisão completa de volume: obstruções parciais e ângulos extremos ainda podem exigir ajuste.

O acabamento das pistas ganhou laterais do tabuleiro elevado, pilares até o chão e plano de chão maior, sem mudar os traçados. A altura visual dos carros foi alinhada à superfície. Os postes/luzes usam instâncias e o mapa/HUD é atualizado a 10 Hz; a câmera e os veículos continuam acompanhando o loop.

### Resolução, fallback e medições

O modo direto limita o framebuffer a **1280×720**, preservando proporção, e o pixel ratio solicitado a **1,25**. O tamanho CSS segue a área real do Phaser, inclusive após resize/orientação. Não há garantia de 60 FPS: é necessário medir em computadores com GPU compatível.

Se a composição alpha não for suportada ou a montagem falhar, usa-se a ponte CanvasTexture anterior. Para diagnóstico ou preferência de compatibilidade, abra o jogo com **`?raceRenderer=texture`** (por exemplo `http://127.0.0.1:5173/?raceRenderer=texture`). A preferência de fallback também pode ser definida no Registry da sessão como `racePresentationMode = 'texture'`. Isso mantém física/câmeras, mas volta a copiar o frame, com custo maior de composição.

Medição **histórica** local automatizada, **Chromium/ANGLE com SwiftShader (software)**: baseline anterior ~4–5 FPS; naquela rodada foram medidos 9,6 FPS em uma amostra, e 5,1 FPS na composição direta (1152×720, zero cópias) versus 6,5 FPS no fallback (1063×620, 12 cópias na janela medida). As amostras e resoluções diferem; não demonstram ganho comparável nem representam GPU física. O passe Three medido (~0,7 ms) é tempo de submissão em CPU, não tempo de GPU. A otimização confirmada é a remoção das cópias na composição direta; 60 FPS e fluidez contínua ainda precisam de validação manual em hardware real.

Outra rodada Playwright após a revisão de colisões mediu 7,0 FPS em composição direta e 6,5 FPS no fallback (SwiftShader, uma janela por modo). É uma amostra isolada e não prova regressão nem ganho; GPU física continua sem validação.

`GarageResources` mantém um único renderer e cache compartilhado de templates, geometrias e texturas dos cinco GLBs por instância do jogo, com carregamento por subconjunto de veículos. Corridas e prévias usam o mesmo pacote em desenvolvimento e produção; o fallback procedural permanece disponível. Os atlas dos GLBs não recebem pintura global: a cor escolhida identifica a equipe/plataforma.

O braço acompanha a pré-seleção; ao confirmar, alinha, desce, fecha as garras, ergue o veículo e o transporta lateralmente antes da transição. Durante a transferência, novos comandos ficam bloqueados.

Ao sair da cena, materiais exclusivos, esqueletos, geometria do ambiente e textura de composição são liberados; continua apenas o cache compartilhado, reutilizado na preparação e nos retornos. Ao destruir o jogo, renderer, ambiente e recursos do modelo também são descartados. Carregamentos tardios não montam uma tela que já foi encerrada. `observeGameSize` mantém o canvas e os controles sincronizados com o tamanho real do contêiner, inclusive ao girar a tela em dispositivos móveis.

Os atributos ficam no catálogo de veículos; os templates Three.js normalizam os GLBs e preparam os pivôs de rodas. Os arquivos de modelo são distribuídos junto do jogo, sem download de uma fonte externa em tempo de execução. A fábrica procedural atende ao fallback.

## Trilha sonora placeholder

**Neon Ignition** é uma composição sintética original de oito compassos a 136 BPM, criada em `src/audio/rockLoop.ts`: riff com power chords e distorção, baixo, bumbo, caixa e pratos gerados por síntese e ruído. Não utiliza gravações, músicas comerciais, samples ou transcrições de obras conhecidas.

O loop de aproximadamente 14,1 segundos é renderizado uma vez com `OfflineAudioContext` e reproduzido por uma única fonte no contexto de áudio do Phaser, gerenciada por `src/audio/MenuMusic.ts`. Assim, continua entre as telas sem reiniciar ou sobrepor trilhas, e a síntese não roda no loop do jogo.

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

O build Vite emite o aplicativo, favicon, os cinco GLBs do pacote validado, `credits.html` e `THIRD_PARTY_NOTICES.txt`. Não copia `public/` inteira nem lê as referências privadas. A preparação explícita dos modelos é descrita em [VEHICLE_SHOP.md](docs/VEHICLE_SHOP.md).

### Testes proporcionais ao impacto

A política permanente está na seção 11 do `AGENTS.md` e o guia completo em **[`docs/TESTING.md`](docs/TESTING.md)**. Escolha somente os casos relacionados à alteração; os comandos abaixo são opções, **não uma lista para executar inteira**.

| Área | Comando |
| --- | --- |
| Controles | `npm.cmd run test:controls` |
| Câmera, sem atribuição de pistas | `npm.cmd run test:camera:rig` |
| Atribuição de pistas | `npm.cmd run test:tracks` |
| Adaptador visual de veículos | `npm.cmd run test:vehicles` |
| Partículas | `npm.cmd run test:particles` |
| Armazenamento/migração/backup | `npm.cmd run test:save` |
| Exclusão do progresso no serviço | `npm.cmd run test:save:erase` |
| Botão APAGAR PROGRESSO no navegador | `npm.cmd run test:ui:erase` |
| Créditos públicos HTML/TXT, link e teclado | `npm.cmd run test:ui:credits` |
| Integração do buggy local | `npm.cmd run test:vehicles:flow` |
| Fluxo crítico da corrida | `npm.cmd run test:integration:race` |

Refine ainda mais usando `node --test --test-name-pattern="..." arquivo` (opções antes do arquivo) ou Playwright `--grep`. Exemplo: `npm.cmd run test:ui:erase -- --grep "cancelar preserva"`. Para só listar, sem executar testes, build ou servidores: `npm.cmd run test:ui:erase -- --list`.

Os comandos antigos `test:race`, `test:camera`, `test:championship`, `test:championship:flow`, `test:smoke` e `npm test` foram preservados. Os mais amplos não são rotina para pequenas mudanças; consulte o guia antes de escolhê-los. Suíte extensa exige justificativa/aprovação, salvo validação abrangente já solicitada. Nunca executar automaticamente a suíte completa do Playwright.

Mudança visual exige captura real da tela afetada em `previews-ui/`, com fixture isolada e sem usar o save real do proprietário. Mudanças só documentais não exigem build. Código que afeta aplicação/distribuição exige build; quando o Playwright direcionado já o fez para a mesma versão, não repetir sem motivo. A execução de navegador atual inicia servidores isolados nas portas 5183 e 4183; listagem `--list` não inicia esses servidores.

O Playwright inicia o Vite e a prévia do build automaticamente e verifica abertura, fluxo completo, bloqueios, confirmação/cancelamento de piloto, atributos, retorno, redimensionamento, entradas repetidas e erros de console em Chromium desktop, mobile e paisagem emulados. Também verifica ativação e sinal do áudio, mute, ausência de trilhas duplicadas e navegação sem síntese disponível ou com falha de geração simulada. Inclui navegação no build de produção. As capturas de tela ficam em `test-results/`, ignorado pelo Git. Os testes detalhados importam a URL exata do módulo de entrada usada pela página, inclusive a versão HMR, para inspecionar uma única instância real do Phaser.

`tests/garage.spec.ts` mantém a cobertura histórica de seleção em etapas, pinturas, braço mecânico e preparação; suas premissas procedurais devem ser conferidas ao selecionar casos para os GLBs atuais. `tests/race-simulation.unit.ts` verifica atributos, nitro, retorno gradual de velocidade, dano/cooldown, interpolação sem alterar física e conclusão dos bots. `tests/race-camera.unit.ts` verifica enquadramento, transição e obstáculos; `tests/track-assignment.unit.ts` verifica ciclos e retorno. O fluxo de navegador direcionado cobre pistas/câmeras, resize, controles, HUD, resultados e composição. Para concluir rapidamente a prova no teste, um controlador de teste conduz o jogador pela física real: isso não equivale a validar quatro voltas pilotadas por uma pessoa. Aparelhos físicos, GPU, Safari e Firefox continuam pendentes. A validação atual de pacote/créditos e suas expectativas está detalhada em [TESTING.md](docs/TESTING.md).

Os testes de campeonato verificam as quatro premiações, SCORE independente de MONEY, chegada idempotente, sucesso antecipado/exato em 8/8, reset somente após confirmação, seleções e exceção de pista persistentes. Também cobrem save v1, backup, corrupção, versão desconhecida, quota, conflito de abas e armazenamento bloqueado. O fluxo específico de navegador usa uma chegada pela simulação real e fixtures de carreira para os limites de sucesso/fracasso; fixtures de melhorias não representam uma loja implementada.

Revise manualmente o enquadramento em toda a rotação, a pintura sob as luzes, o contato das garras com a carroceria e o peso/ritmo da transferência. As capturas automatizadas permitem revisar composição, mas não comprovam a qualidade percebida da animação contínua.

## Estrutura e decisões desta etapa

```text
assets/
  vehicles/                       # Cinco GLBs selecionados para versionamento
    manifest.json                 # Autoria, fonte, licença, adaptações, bytes e SHA-256
scripts/
  prepareVehicleAssets.ts          # Preparação explícita dos cinco originais privados
  vehicleAssetsPlugin.ts           # Validação/entrega do pacote, sem otimização no build
  publicCreditsPlugin.ts           # Markdown com escape → credits.html e TXT integral
  optimizeThunderBug.ts            # Derivado sem perdas, usado na preparação explícita
  optimizeRiftBlaze.ts              # Rotinas de otimização e histórico do experimento
  localRiftBlazePlugin.ts           # Experimento privado opt-in, fora da produção
THIRD_PARTY_NOTICES.md             # Fonte dos créditos HTML/TXT da distribuição
CREDITS.md                         # Procedência e histórico detalhados
src/
  main.ts                         # Inicialização do Phaser e dimensionamento
  style.css                       # Página que hospeda o canvas
  audio/
    MenuMusic.ts                   # Reprodução compartilhada, mute e ciclo de vida
    rockLoop.ts                    # Composição sintética original
    RaceEngineAudio.ts             # Motores sintetizados, vozes e descarte por corrida
  data/
    characters.ts                  # Seis pilotos, atributos e resolução por ID
    vehicles.ts                    # Cinco veículos, preços, bloqueio e cores de equipe
    raceState.ts                   # Acesso de leitura ao campeonato canônico
    raceTracks.ts                  # Circuitos e parâmetros visuais
    raceDifficulty.ts              # Ajustes de IA Normal/Difícil
    raceCameras.ts                 # Configuração de câmera, FOV e suavização
    championshipRules.ts           # SCORE/MONEY, meta e limite de corridas
  championship/
    Championship.ts                # Serviço único e projeção de IDs para as cenas
    championshipState.ts           # Regras puras, resultados e validação
    championshipStorage.ts         # Schema 3, migração v1/v2, backup e proteção de versões
    championshipWriter.ts          # Permissão exclusiva de gravação por aba (Web Locks)
  scenes/
    TitleScene.ts                 # Apresentação comum e ciclo de vida
    SplashScene.ts                 # Abertura e avanço protegido
    MainMenuScene.ts               # Modos, seleção e bloqueios
    DifficultySelectionScene.ts    # Dificuldade antes do piloto
    CharacterSelectionScene.ts     # Seleção, prévia e confirmação do piloto
    GarageScene.ts                 # Ponte Phaser/Three e ciclo de vida da prévia
    VehicleSelectionScene.ts       # Garagem, pinturas e confirmação mecânica
    RacePreparationScene.ts        # Preparação e módulos de navegação
    RaceTrackSelectionScene.ts     # NEON FURNACE / VOLTAGE RUN
    RaceScene.ts                   # HUD e integração da simulação/rend. 3D
    RaceResultsScene.ts            # Classificação dos quatro competidores
    RivalRewardScene.ts            # Prêmio único: Widowmaker ou créditos fictícios
    RaceDevelopmentScene.ts        # Aviso de corrida em desenvolvimento
  race/
    RaceSimulation.ts              # Física arcade, checkpoints e classificação
    BotController.ts               # Navegação e decisões dos três bots
    PlayerController.ts            # Teclado convertido para input normalizado
    damageMath.ts                  # Capacidade, dano normal e perda gradual de condução
    trackMath.ts                    # Curvas, projeção e pontos do circuito
    trackAssignment.ts             # Pista pendente e ciclos idempotentes de sessão
  ui/
    theme.ts                      # Paleta, tipografia e nomes das cenas
    MenuButton.ts                 # Botão reutilizável e estado visual
    CharacterCard.ts               # Retrato selecionável do elenco
    CharacterDetails.ts            # Perfil e barras de atributos
    PreparationModules.ts          # Módulos, ícones e indicadores da preparação
    observeGameSize.ts             # Sincronização do contêiner e canvas
  visuals/
    logo.ts                       # Logo tipográfica original
    characterPortrait.ts           # Retratos originais gerados e reutilizados
    RaceBackdrop.ts               # Cenário procedural e movimento
    race/
      RaceWorld.ts                 # Pista, modelos e iluminação Three.js
      RaceCameraRig.ts             # Duas câmeras e transição de projeção
      RaceCanvasLayer.ts           # Composição direta sob o HUD Phaser
      VehicleDamageEffects.ts      # Fumaça de dano, explosão e pool por corrida
    garage/
      GarageResources.ts           # Renderer/cache GLB compartilhados e fallback procedural
      GarageWorld.ts               # Ambiente 3D, plataformas e prévias
      MechanicalArm.ts             # Articulação e transferência do veículo
    vehicles/
      vehicleModels.ts             # Allowlist, URLs canônicas e alias Race Car 2
      loadVehicleModels.ts          # Carregamento, inspeção e templates GLB
      VehicleGlbTemplate.ts         # Normalização e separação das rodas dos cinco modelos
      vehicleWheelGeometry.ts       # Seleção de triângulos para rodas/pivôs
      VehicleVisualAdapter.ts       # Rodas assinadas, esterço e animação Fan do Thunder
      TireSmoke.ts                  # Pool de fumaça de pneus independente do dano
      BuggyTemplate.ts              # Template do experimento histórico privado
      BuggyVisualAdapter.ts         # Adaptador do buggy experimental
      loadLocalRiftBlaze.ts          # Carregamento opt-in somente em desenvolvimento
tests/
  navigation.spec.ts              # Verificações no navegador real
  characters.spec.ts              # Escolha temporária, perfis e responsividade
  audio.spec.ts                   # Ativação, mute, sinal e fallback
  garage.spec.ts                  # Modelo, pinturas, braço, preparação e recursos
  race-flow.spec.ts               # Fluxo da corrida e da tela de resultados
  race-simulation.unit.ts         # Física, bots, voltas e ordem em testes Node
  race-camera.unit.ts             # Câmeras sem navegador/sem WebGL
  track-assignment.unit.ts        # Ciclos e retorno sem novo sorteio
  player-controls.unit.ts         # Direção/ré independente da câmera
  championship.unit.ts            # Prêmios, tentativas, schema e armazenamento
  championship-service.unit.ts    # Integração Registry/save e recarregamento
  championship-flow.spec.ts       # Chegada, painel, reload, sucesso e reset
  vehicle-shop.unit.ts            # Compra, propriedade, bloqueio e prêmio único
  championship-writer.unit.ts     # Escrita exclusiva entre abas
  vehicle-models.unit.ts          # Templates, rodas e cache dos modelos oficiais
  vehicle-assets-plugin.unit.ts   # Contratos de entrega e bloqueio do plugin
  release-assets.unit.ts          # Pacote/manifesto, integridade e preparação explícita
  public-credits.spec.ts          # Créditos, link/teclado e integridade do pacote publicado
  race-damage.unit.ts             # Dano, destruição, respawn e integridade de progresso
  vehicle-damage-effects.unit.ts  # Pools, emissão e descarte dos efeitos de dano
  audio.unit.ts                   # Motores e controle global com Web Audio simulado
  vehicle-shop.spec.ts            # Compra, inventário, prêmio e persistência na interface
  vehicle-combat.spec.ts          # Câmeras, dano, rodas, motores e produção com GLBs
  helpers.ts                      # Acesso à instância e monitoramento de erros
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

- Expandir o campeonato além das duas pistas e quatro voltas por corrida atuais.
- Implementar upgrades/tuning e reparos usando MONEY; esses módulos continuam desativados, enquanto a loja de veículos já permite compras com créditos fictícios.
- Adicionar o retrato definitivo e ampliar a apresentação do rival; WIDOWMAKER já aparece como miniatura na equipe e como veículo do rival na corrida.
- Implementar armas, melhorias e bônus ofensivos; colisões, dano, destruição e respawn já integram a corrida atual.
- Implementar novos rivais/divisões e a fase 2. Hoje a qualificação permite farming até oito provas e prêmio único, encerrando com aviso de desenvolvimento.
- Adicionar interface de exportação/recuperação de saves e migrações de formatos futuros conhecidos; avaliar integração Game-IA sem criar autenticação própria.
- Validar desempenho e experiência em navegadores e dispositivos físicos, incluindo GPUs móveis e WebGL 2.
- Avaliar doações opcionais; não há QR Code ou integração de pagamentos nesta versão.
- Confirmar disponibilidade de marca e direitos do título RIFFSHOT RACING, nomes/designs do elenco e autoria da música; consulte `CREDITS.md`.
- Fazer revisão independente dos riscos de semelhança da identidade e da Estação de Equipe, como subsídio às decisões do proprietário.

## Integração futura

O jogo será independente, com previsão de disponibilização no catálogo Game-IA. A autenticação central será responsabilidade da plataforma, sem implementação de autenticação própria nesta etapa.

## Assets e originalidade

O projeto não deve utilizar código, sprites, músicas ou outros assets protegidos de jogos existentes sem autorização. Logo, retratos, interface, garagem, cenários e efeitos adicionados são criações do projeto; os cinco veículos abaixo são modelos de terceiros. Isso não certifica exclusividade jurídica nem ausência de semelhança. Consulte [CREDITS.md](CREDITS.md) para procedência e ressalvas.

### Créditos dos cinco veículos atuais

Todos têm licença **declarada [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)**, não CC0. Os links dos autores e fontes abaixo acompanham os avisos da distribuição.

| Nome no jogo | Autor/uploader declarado | Título e fonte do modelo |
| --- | --- | --- |
| THUNDER BUG | [Chenchanchong](https://sketchfab.com/Chenchanchong) | [race car](https://sketchfab.com/3d-models/race-car-97768c0e69744cd5922ddc5a9fd59266) |
| CAMARO | [Primus03](https://sketchfab.com/Primus03) | [Transformers Universe: Drive-By's Vehicle Form](https://sketchfab.com/3d-models/transformers-universe-drive-bys-vehicle-form-1eee5b31a3dd46ef9b91a95b9261e7f8) |
| ARMORED CAR | [jaack](https://sketchfab.com/jaack) | [Armored car (death race)](https://sketchfab.com/3d-models/armored-car-death-race-ea76bac506f04676b8514951b67994f8) |
| RACE CAR 2 | [Tasneem](https://sketchfab.com/Tasneem) | [Race Car](https://sketchfab.com/3d-models/race-car-517dfa8823394b178c9c313d7e68fb7f) |
| WIDOWMAKER | [Brian Trepanier](https://sketchfab.com/CMBC) | [Widowmaker - Death Race 2000](https://sketchfab.com/3d-models/widowmaker-death-race-2000-15b6eb31787446879f063bb9b25cbc5c) |

As adaptações incluem normalização de escala/orientação, pivôs e animação própria das rodas em memória; o Thunder também recebe otimização sem perdas, preservando a animação original Fan. Os demais binários permanecem inalterados. Detalhes por modelo e condições de atribuição estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), reproduzido em `/credits.html` e no TXT integral.

**Ressalvas de procedência:** o uploader do Race Car usado pelo RACE CAR 2 declara não ser dono da malha; o modelo chamado CAMARO é descrito como extraído de Transformers Universe, da Jagex. As declarações CC BY não comprovam direitos sobre malhas, marcas ou designs de terceiros, nem implicam endosso. “Assets aprovados” significa apenas a **allowlist técnica** de distribuição, não certificação jurídica; as ressalvas permanecem registradas para a decisão do proprietário.

O antigo modelo provisório Air Blade tinha autoria declarada **Linomig**, origem Sketchfab e licença declarada **CC BY 4.0**. Ele foi removido do aplicativo e do repositório; consulte `CREDITS.md` para o histórico de atribuição. Essa licença declarada não confirma direitos sobre o design retratado.

O build Vite desativa a cópia automática de `public/`; os plugins emitem o favicon SVG, cinco GLBs validados, página de créditos e avisos integrais. `referencias-locais/` e `public/models/` histórico não são copiados para `dist`/Cloudflare. O antigo Sci - Fi Buggy e Air Blade ficam fora do pacote distribuído.

**Áudio e software:** Neon Ignition (`src/audio/rockLoop.ts`) e os timbres de `RaceEngineAudio` são sínteses originais, sem samples externos. Fontes tipográficas são alternativas do sistema, sem arquivos de fonte incluídos. Os avisos MIT de **Phaser 3, Three.js e eventemitter3** acompanham a distribuição em HTML e TXT. Cada licença se aplica ao respectivo recurso; estes créditos não alteram nem concedem uma nova licença às criações próprias do projeto.

### Cloudflare Pages

A integração GitHub → Cloudflare Pages já existe para o repositório público [leo-leite-dev/project-rock-n-racing-ia](https://github.com/leo-leite-dev/project-rock-n-racing-ia), na branch `main`. A configuração utilizada é:

- Branch de produção: `main`.
- Diretório raiz: `/` (raiz do repositório).
- Comando de build: `npm run build`.
- Diretório de saída: `dist`.

O endereço de produção é **https://project-rock-n-racing-ia.pages.dev**. Há registro de check bem-sucedido para o commit antigo `4eeafe1` e de preview anterior; isso não comprova deploy desta atualização. O push da versão atual em `main` aciona build/deploy pela integração existente. Confirme o resultado no check Cloudflare Pages do commit e inspecione o endereço público antes de considerar a publicação concluída.

Este é um site estático Vite servido pelo Cloudflare Pages, sem necessidade de Workers, `wrangler deploy`, GitHub Actions adicional ou serviços pagos.
