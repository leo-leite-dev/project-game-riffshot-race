# Auditoria de telas e publicação — RIFFSHOT RACING

## Inventário

Foram encontrados **18 arquivos de cena** (`src/scenes/`) e **21 módulos de UI** (`src/ui/`). O runtime registra 13 cenas do jogo; classes-base, componentes reutilizáveis e laboratórios locais também estão incluídos na contagem de arquivos.

| Cena / interface | Caminho de acesso | Distribuição / estado |
|---|---|---|
| `SplashScene` | Abrir o jogo → Enter ou clique | Pública |
| `MainMenuScene` | Splash → menu; SOLO continua ou inicia | Pública; CO-OP e ONLINE permanecem bloqueados |
| `DifficultySelectionScene` | Menu SOLO sem seleção completa | Pública; Normal e Difícil |
| `CharacterSelectionScene` | Confirmar dificuldade; mapa retorna para esta tela | Pública; 9 pilotos |
| `GalacticMapScene` | Confirmar piloto; Enter/CONTINUAR segue para veículos; Escape/VOLTAR retorna aos pilotos | Pública; mapa informativo e lição/desafio de origem |
| `VehicleSelectionScene` | Mapa → continuar; equipe → Loja/Garagem; etapas de veículo e pintura | Pública; compra inicial, modelos, cores, Loja e Minha Garagem |
| `RacePreparationScene` | Equipar veículo ou continuar carreira salva | Pública; Estação de Equipe, campanha, telemetria, Configurações, pista, melhorias e loja |
| `VehicleUpgradesScene` | Estação de Equipe → MELHORIAS | Pública; compras dependem de MONEY disponível |
| `RaceTrackSelectionScene` | Estação de Equipe → PISTA/CORRIDA | Pública; pista atribuída/escolha permitida pela progressão |
| `RaceScene` | Confirmar a pista | Pública; Three.js, HUD, bots, armas, nitro, dano, áudio e câmeras |
| `RaceResultsScene` | Concluir corrida ou abrir recibo pendente | Pública; ações variam conforme resultado/progresso |
| `RivalRewardScene` | Atingir a meta e escolher a recompensa | Pública, condicional à progressão; fase seguinte permanece em desenvolvimento |
| `RaceDevelopmentScene` | Nenhuma entrada de navegação no código atual | Placeholder “em desenvolvimento”; não é uma funcionalidade jogável publicada |
| `ArcadePhysicsLabScene` | URL `?physicsLab=1` no Vite dev ou PISTA DE TESTE local autorizada | Laboratório local; não integra o fluxo público |
| `PhysicsLabScene` / Rapier | Sem rota de navegação ativa; o bootstrap atual carrega o laboratório arcade | Experimental e isolado; não publicar como corrida oficial |
| `PhysicsLabBootstrapScene` | Carregador interno dos laboratórios locais | Não é tela de jogador |
| `TitleScene` | Classe-base das telas de título | Componente compartilhado, não tela independente |
| `GarageScene` | Base visual reutilizada por seleção, equipe e corrida | Componente compartilhado, não tela independente |

### Módulos de `src/ui/`

| Área | Módulos |
|---|---|
| Menus e navegação | `MenuButton`, `MenuButtonArtwork`, `MenuGlyphText`, `IntroStartButton`, `theme`, `extractMenuFrames` |
| Pilotos | `CharacterCard`, `CharacterDetails`, `CharacterSelectionAssets`, `PilotSelectionTypography` |
| Estação/garagem | `StationButton`, `StationLayout`, `StationStats`, `StationSettings`, `PreparationModules` |
| Corrida/áudio | `RaceHudArt`, `RadioRaceWidget` |
| Infraestrutura/acessibilidade | `observeGameSize`, `mobileOrientation`, `publicCreditsShortcut` |
| Administração local | `VehicleTuningEditor` (somente Vite dev, autenticado por senha local) |

Além das cenas Phaser, há a página pública estática `credits.html`, os controles de orientação móvel e Configurações, e as abas Loja/Minha Garagem e pintura dentro de `VehicleSelectionScene`.

## Recursos, persistência e gates de build

