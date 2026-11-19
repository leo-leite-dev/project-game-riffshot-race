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

| Fluxo / tela | DEVELOP | Preview local | Cloudflare |
|---|---:|---:|---:|
| Splash, menu, dificuldade, pilotos e mapa | Capturado e percorrido | Capturado e percorrido | Capturado e percorrido |
| Mapa → compra inicial e três GLBs | Passou | Passou | Falhava antes da correção; pendente da publicação corretiva |
| Estação de Equipe, melhorias, pista e largada | Percorrido; capturas visuais | Percorrido; capturas visualmente iguais | Impedido pelo mapa antes da correção; validar após publicar |
| Recibo de resultado e premiação condicional | Abertos com fixtures válidas em contexto isolado | Abertos com fixtures válidas em contexto isolado | Abertos com fixtures válidas em contexto isolado |
| Laboratório/administração fora do build público | Fluxo local restrito | Ausente | Ausente |

**Validações locais:** `npm run typecheck` e `npm run build` aprovados; testes Playwright de produção confirmaram que o laboratório Rapier, a senha dev e o editor não são incluídos/abertos em produção. O relatório final da tarefa deve registrar o SHA e o resultado Cloudflare após o push corretivo.
