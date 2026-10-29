# Changelog

Este arquivo registra as mudanças relevantes do projeto seguindo [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). As alterações ainda não publicadas ficam em **Unreleased**.

## [Unreleased]

### Adicionado

- Página pública `/credits.html`, gerada de `THIRD_PARTY_NOTICES.md` com escape do conteúdo Markdown; `THIRD_PARTY_NOTICES.txt` integral permanece disponível. O rodapé compartilhado por todos os menus abre `./credits.html` em nova aba, sem recarregar o jogo, com acesso por teclado.
- Pacote público selecionado para versionamento em `assets/vehicles/`, com cinco GLBs e manifesto de autoria, título, fonte, licença/link, adaptações, URL, bytes e SHA-256 do original e do payload. Créditos dos cinco modelos sob licença declarada CC BY 4.0 (não CC0), áudio original Neon Ignition/RaceEngineAudio e avisos MIT de Phaser 3, Three.js e eventemitter3 acompanham a distribuição; a licença das criações próprias não é alterada.
- Preparação explícita `npm run assets:prepare`: lê apenas cinco nomes fixos das referências privadas, preserva os originais, otimiza somente Thunder e grava o manifesto por último. Não é uma etapa automática de dev/build/deploy.
- README com link para jogar, tabela dos cinco autores/fontes e distinção entre créditos fictícios e dinheiro real. Jogo gratuito, sem venda de veículos/créditos por dinheiro real; doações opcionais apenas planejadas, sem QR Code implementado.
- Documentação da integração GitHub → Cloudflare Pages já existente para o repositório público `leo-leite-dev/project-rock-n-racing-ia`, branch `main`, produção em `https://project-rock-n-racing-ia.pages.dev`. O check bem-sucedido do commit antigo `4eeafe1` e o preview anterior são históricos; a verificação atual e o relatório de release separado pela integração principal ainda estão pendentes, sem afirmar deploy desta atualização.

- Documentação de condução/combate em `docs/VEHICLE_COMBAT.md`, com regras, critérios de aceite e limitações; loja e seções de gameplay/controles do README atualizadas, preservando o histórico. A entrega anterior tem relatório em `docs/VEHICLE_COMBAT_VERIFICATION.md`; a validação da release atual permanece pendente da integração principal. Esta edição documental não executou testes funcionais, build ou servidor.
- Dano por aproximação normal, capacidade de `3 + floor(clamp(resistência − 20, 0, 80) / 20)` bolinhas de 20 HP e perda gradual de aderência/direção. Destruição de 0,8 s e respawn central com vida cheia e proteção de 1,5 s, sem regeneração contínua nem reposição de nitro; débito de ré/high-water mark e gates físicos preservam o progresso legítimo, inclusive em contatos letais.
- HUD com bolinhas parcialmente preenchidas; fumaça de dano e explosão em pool limitado, independentes da fumaça de pneus e dos adaptadores de rodas. Escala visual ×1,3 na corrida, C para alternar câmera e Z para três aproximações em terceira pessoa.
- Motores sintetizados originais por veículo em `RaceEngineAudio`, compartilhando o contexto Phaser e o mute global de `MenuMusic`, com até quatro vozes/33 nós próprios e descarte na saída. Falha/ausência de `OfflineAudioContext` afeta somente a trilha; qualidade percebida dos timbres ainda depende de escuta humana.

- Loja de veículos com compra persistente: Camaro 800, THUNDER BUG 2.000, Armored Car 7.500, Race Car 2 15.000 (bloqueado para a fase 2) e Widowmaker 24.000 créditos fictícios. A seleção inicial mostra somente Thunder, Camaro e Armored Car; o módulo VEÍCULO da equipe abre o catálogo completo. Na etapa inicial da loja, o perfil de 2.000 créditos era apresentado como Race Car; foi substituído pelo Thunder mantendo o ID.
- Modelos GLB fornecidos localmente na garagem/corrida, cache compartilhado e allowlist explícita no desenvolvimento/build. Race Car 2 reutiliza o binário idêntico do Race Car. Atlas originais preservados; cores continuam identificando a equipe.
- Farming opcional após atingir 1.400 SCORE, até oito corridas; escolha única entre Widowmaker e 12.000 créditos para encerrar o desafio. Widowmaker também é usado pelo rival na corrida. Fase 2 permanece em desenvolvimento.
- Save schema 3 com inventário e prêmio único, migração conservadora v1/v2, compras preservadas no fracasso e gravação exclusiva por aba com Web Locks. Compras/prêmios falham sem debitar/conceder caso não possam ser salvos.
- Testes direcionados de economia, migração, modelos, bloqueio, duas abas, farming e premiação, com capturas reais em `previews-ui/`. Decisões e ressalvas de licença/desempenho em `docs/VEHICLE_SHOP.md`.

