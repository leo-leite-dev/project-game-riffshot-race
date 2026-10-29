# Referência de jogabilidade: Rock n' Roll Racing

## Escopo e método

Este documento registra o estudo feito para orientar a evolução de RIFFSHOT RACING sem copiar código ou recursos do jogo de referência.

**A ROM local não foi aberta nem executada.** Não houve observação direta do jogo nesta etapa. Também não foram extraídos dados, imagens, sons ou outros recursos dela. As conclusões sobre o clássico são limitadas ao material público citado abaixo; quando a fonte não especifica uma regra, ela está marcada como desconhecida ou hipótese, não como fato.

### Níveis de evidência

- **Fato documentado:** confirmado em fonte primária acessível ou em mais de uma fonte pública independente.
- **Relato secundário:** consta em um guia ou artigo público, mas ainda precisa ser conferido no manual ou numa gravação do SNES.
- **Observação do RIFFSHOT:** comportamento confirmado pela leitura do código ou por teste automatizado do projeto, não do clássico.
- **Hipótese de design:** proposta própria para orientar comparação e implementação; não atribui essa mecânica ao clássico.

### Referências públicas consultadas

1. [Rock n' Roll Racing — Wikipedia, seção Gameplay](https://en.wikipedia.org/wiki/Rock_n%27_Roll_Racing#Gameplay). Fonte secundária; a própria página exibe aviso de que precisa de mais citações. Usada apenas para informações gerais e sempre identificada como relato secundário.
2. [Rock 'N Roll Racing — SNESguide.com](https://www.snesguide.com/games/rock-n-roll-racing/). Guia de fã que resume corrida, armas frontais/traseiras e progressão. Não é documentação oficial.
3. [Rock N' Roll Racing — Games Database](https://www.gamesdatabase.org/game/nintendo-snes/rock-n-roll-racing). Catálogo de jogo que lista um manual SNES e resume o ciclo de armas e melhorias. O PDF do manual excedeu o limite de leitura disponível nesta pesquisa; seu conteúdo não foi usado como se tivesse sido conferido.
4. [Rock n' Roll Racing — GameFAQs](https://gamefaqs.gamespot.com/snes/588623-rock-n-roll-racing). A página de guia não pôde ser acessada durante esta pesquisa (resposta HTTP 403); portanto, não foi usada para confirmar mecânicas específicas.
5. [Canal SNESguide no YouTube](https://youtube.com/channel/UCtCcuoIo4JAEr1DXtPRdv9Q), ligado pela página do jogo. A listagem/vídeo não pôde ser observada quadro a quadro com as ferramentas disponíveis e, por isso, não fundamenta afirmações de jogabilidade neste documento.

Essas fontes não permitem afirmar valores exatos de aceleração, frenagem, aderência, colisão, danos, custos de melhorias ou táticas dos bots. Uma gravação curta do SNES, com modelo do controle e modo de dificuldade, será necessária para comparação perceptiva e para resolver essas lacunas.

---

## A. Dirigibilidade

### O que as fontes permitem afirmar

- **Relato secundário:** quatro participantes disputam corridas de quatro voltas; a visão original é isométrica. O jogador precisa lidar com curvas, subidas e descidas, e pode sair dos limites da pista.
- **Relato secundário:** a condução combina aceleração e navegação de pista com combate; a documentação consultada não descreve curvas numéricas, raio mínimo, frenagem, marcha à ré, derrapagem ou aderência.
- **Ainda não confirmado:** resposta do controle analógico/digital em diferentes velocidades, recuperação de um impacto, comportamento exato das paredes e diferenças quantitativas entre veículos.

### Adaptação proposta para RIFFSHOT RACING

- Manter o estado físico independente das câmeras e ajustar direção, velocidade longitudinal e movimento lateral separadamente.
- Fazer o carro parar de girar quando está parado, tornar a direção progressiva com a velocidade e manter aceleração/frenagem compreensíveis em teclado.
- Tratar a borda como uma resposta física: limitar a penetração, reduzir apenas a velocidade normal contra a parede e preservar o avanço ao longo da pista.
- Adicionar comportamento diferente de superfície e de inclinação somente quando houver uma regra própria claramente testável.

### Situação atual do RIFFSHOT

- `RaceSimulation` calcula a corrida em X/Z com passo fixo de 1/60 s. O valor Y acompanha a altura da pista, mas não altera aceleração nem colisões: subidas, saltos e quedas ainda não são simulação 3D.
- Acelerador, freio e ré são entradas diretas; W/S mantêm o comportamento acordado. O limite de ré é um quarto do limite normal de velocidade.
- Velocidade, aceleração, controle, resistência do veículo e atributos do piloto modificam parâmetros da simulação. A resistência do piloto agora também afeta o dano.
- As duas câmeras compartilham a pose apresentada de posição, direção e velocidade do carro. A terceira pessoa é inicial; C alterna para isométrica.

### Problemas e prioridade

| Prioridade | Problema | Estado nesta etapa |
| --- | --- | --- |
| P0 | A direção aplicava 20% de giro mesmo com velocidade longitudinal zero; o carro podia pivotar parado. | Corrigido: a autoridade de direção chega a zero quando o carro está parado. |
| P0 | A colisão de parede multiplicava os dois componentes da velocidade por 0,58 a cada correção, inclusive o avanço paralelo à borda. Isso podia deixar o carro “colado” na parede e exigir longa recuperação. | Corrigido: reposiciona na borda, remove a velocidade para fora e devolve um pequeno impulso para dentro, preservando a componente tangencial. |
| P1 | A renderização a taxas diferentes da física podia repetir a mesma pose entre passos. | A interpolação visual já está no código existente; a causa foi reproduzida e ganhou teste de regressão nesta etapa. |
| P1 | A força de aceleração/frenagem e os raios de curva são fórmulas arcade próprias, ainda sem comparação visual calibrada com o SNES. | Pendente de gravações comparáveis; evitar afirmar que já reproduzem o clássico. |
| P2 | Altura visual da pista não produz forças, saltos nem quedas. | Pendente; precisa de decisão de design e critério de segurança antes de ampliar a física. |

### Critérios objetivos de aceitação

- Com velocidade longitudinal zero, A/D não altera a orientação; a mesma entrada produz giro crescente entre baixa e alta velocidade.
- A 30, 60, 120 e 144 quadros de apresentação por segundo, um segundo de entrada mantida produz 60 passos físicos e posições dentro da tolerância automatizada de 0,02 unidade.
- Num impacto normal contra a borda, o carro termina dentro do limite; a velocidade longitudinal continua acima de 11 unidades quando chega com 12 e a velocidade normal aponta para o interior da pista.
- Duas câmeras continuam sem alterar posição, controles ou classificação.
- Calibração subjetiva do clássico só será aceita depois de comparar gravações do mesmo trecho, veículo, controle e dificuldade; nenhum valor de referência será inventado.

---

## B. Combate

### O que as fontes permitem afirmar

- **Relato secundário convergente:** os carros podem usar uma arma frontal (descrita como laser/energia ou míssil) e um item traseiro lançável (descrito como óleo escorregadio ou minas/espinhos). O impulso aparece como turbo/nitro ou jatos de salto, conforme equipamento.
- **Relato secundário:** existe capacidade limitada de munição/carga; as fontes consultadas relatam reposição ao completar uma volta e capacidade comprável até sete. A regra merece confirmação no manual/filmagem do SNES antes de ser implementada como especificação exata.
- **Relato secundário:** veículos destruídos reaparecem em poucos segundos com saúde cheia; a penalidade é perder posição/tempo, em vez de ficar permanentemente fora da corrida.
- **Relato secundário:** pistas podem conter minas e pickups de saúde e dinheiro. Ataques que finalizam um rival rendem bônus financeiro.

### Adaptação proposta e situação atual

- Não implementar armas, minas, pickups, destruição nem retorno automático nesta etapa.
- O RIFT BLAZE tem uma habilidade **própria do RIFFSHOT**: duas cargas, três segundos por carga e multiplicador máximo de velocidade 1,35; Shift aciona. O bônus de velocidade retorna gradualmente em um segundo. Isso não é apresentado como reprodução numérica do original.
- A colisão entre carros aplica impulso e dano com cooldown de 0,85 s por par. O IRON BASTION recebe menos dano; resistência de piloto também participa. Saúde não chega a destruir ou recolocar o carro.
- VOLT VECTOR privilegia controle; seus bots escolhem linhas e tentam ultrapassar, mas não usam ataques.

### Problemas, prioridades e aceitação futura

1. **P1 — Diferenciar impacto de destruição:** depois de observação de vídeo, decidir se a corrida usa dano acumulado ou um evento de explosão/retorno; aceitar somente se o jogador reentra em tempo mensurável, mantém progresso da volta e não trava a classificação.
2. **P2 — Cargas e reabastecimento:** conferir no SNES quando recarrega cada arma/impulso. Critério: nenhuma carga extra é concedida fora da regra validada e o HUD mostra cargas restantes.
3. **P2 — Armas e minas originais:** definir efeitos próprios e telemetria antes de implementar. Critério: acerto frontal, item deixado, janela de defesa e cooldown podem ser testados sem usar imagens, nomes ou código do clássico.
4. **P3 — Ataques da IA:** só depois de regras e controles validados. Critério: bots escolhem quando atacar, não atacam sem cargas, evitam desperdiçar disparos contra alvos inelegíveis e continuam pilotando a pista.

---

## C. Pistas

### O que as fontes permitem afirmar

- **Relato secundário:** o jogo usa circuitos isométricos de quatro voltas com desníveis; há risco de sair da pista.
- **Relato secundário:** hazards/pickups citados incluem óleo, neve, lava, minas, saúde e dinheiro. A forma e o comportamento exatos de cada superfície não foram medidos.
- **Ainda não confirmado:** dimensões, coeficientes de aderência, geometria de cada circuito, pontos de recuperação e alcance de saltos. Esta documentação não transcreve mapas ou layouts protegidos.

### Adaptação proposta e situação atual

- RIFFSHOT tem duas pistas próprias, com centerline fechado, largura, alturas visuais, scenery e checkpoints sequenciais.
- `findNearestTrackPoint` escolhe entre amostras discretas da linha central; as barreiras são representadas como limite lateral na física e como meshes/rails na cena.
- Não há tipos de superfície com física distinta, pickups, armadilhas, saltos, recuperação após queda ou alinhamento entre altura visual e gravidade.

### Problemas e critérios de aceitação

- **P1:** uma barreira deve corrigir a posição sem apagar velocidade tangencial — coberto pelo teste novo.
- **P2:** uma pista com superfície diferente precisa ter material e parâmetro físico explícito; teste comprova que muda velocidade/aderência, sem depender de câmera.
- **P2:** qualquer salto ou mudança de nível deve preservar continuidade de posição, altura, colisão e câmera nos dois modos.
- **P3:** obstáculos de combate só devem ser colocados onde houver espaço de reação; medir tempo entre alerta visual e contato em cada dificuldade.

---

## D. Inteligência artificial

### O que as fontes permitem afirmar

- **Relato secundário:** há quatro competidores e adversários controlados pela máquina; a formação/identidade de alguns rivais varia com a fase/planeta.
- **Não documentado pelas fontes acessadas:** curvas por técnica, mira, escolha de alvos, fuga de armas, reação após colisões e regras concretas de dificuldade. Não atribuir ao clássico padrões observados apenas no RIFFSHOT.

### Situação atual e proposta

- `BotController` escolhe ponto de mira por lookahead, linha de ultrapassagem, correção de posição, pequena variação, frenagem em curvas e aceleração.
- Normal/Difícil altera antecipação, velocidade-alvo, tempo de reação e erro de direção. Bots usam o mesmo integrador físico e catálogo de veículos; bots do Rift Blaze podem gastar nitro.
- Não atacam, não procuram pickups e não reagem especificamente a minas, destruição ou danos. Esses comportamentos permanecem para etapas futuras.

### Critérios de aceitação

- Nos testes, os três bots concluem ambas as pistas e dificuldades dentro de 120 s simulados, sem escapar da borda.
- Num cenário controlado de curva, o bot mais rápido reduz velocidade antes do ápice; em reta, mantém a linha e não oscila lateralmente.
- Qualquer futura ação ofensiva deve ter teste de carga, cooldown, escolha do alvo e continuação da navegação.

---

## E. Progressão

### O que as fontes permitem afirmar

- **Relato secundário:** SCORE/pontos e dinheiro servem a funções distintas: pontuação promove entre divisões/planetas; dinheiro financia equipamento e veículos. Os três primeiros colocados recebem pontos e dinheiro.
- **Relato secundário:** a temporada contém uma quantidade de corridas variável conforme planeta/fase; após fracasso, pontos voltam a zero enquanto dinheiro e configuração do veículo permanecem.
- **Relato secundário:** compras citadas incluem motor, pneus, suspensão/amortecedores, proteção, armas e turbo, com categorias de upgrade; comprar modelo diferente pode remover upgrades instalados.
- Não transportar valores de prêmio, temporadas, preços nem teto de nível sem confirmar por manual ou gravação. O valor oito não está sendo tratado como regra do clássico.

### RIFFSHOT atual e diferença intencional

- O campeonato local salva até oito corridas, metas e recompensas próprias, com SCORE separado de MONEY, save versionado e migração. Essas são decisões aprovadas do RIFFSHOT, não uma cópia da estrutura original.
- MONEY ainda não compra motor, pneus ou reparos; upgrades continuam sem loja. Novos rivais/divisões não foram criados.

### Próximas prioridades e critérios de aceitação

1. Confirmar as regras e valores do original com fontes disponíveis antes de usar como referência de balanceamento.
2. Desenhar uma progressão independente do RIFFSHOT. Critério: SCORE controla avanço; MONEY paga compras; reinício/falha não apaga acidentalmente save nem itens já adquiridos.
3. Para cada upgrade, teste compara o atributo antes/depois, valor cobrado, efeito numa corrida e persistência após reload.

---

## Comparação do RIFFSHOT e diagnóstico técnico

| Área | Situação no RIFFSHOT | Diferença/limite que pode reduzir a sensação de jogo completo |
| --- | --- | --- |
| Velocidade | Limite deriva dos ratings; aceleração é força constante por passo, com arrasto simples. | Não há curva de motor/retomada ou calibração com vídeo; números são unidades internas. |
| Freio/ré | Freio reduz velocidade sem cruzar zero; ré entra por aceleração negativa limitada a 25% do limite normal. | Só há uma resposta fixa de freio, sem freio de mão com força de superfície. |
| Direção | Yaw usa velocidade longitudinal, controle do veículo e handling do piloto. | A antiga autoridade mínima permitia girar parado; removida nesta etapa. A escala de curva ainda precisa de validação com gravações. |
| Aderência | Grip controla perda da velocidade lateral; freio de mão reduz grip. | As pistas não aplicam superfície física distinta. |
| Barreira | Antes, cada correção de posição multiplicava X e Z da velocidade por 0,58. | Isso reduzia avanço ao longo da parede e podia parecer carro preso; resposta agora remove componente normal e preserva tangencial. |
| Carro contra carro | Separação de penetração, impulso simples, integridade e cooldown por par. | Não há massas, destruição/respawn ou reação de IA. Centro exatamente coincidente antes era ignorado; agora ganha normal determinística. |
| Pilotos | Speed, acceleration, handling, aggression e endurance são mapeados. | Endurance era calculada mas ignorada pelo dano; agora reduz o dano recebido. O efeito de agressividade continua simplificado e deve ser reavaliado. |
| Câmera | Terceira pessoa suave, isométrica e transição; câmera usa a pose interpolada do jogador. | Um diagnóstico determinístico de 144 renderizações para 60 passos encontrou 84 quadros sem mudança na pose crua e 2 com pose interpolada. Isso explica cadência visual; não prova que toda tremedeira em hardware está resolvida. |
| Bots | Seguem linhas, freiam em curvas e tentam ultrapassar; dificuldade modifica parâmetros. | Não atacam nem reagem às armas do original; não é objetivo desta etapa. |

### Evidência reproduzível de sincronização

O teste em `tests/race-simulation.unit.js` avançou um segundo de aceleração constante em 30, 60, 120 e 144 Hz de render. Todos resultaram em 60 passos físicos e trajetória dentro de 0,02 unidade. Em 144 renderizações, a pose física crua ficou inalterada em 84 amostras, enquanto a pose apresentada interpolada ficou inalterada em 2. A câmera usa posição, direção e velocidade interpoladas; usar velocidade crua enquanto a posição era interpolada podia alterar o look-ahead em degraus nas acelerações e impactos.

Esta é uma medição determinística da aplicação, não uma filmagem do jogo antigo nem uma certificação de fluidez de GPU. Os testes automatizados do navegador neste projeto usam SwiftShader/software em algumas execuções; validação em GPU real ainda é necessária.

### Implementações desta etapa

- Corrigida a resposta contra paredes para preservar velocidade tangencial e devolver uma pequena fração da velocidade normal para dentro da pista.
- Corrigida a direção em baixa velocidade: carro parado não gira no lugar; autoridade cresce com velocidade.
- Corrigida a separação de carros com centros coincidentes para que não atravessem a checagem de colisão.
- Integrada a resistência do piloto ao cálculo do dano recebido.
- Mantida a interpolação da apresentação entre passos fixos e adicionados testes de taxa de quadros, colisão de parede, centro coincidente e giro parado.

## Referências desconhecidas e solicitações úteis

Para a próxima calibração de dirigibilidade, uma gravação de 20–40 segundos em pista, primeiro em reta e depois em uma curva fechada, com veículo, velocidade/dificuldade visíveis, permitiria comparar entrada, giro, impacto e recuperação sem capturar ou reutilizar assets. Para combate, bastam clipes separados de disparo frontal, item traseiro, recarga ao cruzar a linha e destruição/retorno. Não é necessário enviar a ROM.

Até que exista essa observação, armas, minas, superfícies, IA de ataque e regras numéricas de upgrade ficam documentadas como pendências, não como fatos conhecidos.
