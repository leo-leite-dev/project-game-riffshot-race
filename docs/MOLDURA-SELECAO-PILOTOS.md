# Medidas da moldura da seleção de pilotos

Este documento registra a geometria aprovada do painel da seleção de pilotos. A nova moldura limpa ocupa a mesma área-base e preserva os limites, a posição e as coordenadas dos conteúdos descritos aqui.

## Escopo e método

- Rota validada: `http://127.0.0.1:5173/`; a seleção de pilotos é uma cena Phaser, não uma rota de página separada. A cena observada foi `CharacterSelection`.
- Medições feitas na aplicação em execução, consultando objetos Phaser e `getBounds()` no navegador Chromium. Os valores de tela abaixo são pixels CSS; nesta medição, `devicePixelRatio = 1` e o canvas ocupava exatamente a viewport, então pixels lógicos Phaser e pixels CSS coincidiram.
- Viewports observadas: desktop **1672 × 944** e mobile **390 × 844**. Os valores responsivos são calculados e podem mudar em outras dimensões.
- O piloto selecionado durante a medição foi Axel Ryder. O quadro externo tem o mesmo tamanho para os demais pilotos; textos, retratos e conteúdos dependem da seleção.
- As medidas foram registradas antes da substituição visual da moldura; a troca de textura preservou a geometria.

## Moldura externa renderizada

Asset/objeto atual: `src/assets/pilot-selection/presentation-frame-clean.png`, carregado como `pilot-ui-details-frame` e exibido por `CharacterDetails.panelArtwork`. A composição foi derivada do asset selecionado e mantém a dimensão-base de **1635 × 962**.

| Medida | Desktop 1672 × 944 | Mobile 390 × 844 |
|---|---:|---:|
| X / Y do canto superior esquerdo | 566,808 / 139,285 | 42,710 / 548,589 |
| Largura × altura renderizadas | **1084,224 × 637,935** | **304,579 × 179,208** |
| Proporção renderizada | 1,699584 | 1,699584 |
| Distância à borda esquerda | 566,808 | 42,710 |
| Distância à borda direita | 20,968 | 42,710 |
| Distância à borda superior | 139,285 | 548,589 |
| Distância à borda inferior | 166,780 | 116,203 |

As pequenas diferenças possíveis na última casa vêm de arredondamento do navegador. A proporção vem do tamanho-base da arte, **1635 × 962** (`1635 / 962`). O objeto é inicialmente definido com largura Phaser **610** e altura calculada **358,911**; a escala dos contêineres ancestrais produz a dimensão final acima.

## Elementos internos principais

Posições `ΔX / ΔY` são relativas ao canto superior esquerdo da moldura externa renderizada; `L × A` são as dimensões medidas no navegador. São limites dos objetos (`getBounds()`), não necessariamente a área de tinta visível. Máscaras podem recortar parte de textos.

| Elemento | Desktop: ΔX / ΔY; L × A | Mobile: ΔX / ΔY; L × A |
|---|---:|---:|
| Ícone do piloto | 216,255 / 42,956; 135,084 × 85,103 | 60,751 / 12,067; 37,948 × 23,907 |
| Nome | 344,829 / 15,274; 439,022 × 78,206 | 96,870 / 4,291; 123,330 × 21,970 |
| Título/subtítulo | 344,829 / 89,189; 348,374 × 44,435 | 96,870 / 25,055; 97,865 × 12,483 |
| Aba Piloto (zona clicável) | 251,991 / 167,109; 344,830 × 53,051 | 70,789 / 46,944; 96,869 × 14,903 |
| Aba Veículo (zona clicável) | 606,767 / 167,109; 344,830 × 53,051 | 170,453 / 46,944; 96,869 × 14,903 |
| Cabeçalho Lore | 373,344 / 232,890; 74,651 × 35,548 | 104,880 / 65,423; 20,971 × 9,986 |
| Texto do Lore (limite do objeto) | 314,988 / 278,516; 266,612 × 115,532 | 88,487 / 78,241; 74,897 × 32,455 |
| Moldura da prévia da pista | 600,136 / 248,675; 437,668 × 139,258 | 168,590 / 69,858; 122,949 × 39,120 |
| Imagem da pista | 606,767 / 255,306; 424,406 × 127,985 | 170,453 / 71,721; 119,224 × 35,953 |
| Cabeçalho Bônus | 307,031 / 400,544; 99,535 × 39,103 | 86,251 / 112,520; 27,961 × 10,985 |
| Cabeçalho Origem | 661,807 / 402,321; 106,645 × 35,548 | 185,915 / 113,020; 29,959 × 9,986 |
| Imagem do planeta | 601,794 / 442,642; 135,942 × 135,942 | 169,056 / 124,347; 38,189 × 38,189 |
| Nome do planeta | 759,288 / 430,251; 161,745 × 47,991 | 213,299 / 120,866; 45,437 × 13,481 |
| Descrição do planeta (limite do objeto) | 759,288 / 480,772; 236,396 × 307,493 | 213,299 / 135,058; 66,408 × 86,381 |