- Botão APAGAR PROGRESSO na Estação de Equipe, com confirmação explícita, remoção dos saves/backups do campeonato e limpeza de escolhas/resultado em memória, retornando à abertura. Cancelamento preserva os dados; conflitos de abas e falhas de exclusão exibem aviso sem simular sucesso. Dados externos ao campeonato não são apagados.
- Testes direcionados de exclusão, cancelamento, retorno após reload, navegação por teclado, layout responsivo e falhas de armazenamento.

- **Histórico superado pelo Thunder:** preparação reprodutível de candidato do Rift Blaze com recompressão PNG sem perdas, índices menores, remoção de UV sets não utilizados e união de vértices idênticos; testes de equivalência de dados. Aquele candidato excedia o limite de 25 MiB do Pages e não foi ligado ao carregamento público; permanece fora do pacote atual.
- Atribuição de TiyaMakes/CC BY 4.0 nos avisos de terceiros e link acessível “Créditos e licenças” no shell do jogo, sem implicar publicação ou endosso do autor.

- Rift Blaze experimental opt-in em desenvolvimento (`?localRiftBlaze=1`), usando o Sci - Fi Buggy de TiyaMakes, CC BY 4.0, sem publicar ou modificar o GLB original.
- **Histórico do experimento:** rota Vite fixa de leitura local, bloqueio de acesso genérico às referências e fallback procedural; naquela etapa a produção não tinha GLB. Hoje os cinco GLBs oficiais são distribuídos, enquanto a rota experimental e seu buggy continuam fora da produção.
- Template com separação em memória de pneus/aros, quatro pivôs, pintura isolada de `main_body` e compartilhamento de geometrias/texturas.
- Adaptador visual com rotação longitudinal assinada das rodas, esterçamento dianteiro, peso/impacto sutil na carroceria e efeitos de nitro. Telemetria deriva da simulação sem mudar suas forças.
- Fumaça de derrapagem com pool de pontos e shader original, baseada no slip lateral, sem imagens externas; somente jogador detalhado na corrida.
- Testes direcionados de estrutura, animação, partículas, carregamento/fallback local e ausência da integração em produção. Documentadas limitações da suspensão e medições SwiftShader sem promessa de 60 FPS.

- Estado canônico de campeonato com MONEY e SCORE independentes, meta, rival/divisão, oito corridas, seleções, melhorias, histórico/ciclo de pistas, IDs premiados e resultado pendente.
- Serviço compartilhado entre cenas e transições puras de premiação/qualificação/fracasso, sem loja ou rival fictício.
- **Histórico de persistência, sucedido pelo schema 3:** JSON schemaVersion 2 com migração validada de saves v1, backup anterior, detecção de conflito de abas e bloqueio de versões desconhecidas, dados inválidos ou backup órfão. Aviso visual/acessível de progresso temporário quando não é possível gravar. O formato atual é schema 3, com migração v1/v2 e inventário/prêmio único.
- Recibo de recompensa/totais na classificação final e painel PLAYER 1 / MONEY / DIVISION / RACES RUN / SCORE NEED / SCORE HAVE com barra de progresso.
- Reinício de fracasso apenas após confirmação na tela da oitava corrida, arquivando o histórico e preservando seleções; escolha especial da primeira corrida pós-fracasso persiste até sua conclusão.
- **Histórico de qualificação:** resultado qualificado mantinha o desafio concluído e bloqueava nova largada. A regra atual permite farming até oito provas e encerra após escolher o prêmio único, sem implementar a fase 2.
- Testes Node e de navegador direcionados a prêmios, duplicatas, reload, painel, sucesso, fracasso e proteção do armazenamento.
- **Histórico anterior à loja:** compras ainda não existiam. Hoje a loja de veículos está implementada; upgrades continuam indisponíveis, com estado apenas validado e zerado conforme a regra de fracasso.