- `build.copyPublicDir: false` é intencional. Recursos de código-fonte são empacotados pelo Vite; recursos de `public/` seguem plugins/listas explícitas. O build auditado contém 138 arquivos; a pasta `public/` contém 34 arquivos.
- Os cinco modelos oficiais são emitidos em `/assets/models/vehicles/`. Não foram encontrados erros de carregamento desses GLBs nos fluxos em que foram solicitados.
- `?physicsLab=1`, editor de atributos, rota de gravação e diagnósticos são exclusivos do modo dev. O build público não carrega o laboratório Rapier nem oferece editor/senha.
- `?localRiftBlaze=1` substitui o veículo apenas na prévia local de desenvolvimento; não é uma variante aprovada para distribuição.
- A `.env.local` contém `RIFFSHOT_DEV_MODE_PASSWORD`; ela só habilita a autenticação do editor local. O valor não foi lido ou copiado. Save e preferências foram usados somente em contextos Playwright novos e isolados.
- Três amostras de áudio referenciadas em `referencias-locais/audio/` responderam 404 no Vite dev. São recursos opcionais, não são publicados pelo preview/build e não impediram a navegação ou o carregamento de veículos.

## Divergência reproduzida e correção

O caminho de uma carreira nova era `Piloto → Mapa Galáctico`, mas o mapa não tinha ações para os dois botões desenhados na parte inferior. Escape voltava à seleção; Enter apenas selecionava o desafio informativo. Assim, a seleção de veículo e todas as telas posteriores ficavam inacessíveis para uma carreira nova na publicação.

Foi corrigido o mapa para preencher as ações já desenhadas: **VOLTAR** retorna aos pilotos e **CONTINUAR** segue à seleção de veículos. Enter/Space ativa a ação focada; setas/Tab alternam o foco; C mantém acessível o desafio de origem. O mapa continua sem iniciar corrida nem alterar a progressão.

## Cobertura de execução

| Fluxo / telas | DEVELOP | Preview local | Cloudflare publicado |
|---|---:|---:|---:|
| Caminho novo: Splash → menu → dificuldade → pilotos → mapa → veículos → equipe → melhorias → pista → corrida (**10 telas**) | 10/10, percorrido | 10/10, percorrido | 10/10, percorrido após deploy |
| Compra inicial, escolha de pintura, Loja e Minha Garagem | Percorridas; 5 modelos GLB 200 | Percorridas; 5 modelos GLB 200 | Percorridas; 5 modelos GLB 200 |
| Resultado e premiação condicional | Abertos com saves-fixture válidos isolados | Abertos com saves-fixture válidos isolados | Abertos com saves-fixture válidos isolados |
| Configurações e página pública de créditos | Abertas; créditos HTTP 200 | Abertas; créditos HTTP 200 | Abertas; créditos HTTP 200 |
| Laboratório arcade local | Teste Playwright aprovado | Rota ausente, como esperado | Rota ausente, como esperado |
| Laboratório Rapier e editor/credencial de tuning | Excluídos da distribuição; teste de proteção aprovado | Ausentes | Ausentes; teste de proteção aprovado |

**Cobertura contabilizada:** 12 cenas públicas jogáveis/condicionais (10 do caminho de carreira + Resultado + Premiação), verificadas nos três ambientes (**36 estados de cena**). Loja/Garagem, pinturas, Configurações e créditos também foram percorridos nos três. `RaceDevelopmentScene` é um placeholder sem entrada de navegação, e os laboratórios são locais/experimentais; não foram contados como telas públicas do jogo.

**Evidências:** capturas Playwright em contextos novos e isolados; menu, dificuldade, mapa, melhorias e pista produziram imagens idênticas entre os três ambientes. Pilotos, oficina e corrida foram comparados visualmente em estados equivalentes; efeitos de entrada e movimento alteram pixels entre capturas. Não houve exceções JavaScript. No Vite dev, três amostras de áudio local opcionais retornaram 404; preview e Cloudflare não tiveram falhas HTTP no percurso público. Os cinco GLBs oficiais foram requisitados com HTTP 200 nos três ambientes.

**Validações:** typecheck e build passaram em DEVELOP e MAIN. Playwright aprovou a proteção do laboratório Rapier e do editor/credencial no build; o teste local do laboratório arcade também passou. Os testes unitários do plugin de assets e de preparação/publicação dos GLBs passaram. Uma execução combinada de `vehicle-models.unit.ts` teve **20 aprovados e 5 falhas** porque as fontes privadas ignoradas `referencias-locais/Vehicles/*.glb` não existem nesta máquina; os cinco modelos públicos versionados foram carregados nos três ambientes. A suíte `race-simulation.unit.ts` teve 21 aprovados e um caso de bots que não concluiu quatro voltas em 150 s em `neon-furnace/normal`; a corrida pública foi verificada até a largada, e Resultado/Premiação foram validados com recibos válidos isolados.

**Publicação:** correção integrada por fast-forward e publicada em `main`, commit `759c19c440d77b67421ff4b11d2ff6afe75feee8`. Check Cloudflare Pages: `success`; o domínio público serve `/assets/index-B-IRKUyj.js`, bundle produzido pelo build validado.