As duas linhas de bônus são dinâmicas. Seus pontos de ancoragem, em coordenadas-base da arte, são `y=720` e `y=815`; rótulos em `x=605`, valores em `x=820` e ícones em `x=410`. A segunda linha medida ficou em ΔY **521,791** (rótulo desktop) e **146,581** (mobile), com o valor em ΔY **516,459** e **145,083**, respectivamente.

### Coordenadas-base internas da arte

São coordenadas fixas no espaço original de **1635 × 962**; o navegador as escala junto com a moldura.

| Conteúdo | Referência na arte-base |
|---|---|
| Centro do ícone do piloto | `(430, 132)` |
| Nome / título | `(520, 82)` / `(520, 168)` |
| Zonas das abas Piloto / Veículo | centros `(640, 292)` / `(1175, 292)`; cada zona `520 × 80` |
| Lore: título | área `(545,362)–(930,394)`; texto começa em `(475,420)` |
| Recorte do Lore | `(465,405)–(860,600)`, dimensão-base `395 × 195` |
| Prévia da pista: moldura | `(905,375)–(1565,585)`, dimensão-base `660 × 210` |
| Prévia da pista: imagem | `(915,385)–(1555,578)`, dimensão-base `640 × 193` |
| Título da pista | âncora `(923,397)` |
| Bônus: título | área `(445,617)–(690,650)` |
| Origem: título | área `(980,617)–(1250,650)` |
| Planeta: centro e tamanho máximo | centro `(1010,770)`, caixa máxima `205 × 205` |
| Nome / descrição do planeta | âncoras `(1145,685)` / `(1145,725)` |
| Recorte da descrição do planeta | largura-base `350`, altura-base `125`, a partir da descrição |

As âncoras e áreas são transformadas por `framePoint()` e `frameWidth()` em `CharacterDetails`; não são posições absolutas da viewport.

### Como interpretar os tipos de medida

- **Fixas:** tamanho da textura-base `1635 × 962`, largura local `610`, coordenadas de arte-base e limites de recorte codificados. São constantes do layout atual.
- **Relativas:** `ΔX/ΔY` na tabela de elementos internos, sempre medidas a partir do canto superior esquerdo da moldura. Coordenadas-base também são relativas à própria arte, não à tela.
- **Calculadas/observadas:** posição final, escala, largura/altura na tela e distâncias às bordas. São o resultado dos contêineres Phaser, dos limites da grade, do tamanho da viewport e do `getBounds()` medido em cada viewport indicada.

## Contêineres e cálculo da posição

Não há seletor CSS individual para a moldura: ela é desenhada no canvas Phaser. A hierarquia responsável é:

1. `CharacterSelectionScene.content` centraliza e escala a composição.
2. `CharacterSelectionScene.details` é o contêiner Phaser `CharacterDetails`, filho de `content`.
3. `CharacterDetails.panelArtwork` é a imagem-base centrada em `(0,0)` dentro de `details`; seus filhos incluem textos, abas, pistas e conteúdo de origem.
4. `CharacterSelectionScene.layout(w,h)` define tamanho-base e escolhe layout estreito ou desktop; `alignDesktopPanel()` calcula a escala e o centro do painel no desktop.

| Propriedade/transformação medida | Desktop | Mobile |
|---|---:|---:|
| `content` posição `(x,y)` | `(836,466)` | `(195,416)` |
| `content.scaleX / scaleY` | `1,05 / 1,05` | `0,499310 / 0,499310` |
| `details` posição no sistema local de `content` | `(259,924; -7,379)` | `(0; 445)` |
| `details.scaleX / scaleY` | `1,692777 / 1,692777` | `1 / 1` |
| Centro final da moldura na viewport | `(1108,920; 458,252)` | `(195; 638,193)` |