- Testes puros de WASD/setas, giro local à frente/em ré, freio sem overshoot e independência da câmera sobre trajetória/classificação (`test:controls`).
- **Histórico dos perfis procedurais:** três veículos com atributos próprios, nitro limitado no RIFT BLAZE, controle de curva no VOLT VECTOR e menor dano no IRON BASTION; adversários usam o mesmo catálogo/física. Modelos, nomes e ratings foram sucedidos pelos cinco GLBs atuais; resistência do veículo hoje aumenta vida, sem segunda redução percentual de dano.
- Seleção em duas etapas — máquina e depois pintura —, com as três cores compartilhadas pelos veículos.
- Interpolação de poses apenas na apresentação entre passos fixos, mantendo a física e os 60 passos/s sem alteração.
- Integridade/cooldown de dano por contato, indicadores de resistência e nitro na corrida, e SHIFT para acionar o nitro.
- **Histórico da migração para v2:** veículo antigo passa a RIFT BLAZE sem apagar MONEY, SCORE ou progresso; o original é preservado como backup antes da primeira gravação v2. A migração atual usa schema 3 e mantém o ID, hoje apresentado como THUNDER BUG.
- Estudo de referência em `docs/GAMEPLAY_REFERENCE.md`, separando relatos públicos, código do RIFFSHOT e hipóteses; a ROM local não foi aberta nem executada.
- Resposta de barreira agora corrige somente a velocidade normal e conserva avanço tangencial; direção em carro parado deixa de pivotar; centros coincidentes de dois carros são separados.
- **Histórico do dano anterior:** resistência do piloto passou a reduzir dano de colisão, além da resistência do veículo. Na regra atual, o piloto reduz dano e a resistência do veículo aumenta a capacidade de vida, sem segunda redução percentual.
- Testes de movimento/física em 30/60/120/144 Hz, recuperação de parede, colisão coincidente e direção em baixa velocidade.
- Diagnóstico de desenvolvimento sob F2: FPS Three, delta/passos físicos, poses real/interpolada, correções de colisão, atualizações da câmera e contadores para comparar avanços/poses/renders; F3 congela a câmera, Shift+F3 retoma, F4 desliga contatos e Shift+F4 religa para isolamento A/B.
- Velocidade interpolada passou a acompanhar posição/direção na entrada da câmera; câmera não usa mais amostra de speed crua a 60 Hz enquanto o carro usa pose visual interpolada.

- Composição direta do canvas Three.js sob o HUD Phaser transparente na corrida, sem cópia 3D→CanvasTexture por frame; garagem/equipe e fallback mantêm composição anterior.
- Câmeras isométrica e terceira pessoa com atraso suave, mira adiante, enquadramento pelo veículo, transição via C e terceira pessoa padrão em cada corrida; modo não persistido entre provas.
- Detecção/retração de obstáculos no braço da câmera; distância, altura, FOV e suavização configurados separadamente da simulação.
- Pista atribuída automaticamente com CONFIRMAR/VOLTAR, pendência estável, ciclo sem repetição e consumo idempotente somente na conclusão. A escolha excepcional agora é liberada somente após confirmar o fracasso por SCORE em 8/8.
- Testes Node de câmera/atribuição e fluxo de navegador direcionado para duas perspectivas/pistas, controles, HUD, resize, resultados, cleanup e fallback.

- **Histórico do catálogo procedural:** três modelos originais, atributos mecânicos e pinturas aplicáveis a qualquer veículo; sucedido pelos cinco GLBs atuais com atlas preservados e cor de equipe.
- Garagem retrofuturista com prévias Three.js integradas à interface Phaser, cache de geometrias e materiais de pintura independentes.
- Braço mecânico animado por tempo decorrido, com alinhamento, descida, fechamento da garra, levantamento e transporte do veículo.
- Tela independente de preparação, inicialmente provisória e depois alimentada pelo campeonato, com piloto, veículo e barras de atributos. **Histórico:** o rival era identificado como conteúdo futuro; hoje usa Widowmaker na miniatura e na corrida.
- Módulos interativos da Estação de Equipe. **Histórico:** adversário era provisório; melhorias e reparos continuam indisponíveis, enquanto o prêmio único do rival já integra o desafio.
- **Histórico da remoção do provisório Air Blade:** créditos e restrições em `CREDITS.md`; a dependência daquele GLB foi removida do aplicativo. Isso não descreve os cinco GLBs atuais nem reintroduz o provisório.
- Testes de navegador para renderização/material, seleção por teclado e mouse, ciclo mecânico, preparação, erros de carregamento, ciclo de vida e tamanhos de tela.
- Dificuldade Normal/Difícil antes da seleção do piloto e escolha dos circuitos NEON FURNACE e VOLTAGE RUN.
- Corridas jogáveis com 1 jogador e 3 bots, física arcade, colisões, 4 voltas, gates ordenados, classificação e tela de resultados.
- Controladores separados de jogador e bots usando a mesma simulação independente do renderer.
- HUD de corrida, minimapa simplificado, teste automatizado puro da física e resultado.
- Configuração central do desafio inicial (8 corridas, prêmios separados e ciclo de pistas). A proposta inicial de alvo em dinheiro foi substituída por meta de SCORE.

