# Condução, dano e apresentação dos veículos

## Estado documentado

Este documento descreve as regras e os componentes integrados. Resultados e capturas da **entrega anterior de condução/combate**, com 107 casos unitários e 6 de navegador distintos aprovados, estão em [VEHICLE_COMBAT_VERIFICATION.md](VEHICLE_COMBAT_VERIFICATION.md). Esse histórico não substitui a verificação própria de pacote/créditos/publicação, registrada em [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md). Economia, inventário, preparação explícita e histórico dos modelos estão em [VEHICLE_SHOP.md](VEHICLE_SHOP.md); autoria e restrições estão em [CREDITS.md](../CREDITS.md) e [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Catálogo e atributos aprovados

`src/data/vehicles.js` é a fonte dos ratings, na escala 0–100; eles não representam km/h. Os IDs são estáveis para preservar saves.

| Veículo / ID | Velocidade | Aceleração | Controle | Resistência | Vida inicial |
| --- | ---: | ---: | ---: | ---: | ---: |
| THUNDER BUG / `rift-blaze` | 76 | 84 | 72 | 55 | 4 bolinhas / 80 HP |
| CAMARO / `volt-vector` | 62 | 76 | 84 | 35 | 3 bolinhas / 60 HP |
| ARMORED CAR / `iron-bastion` | 58 | 52 | 56 | 100 | 7 bolinhas / 140 HP |
| RACE CAR 2 / `race-car-2` | 94 | 92 | 82 | 70 | 5 bolinhas / 100 HP |
| WIDOWMAKER / `widowmaker` | 88 | 78 | 65 | 90 | 6 bolinhas / 120 HP |

THUNDER BUG custa **2.000 créditos** e substitui a apresentação anterior de `rift-blaze`. RACE CAR 2 continua bloqueado para a fase 2; ter atributos, modelo e perfil de áudio definidos não o libera para compra. THUNDER BUG e RACE CAR 2 têm duas cargas de nitro, três segundos por carga e multiplicador máximo ×1,35. Os demais não têm nitro.

Velocidade, aceleração e controle alimentam a mesma física para jogador e bots, com modificadores do piloto. Normal/Difícil altera decisões da IA, não os limites físicos dos veículos.

## Controles e condução arcade

| Comando | Ação |
| --- | --- |
| W / ↑ | Acelerar; primeiro freia se estiver em ré |
| S / ↓ | Frear; perto da parada, engatar ré |
| A / ← e D / → | Virar à esquerda/direita do próprio carro |
| Espaço | Freio de mão |
| Shift | Acionar uma carga disponível de nitro |
| C | Alternar terceira pessoa/isométrica |
| Z | Percorrer PRÓXIMA → MAIS PRÓXIMA → BEM PRÓXIMA, somente em terceira pessoa |
| M / botão de som | Ativar/silenciar globalmente trilha e motores |
| Escape / EQUIPE | Abandonar e retornar à equipe, sem premiar ou consumir a pista |

`RaceSimulation` usa passos fixos de 1/60 s; isso é frequência da simulação, **não uma medição de FPS**. A apresentação interpola poses sem realimentar a física. A direção não gira um carro parado e os comandos não mudam com a câmera.

O drift é natural: a carroceria pode girar antes de a trajetória acompanhar, com correção lateral limitada. Alta velocidade abre a curva; acelerar sob carga de curva reduz aderência traseira, enquanto aliviar e contraesterçar ajudam a recuperar. O freio de mão amplia o deslizamento. Drift sob tração à frente pode compensar perda de velocidade e produzir bônus limitado a 6%; ele não soma ao nitro e desaparece gradualmente. Freio, freio de mão, ré e deslizamento apenas por embalo não ativam esse ganho.

Na barreira, um novo episódio de impacto conserva 50% do módulo da velocidade de entrada e rebate sua componente normal. A penalidade não se repete a cada passo enquanto o mesmo contato permanece; afastar-se ou atingir o lado oposto permite novo impacto. Uma correção de posição enquanto o carro já sai da barreira não aplica essa penalidade.

## Vida e dano por colisão

As regras puras ficam em `src/race/damageMath.js`; o ciclo de vida fica em `RaceSimulation`.

- Capacidade: `3 + floor(clamp(resistência − 20, 0, 80) / 20)` bolinhas; cada uma vale **20 HP**.
- A resistência do veículo aumenta a capacidade, sem aplicar outra redução percentual ao dano. A resistência do piloto reduz o dano de colisão em até 10%.
- Dano bruto: `max(0, velocidade de aproximação normal − 2,5) × 1,2`. Velocidade tangencial não entra nessa fórmula; raspagens lentas não causam dano.
- Entre carros, o intervalo de dano é **0,85 s por par**; separar carros sobrepostos não gera dano por si só. Na parede, o dano é calculado uma vez por episódio de impacto.
- À medida que a vida cai, a aderência pode perder até 35% e a resposta de direção até 25%, proporcionais ao dano acumulado, sem alterar os atributos-base.
- Não há regeneração contínua de vida, compra de reparo ou armas/projéteis nesta implementação. A vida é restaurada no respawn.

O HUD de `RaceScene` desenha a capacidade própria do jogador, incluindo **bolinha parcialmente preenchida**, em vez de arredondar visualmente o dano para unidades inteiras. O texto indica vida, nitro, destruição ou proteção conforme o estado.

## Destruição, respawn e integridade da corrida

1. Ao chegar a zero HP, o carro entra em destruição por **0,8 s**. Movimento, aceleração e controles de condução ficam inativos; o relógio da corrida continua.
2. O nitro ativo é cancelado. As cargas já gastas **não são repostas**; segurar Shift durante a destruição não consome automaticamente outra carga ao retornar.
3. O respawn usa o ponto central mais próximo do circuito, com altura e direção da tangente, vida cheia e velocidade zero. Estados de drift, contato e condução da IA são limpos.
4. Por **1,5 s**, há proteção contra dano e contatos com outros veículos; a apresentação pisca. **Barreiras continuam sólidas**, contendo e rebatendo o carro, mas sem retirar vida durante a proteção. Depois, as regras normais de dano voltam a valer. O motor pode voltar a soar durante a proteção.

Essas regras valem para jogador e bots. Veículos destruídos, protegidos ou que já chegaram não participam dos contatos correspondentes; bots desconsideram obstáculos intangíveis.

O teleporte não concede distância, checkpoint, volta ou chegada. A classificação usa a maior distância conquistada (**high-water mark**) e mantém separado o débito de percurso causado pela ré: voltar a andar sobre esse trecho primeiro paga o débito, inclusive depois de morrer. O respawn só reposiciona a referência geométrica, preservando distância e débito.

Gates continuam sequenciais e exigem cruzamento físico para a frente, dentro da largura. Se a projeção central passar lateralmente do plano esperado, um deslocamento de referência preserva o cruzamento ainda não consumido, exigindo movimento real após o respawn. Um cruzamento físico na integração ou na separação de contato é processado antes do dano letal; checkpoint/chegada legítimos no mesmo passo são preservados, sem contar novamente o trecho já integrado.

## Modelos, rodas, escala e câmeras

`VehicleGlbTemplate` prepara os cinco GLBs oficiais; `VehicleVisualAdapter` anima seus pivôs por instância. A separação de rodas é feita no template, sem processar geometria a cada frame. O giro usa velocidade longitudinal assinada e raio com a escala mundial aplicada uma única vez; esterçamento dianteiro é independente do giro. No Thunder, as pinças esterçam sem girar com os pneus, e o clipe original aprovado **Fan** permanece ativo (101 chaves, 2 s). Outros clipes, skins, morphs e recursos externos continuam bloqueados.

O Widowmaker exige extração por volumes cilíndricos específicos das três malhas mistas: 183.786 triângulos ficam na carroceria e 21.502 nas rodas, sem cortar, duplicar ou remover triângulos. **Pequenas costuras podem aparecer nas bordas durante a animação**; a revisão visual em movimento permanece necessária. As rodas não constituem uma simulação completa de suspensão.

Os modelos são normalizados para comprimento 3,25, chão y=0 e frente +Z. `RaceWorld` aplica **escala visual ×1,3** na corrida, sem aumentar os parâmetros físicos de colisão. Todos os adaptadores oficiais consideram essa escala. Cada prova começa em terceira pessoa; C mantém a transição suave e Z alterna três aproximações somente nesse modo, fora da transição. Zoom e câmera não são progresso persistido. A câmera é reposicionada após o respawn para não percorrer visualmente o teleporte.

As três aproximações usam FOV-base de **62° / 70° / 80°** em `src/data/raceCameras.js`. `RaceCameraRig` adapta o FOV à proporção da tela e à cobertura horizontal necessária, inclusive em retrato; 70° não é um valor fixo para todo retrato. Os GLBs vêm do pacote `assets/vehicles/`, validado por tamanho/SHA-256/estrutura e sem otimização ou leitura das referências privadas no dev/build normal.

## Fumaça e explosão

`VehicleDamageEffects` é independente de rodas, adaptadores e fumaça de pneus; atende os quatro participantes, inclusive parados e com fallback procedural.

- Fumaça de dano começa **abaixo de 75% da vida** e cresce em emissão, tamanho e opacidade, escurecendo com o dano.
- Cada incremento observado de `destructionSequence`, enquanto destruído, produz no máximo uma rajada de até 40 partículas, com clarão, fogo e faíscas. A explosão visual dura até 0,8 s.
- O pool é pré-alocado e limitado a **512 partículas**. Saturação descarta emissão excedente sem substituir partículas vivas, guardar fila ou repetir explosão após o respawn.
- Respawn remove a fumaça de motor antiga daquele participante e limpa seu orçamento, preservando os rastros dos demais. Recursos são descartados ao sair da cena.
- A fumaça de pneus continua baseada em velocidade/slip do jogador e usa seu próprio pool; não é indicação de dano.

Os efeitos usam pontos e shaders próprios, sem texturas externas. O carro fica oculto durante a destruição e pisca durante a proteção; os efeitos não aplicam forças ou dano.

## Motores e controle global de áudio

`src/audio/RaceEngineAudio.js` sintetiza perfis originais por veículo com osciladores, harmônicos e filtros Web Audio, sem samples externos. As intenções são buggy mais brilhante (Thunder), V8 grave (Camaro), motor pesado (Armored), hot rod áspero (Widowmaker) e esportivo agudo reservado (Race Car 2). **Esses nomes descrevem o desenho dos perfis; a distinção percebida e a qualidade do timbre ainda precisam de escuta humana.**

Pitch e carga usam velocidade longitudinal e acelerador públicos da simulação; dano atenua o nível e destruição silencia a voz. Há no máximo **quatro vozes**, com prioridade ao jogador e bots atenuados pela distância, totalizando no máximo **33 nós próprios do módulo** (não de todo o áudio do jogo). Frames reutilizam os nós e limitam a fila de automação.

O contexto é o compartilhado do Phaser, sem criar um `AudioContext` por corrida. `MenuMusic` publica o estado global: gesto de ativação, M/botão, perda de foco e página oculta afetam trilha e motores. Ausência ou falha de `OfflineAudioContext` indisponibiliza apenas a geração da trilha; motores continuam possíveis com o contexto de reprodução disponível. Falhas de áudio não bloqueiam a navegação. Ao sair/destruir, vozes, conexões, osciladores e listeners próprios são liberados, sem fechar o contexto pertencente ao jogo.

## Critérios de aceite e limitações pendentes

Os itens abaixo descrevem critérios de revisão. A cobertura da entrega anterior, com seu recorte incremental, está no relatório histórico de verificação; os contratos atuais de pacote e créditos ainda exigem validação própria:

- **Regras:** capacidades por resistência, dano normal, cooldown por par/episódio, perda gradual de condução e igualdade dos limites físicos dos bots; referências em `tests/race-damage.unit.js`, `tests/race-wall.unit.js` e `tests/race-drift.unit.js`.
- **Respawn/progresso:** tempos, proteção, nitro sem recarga, débito de ré, emenda da pista, gates antes/sobre/depois da morte e chegada física no mesmo passo do impacto; referência em `tests/race-damage.unit.js`.
- **Apresentação:** HUD parcial, fumaça independente de rodas, explosão única, saturação/descarte, escala, enquadramento com C/Z e rodas assinadas dos cinco modelos; referências em `tests/vehicle-damage-effects.unit.js`, `tests/vehicle-models.unit.js`, `tests/race-camera.unit.js` e `tests/vehicle-combat.spec.js`.
- **Distribuição:** derivado Thunder abaixo de 25 MiB, pixels/dimensões/UVs usados/triângulos/Fan preservados, original intacto, alias canônico, allowlist técnica fechada e pacote/manifesto íntegros sem referências privadas no build; referências em `tests/thunder-optimization.unit.js`, `tests/vehicle-assets-plugin.unit.js` e `tests/release-assets.unit.js`.
- **Áudio:** ativação/mute/foco, falha isolada da trilha, limite de vozes/nós, retomada após respawn e descarte; referências em `tests/audio.unit.js` e no caso de motores de `tests/vehicle-combat.spec.js`. Sinal medido não comprova timbre percebido.

A seleção de casos segue [TESTING.md](TESTING.md) e AGENTS §11, sem exigir todas essas suítes a cada alteração. Os comandos, resultados, ajustes após falhas e capturas da entrega anterior, usando saves isolados, estão em [VEHICLE_COMBAT_VERIFICATION.md](VEHICLE_COMBAT_VERIFICATION.md). Nenhum teste funcional ou build foi executado nesta edição documental.

Na entrega anterior foram conferidos movimento das rodas, sinal de áudio/mute, dano/respawn e composição nas resoluções afetadas em navegador automatizado. Continuam pendentes avaliação visual humana prolongada das costuras do Widowmaker, escuta dos timbres e medição de desempenho/memória em hardware real. Cache, pools e redução do GLB não demonstram 60 FPS, consumo real de VRAM ou fluidez em GPU física. As restrições de direitos dos modelos permanecem registradas nos créditos e avisos; a otimização não as resolve.