O centro acima é resultado de transformações encadeadas, não um `left/top` CSS. `panelArtwork` mantém ponto local `(0,0)` e tamanho-base `610 × 358,911` em ambos os tamanhos observados.

## Regras responsivas encontradas no código

- `Phaser.Scale.RESIZE` em `src/main.ts`: o canvas acompanha a largura e altura da janela. O layout recebe esses valores em `CharacterSelectionScene.layout(w,h)` após resize.
- **Estreito:** `w < 720`. Usa composição de design `680 × 1450`, grade de pilotos em `(0,-180)`, painel em `(0,445)`, botões na disposição estreita e texto de ajuda próprio para toque. Em viewport estreita, o painel usa escala local `0,83` apenas se também for compacto; fora disso, escala local `1`.
- **Compacto:** `h < 650`. É uma condição independente da largura. Reduz escala base dos elementos para `0,83`, usa composição desktop com altura de design `650` (ou a composição estreita quando `w < 720`), altera os limites/espaços do alinhamento desktop e oculta a ajuda inferior.
- `fitContent(w,h,designWidth,designHeight)` centraliza `content` em `(w/2,h/2-6)` e calcula a escala como `min((w-32)/designWidth, (h-120)/designHeight, 1,05)`.
- No desktop não compacto, `alignDesktopPanel()` calcula limites da grade, gap de `24`, margem lateral de `24` e crescimento do painel `1,1`; o tamanho final depende, portanto, do espaço disponível e dos limites medidos dos cards. No modo compacto os valores relevantes são gap `14`, margem `20`, limite de escala da grade `0,83`, crescimento do painel `1` e arte da grade em escala adicional `0,88`.
- No mobile medido (`390 × 844`), `narrow=true` e `compact=false`; assim a escala de `content` é `0,499310`, enquanto `details` tem escala local `1`. A moldura ocupa **304,579 × 179,208 CSS px**.
- No desktop medido (`1672 × 944`), ambas condições são falsas; `content` chega ao limite `1,05` e `alignDesktopPanel()` calcula escala local `1,692777` para `details`. A moldura ocupa **1084,224 × 637,935 CSS px**.

Essas regras explicam por que a área em pixels não é fixa entre resoluções. Para manter exatamente o mesmo espaço ocupado na próxima arte, preserve a dimensão-base, a proporção, o ponto central, o contêiner `details` e os cálculos responsivos existentes; substitua somente a textura visual.

## Arquivos e membros responsáveis

- `src/scenes/CharacterSelectionScene.ts`: `layout()`, `alignDesktopPanel()`, `fitContent()` herdado e `details` como parte da composição.
- `src/scenes/TitleScene.ts`: `content` e `fitContent()`; centralização e escala comum das cenas de título.
- `src/ui/CharacterDetails.ts`: classe `CharacterDetails`, constantes de coordenadas internas, `panelArtwork`, `framePoint()`, `frameWidth()` e sincronização das máscaras.
- `src/ui/CharacterSelectionAssets.ts`: `PILOT_DETAILS_FRAME_SIZE` (`1635 × 962`) e carregamento da textura `pilot-ui-details-frame`.
- `src/main.ts`: configuração do canvas com `Phaser.Scale.RESIZE`.

`PILOT_RACING_FRAME_KEY` / `trackFrame` é a moldura **interna da prévia da pista**, não a moldura externa do painel de detalhes.

## O que não deve ser confundido

- `panelArtwork.displayWidth=610` e `displayHeight=358,911` são dimensões-base do objeto no espaço Phaser; **não** são o tamanho final na tela.
- `getBounds()` foi medido após as transformações de `content` e `details`; esses são os limites finais na viewport.
- Os limites do objeto de texto podem exceder a região realmente visível. O Lore é recortado pela máscara de `395 × 195` unidades-base; a descrição do planeta pela máscara calculada de `350 × 125` unidades-base.
- O resultado documenta as duas viewports observadas; não afirma que esses mesmos pixels valham para toda resolução, zoom do navegador ou `devicePixelRatio`.
- A arte foi substituída sem mudar a geometria registrada. O retrato continua como camada independente sobre a moldura.