### Alterado

- Dev/build normais agora validam e leem o pacote `assets/vehicles/`, sem referências privadas nem otimização de cerca de 30 segundos a cada execução. Guards de manifesto, tamanho/SHA-256, contêiner GLB e recursos externos exigem cada payload estritamente abaixo de 25 MiB; falhas não publicam o original privado como fallback.
- `referencias-locais/` e `public/models/` histórico permanecem ignorados/não versionados. A cópia automática de `public/` segue desativada; o aplicativo distribui favicon, cinco GLBs previstos, créditos HTML e TXT, sem o antigo Sci - Fi Buggy ou Air Blade. “Assets aprovados” refere-se à allowlist técnica, sem certificação jurídica; preservadas as ressalvas de procedência de Race Car 2 e Camaro para a decisão do proprietário.
- Documentação alinhada ao FOV-base de 62°/70°/80° dos três zooms, com adaptação à proporção/cobertura horizontal em retrato, e aos módulos de prêmio, escritor de save, dano, áudio, modelos e créditos. Referências antigas a produção exclusivamente procedural ou sem GLBs foram identificadas como históricas.
- Guia de testes distingue os **107 casos unitários e 6 de navegador da entrega anterior** da verificação atual de pacote/créditos/publicação. Spec de créditos atualizado para HTML + TXT, cinco modelos e três avisos MIT; aprovações atuais pertencem ao relatório específico da release, não à edição documental.

- THUNDER BUG substitui o antigo Race Car do ID estável `rift-blaze`, por 2.000 créditos, com ratings aprovados em `src/data/vehicles.js` para os cinco veículos. Resistência aumenta capacidade de vida, sem redução dupla do dano do veículo; RACE CAR 2 segue bloqueado para a fase 2.
- Derivado Thunder sem perdas de 28.914.440 para 25.452.592 bytes (24,27 MiB), gerado por `scripts/optimizeThunderBug.js` na preparação explícita e salvo no pacote público, preservando original, pixels/dimensões, UVs usados, triângulos e clipe aprovado Fan. A geração em memória a cada build era o fluxo anterior, agora superado. Não implica redução da memória decodificada nem comprovação de 60 FPS.
- Cinco GLBs oficiais com rodas extraídas e pivôs por instância; adaptadores consideram velocidade assinada e escala mundial. Widowmaker usa volumes cilíndricos específicos, com risco residual de pequenas costuras em movimento; atlas originais e restrições de licença permanecem.
- Cache carrega subconjuntos por tela: três opções iniciais, até quatro IDs dos participantes na corrida e cinco na loja. Allowlist serve/emite cinco assets distintos; `race_car2.glb` é alias para `race_car.glb`, sem exigir ou publicar um original duplicado. Fontes privadas permanecem fora das rotas genéricas e da cópia automática.

- Toda nova corrida força câmera TERCEIRA PESSOA, sem herdar a última câmera da sessão; C continua alternando durante a corrida atual.
- Recompensas integradas na chegada: SCORE (300/170/70/0) e MONEY ($ 1.500/$ 850/$ 400/$ 0), com meta de 1.400 pontos. Resultado e premiação são registrados uma única vez e persistidos juntos.
- 1 JOGADOR continua o progresso salvo ou reabre o recibo pendente sem premiar novamente; escolhas incompletas preservam o fluxo de seleção.
- Vitória por SCORE preserva dinheiro/melhorias e informa próximo rival em desenvolvimento, sem simular outra divisão; fracasso guarda os totais até confirmar o reset de MONEY/SCORE/upgrades/RACES.

- Framebuffer direto limitado a 1280×720, pixel ratio máximo solicitado de 1,25, uma renderização por frame Phaser. Fallback CanvasTexture preservado e selecionável via `?raceRenderer=texture`.
- Chão maior, laterais do tabuleiro elevado, pilares apoiados e alinhamento visual dos pneus à superfície, sem reconstruir os circuitos.
- Renderização do fundo oculto e reconstrução desnecessária da geometria do minimapa evitadas; temporização da corrida usa o relógio monotônico do loop, com catch-up limitado.
- Resultados oferecem próxima corrida atribuída. **Registro histórico:** loja e compras de veículos eram planejadas nessa etapa e hoje funcionam com créditos fictícios; novos rivais/fase 2 e upgrades continuam planejados.
- README registra medições SwiftShader e limitações: remoção de cópias confirmada, sem demonstração de ganho comparável ou de 60 FPS em GPU física.

