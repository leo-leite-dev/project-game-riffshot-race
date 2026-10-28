# Changelog

Este arquivo registra as mudanças relevantes do projeto seguindo [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). As alterações ainda não publicadas ficam em **Unreleased**.

## [Unreleased]

### Adicionado

- Estado canônico de campeonato com MONEY e SCORE independentes, meta, rival/divisão, oito corridas, seleções, melhorias, histórico/ciclo de pistas, IDs premiados e resultado pendente.
- Serviço compartilhado entre cenas e transições puras de premiação/qualificação/fracasso, sem loja ou rival fictício.
- Persistência local JSON v1 com validação, backup anterior, detecção de conflito de abas e bloqueio de versões desconhecidas, dados inválidos ou backup órfão. Aviso visual/acessível de progresso temporário quando não é possível gravar.
- Recibo de recompensa/totais na classificação final e painel PLAYER 1 / MONEY / DIVISION / RACES RUN / SCORE NEED / SCORE HAVE com barra de progresso.
- Reinício de fracasso apenas após confirmação na tela da oitava corrida, arquivando o histórico e preservando seleções; escolha especial da primeira corrida pós-fracasso persiste até sua conclusão.
- Resultado qualificado mantém o desafio concluído na Estação de Equipe e bloqueia nova largada até existir um próximo rival funcional.
- Testes Node e de navegador direcionados a prêmios, duplicatas, reload, painel, sucesso, fracasso e proteção do armazenamento.
- Loja/upgrades não foram implementados; o estado de upgrades só é validado e zerado conforme a regra de fracasso, sem compras ou gastos fictícios.

- Testes puros de WASD/setas, giro local à frente/em ré, freio sem overshoot e independência da câmera sobre trajetória/classificação (`test:controls`).

- Composição direta do canvas Three.js sob o HUD Phaser transparente na corrida, sem cópia 3D→CanvasTexture por frame; garagem/equipe e fallback mantêm composição anterior.
- Câmeras isométrica e terceira pessoa com atraso suave, mira adiante, enquadramento pelo veículo, transição via C e terceira pessoa padrão em cada corrida; modo não persistido entre provas.
- Detecção/retração de obstáculos no braço da câmera; distância, altura, FOV e suavização configurados separadamente da simulação.
- Pista atribuída automaticamente com CONFIRMAR/VOLTAR, pendência estável, ciclo sem repetição e consumo idempotente somente na conclusão. A escolha excepcional agora é liberada somente após confirmar o fracasso por SCORE em 8/8.
- Testes Node de câmera/atribuição e fluxo de navegador direcionado para duas perspectivas/pistas, controles, HUD, resize, resultados, cleanup e fallback.

- Seleção de três pinturas cosméticas, com dados e atributos-base centralizados; Air Blade é restrito ao GLB local e a versão pública usa a designação ORIGINAL RACER.
- Garagem retrofuturista com prévia GLB em Three.js integrada à interface Phaser, compartilhamento do carregamento/geometria e materiais de pintura independentes.
- Braço mecânico animado por tempo decorrido, com alinhamento, descida, fechamento da garra, levantamento e transporte do veículo.
- Tela independente de preparação, inicialmente provisória e agora alimentada pelo campeonato, com piloto, rival identificado como conteúdo futuro, veículo e barras de atributos.
- Módulos interativos da Estação de Equipe; melhorias, reparos e adversário permanecem provisórios.
- Créditos e restrições de uso local do modelo provisório em `CREDITS.md`; o GLB foi adicionado ao `.gitignore` para não ser enviado ao repositório público.
- Testes de navegador para renderização/material, seleção por teclado e mouse, ciclo mecânico, preparação, erros de carregamento, ciclo de vida e tamanhos de tela.
- Dificuldade Normal/Difícil antes da seleção do piloto e escolha dos circuitos NEON FURNACE e VOLTAGE RUN.
- Corridas jogáveis com 1 jogador e 3 bots, física arcade, colisões, 4 voltas, gates ordenados, classificação e tela de resultados.
- Controladores separados de jogador e bots usando a mesma simulação independente do renderer.
- HUD de corrida, minimapa simplificado, teste automatizado puro da física e resultado.
- Configuração central do desafio inicial (8 corridas, prêmios separados e ciclo de pistas). A proposta inicial de alvo em dinheiro foi substituída por meta de SCORE.

### Alterado

- Toda nova corrida força câmera TERCEIRA PESSOA, sem herdar a última câmera da sessão; C continua alternando durante a corrida atual.
- Recompensas integradas na chegada: SCORE (300/170/70/0) e MONEY ($ 1.500/$ 850/$ 400/$ 0), com meta de 1.400 pontos. Resultado e premiação são registrados uma única vez e persistidos juntos.
- 1 JOGADOR continua o progresso salvo ou reabre o recibo pendente sem premiar novamente; escolhas incompletas preservam o fluxo de seleção.
- Vitória por SCORE preserva dinheiro/melhorias e informa próximo rival em desenvolvimento, sem simular outra divisão; fracasso guarda os totais até confirmar o reset de MONEY/SCORE/upgrades/RACES.

- Framebuffer direto limitado a 1280×720, pixel ratio máximo solicitado de 1,25, uma renderização por frame Phaser. Fallback CanvasTexture preservado e selecionável via `?raceRenderer=texture`.
- Chão maior, laterais do tabuleiro elevado, pilares apoiados e alinhamento visual dos pneus à superfície, sem reconstruir os circuitos.
- Renderização do fundo oculto e reconstrução desnecessária da geometria do minimapa evitadas; temporização da corrida usa o relógio monotônico do loop, com catch-up limitado.
- Resultados oferecem próxima corrida atribuída. O desafio inicial e o salvamento são funcionais; loja, compras reais e novos rivais continuam planejados.
- README registra medições SwiftShader e limitações: remoção de cópias confirmada, sem demonstração de ganho comparável ou de 60 FPS em GPU física.

- Registro de veículo/pintura e dados provisórios da campanha separados dos dados de piloto e da apresentação visual.
- Redimensionamento observado no contêiner para sincronizar o canvas em mudanças de orientação e viewport móvel.
- README atualizado com arquitetura, fluxo atual, instruções locais, restrições de assets e roadmap separado das funções implementadas.
- Smoke test desktop (`npm run test:smoke`) reduzido a um único fluxo crítico de produção, com limite de execução, sem retries e parada na primeira falha.
- Configuração do Playwright explicitada para não reutilizar servidores externos por padrão, não repetir testes e parar na primeira falha.
- Build Vite configurado para copiar somente o favicon revisado e os avisos de licença, excluindo outros arquivos de `public/`.
- Fallback de veículo procedural original para produção e quando o GLB local estiver ausente ou inválido.
- Identidade de exibição pública neutra **ORIGINAL RACER**, mantendo o nome Air Blade somente com o GLB local.
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
- GLB local ausente/inválido usa a apresentação original e identifica esse fallback em vez de bloquear a garagem.
- Redimensionamento redundante do renderer evitado; a garagem respeita movimento reduzido nas animações decorativas.
- A prévia 3D reaplica o frame ao mudar o tamanho da CanvasTexture, evitando deslocamento visual.
- O GLB local não é requisitado no build nem emitido para `dist`; os testes de produção verificam o fallback e ausência da requisição.
- A correção da resposta de barreira mantém os veículos dentro do circuito; bots completam ambas as pistas em Normal e Difícil nos testes da simulação.

## Histórico anterior

- `95ac3d1` — `chore: initial project setup` (configuração inicial do projeto).