- Registro de veículo/pintura e dados provisórios da campanha separados dos dados de piloto e da apresentação visual.
- Redimensionamento observado no contêiner para sincronizar o canvas em mudanças de orientação e viewport móvel.
- README atualizado com arquitetura, fluxo atual, instruções locais, restrições de assets e roadmap separado das funções implementadas.
- Smoke test desktop (`npm run test:smoke`) reduzido a um único fluxo crítico de produção, com limite de execução, sem retries e parada na primeira falha.
- Configuração do Playwright explicitada para não reutilizar servidores externos por padrão, não repetir testes e parar na primeira falha.
- **Histórico do build anterior aos GLBs oficiais:** emitia somente favicon e avisos, excluindo outros arquivos de `public/`. A exclusão da cópia automática permanece; hoje também são emitidos os cinco GLBs validados e créditos HTML.
- **Histórico superado:** veículos procedurais próprios eram a única apresentação local e de produção. Hoje são fallback para os GLBs oficiais.
- Inventário atualizado de procedência/licenças do áudio, fontes, favicon, arte gerada por código e dependências de software.
- Avisos integrais das licenças MIT de Phaser e Three.js incluídos e verificados no build público.
- Marca pública alterada para RIFFSHOT RACING com slogan oficial e lettering/símbolo de onda sonora desenhados pelo projeto; o nome técnico do repositório foi mantido.
- Raze Riot substituído por Dax Voltage, técnico de áudio orbital com retrato procedural de headset ressonante; retratos de Kira, Echo-7, Atlas e Zuri ganharam motivos autorais distintos, mantendo nomes e atributos.
- Preparação redesenhada como Estação de Equipe assimétrica com painel de temporada, mantendo os valores, módulos, navegação e START RACE.
- START RACE passa pela escolha de pista e abre a corrida real; a cena antiga de desenvolvimento permanece registrada como placeholder legado, fora do fluxo normal.
- Instruções para configuração do build e diretório de saída do Cloudflare Pages incluídas no README.

### Corrigido

- Conclusão de corrida agora credita SCORE/MONEY e contagem real, em vez de apenas salvar a classificação com painel provisório.
- Reabrir resultado, repetir comandos ou recarregar não reaplica o prêmio; IDs de corrida não reiniciam com a sessão.
- Resultado da oitava corrida não é zerado prematuramente. Backup órfão e saves desconhecidos não são substituídos por uma carreira nova silenciosamente.

- Sinal de direção A/D e setas no adaptador do jogador, independente dos eixos visuais da câmera, preservando o controlador de bots.
- S freia até perto da parada e engata ré controlada; W freia o movimento reverso antes de acelerar à frente. O freio isolado não atravessa zero nem oscila entre marchas.

- Texto/timer de câmera e canvas Three removidos ao sair da corrida, com restauração da composição das demais telas.
- Montagem assíncrona inválida não constrói mundo nem redimensiona o renderer de uma cena já retomada.
- Recolhimento da câmera fica antes do obstáculo também em distâncias curtas; iluminação distingue projeção ortográfica/perspectiva.

- Remoção de recursos 3D, textura da prévia e listeners ao trocar/destruir cenas; rejeições de carregamento tardias não atualizam cenas encerradas.
- Passos fixos da simulação interpolados na apresentação, evitando quadros visuais parados em telas com refresh superior a 60 Hz.
- Redimensionamento redundante do renderer evitado; a garagem respeita movimento reduzido nas animações decorativas.
- A prévia 3D reaplica o frame ao mudar o tamanho da CanvasTexture, evitando deslocamento visual.
- **Histórico do Air Blade:** a antiga dependência daquele GLB foi retirada do carregamento, da configuração e da apresentação do jogo; o arquivo local foi preservado fora do repositório antes da remoção. O provisório continua excluído da distribuição atual com cinco outros GLBs.
- A correção da resposta de barreira mantém os veículos dentro do circuito; bots completam ambas as pistas em Normal e Difícil nos testes da simulação.

## Histórico anterior

- `95ac3d1` — `chore: initial project setup` (configuração inicial do projeto).
