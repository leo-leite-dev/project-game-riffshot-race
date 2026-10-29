# Inspeção local — Sci - Fi Buggy

## Escopo

Inspeção estática do contêiner GLB, JSON, accessors, vértices/índices e matrizes, por script próprio de leitura de dados. Não foram executados scripts fornecidos pelo modelo. O arquivo original não foi modificado nem copiado para `public/` ou build. A inspeção estática, por si só, não comprova renderização ou desempenho; os testes da integração local posterior estão registrados no fim deste documento. Aprovação visual continua sendo responsabilidade do proprietário.

## Identificação e licença

- Nome real: `referencias-locais/Vehicles/sci_-_fi_buggy.glb`.
- Tamanho: **29.082.948 bytes** (~27,74 MiB).
- glTF 2.0; gerador declarado `Sketchfab-16.14.0`.
- Metadados: título `Sci - Fi Buggy`, autor TiyaMakes, fonte https://sketchfab.com/3d-models/sci-fi-buggy-085bd97876a64eacbc041299ac945e9c .
- Metadados e página de origem apontam **CC BY 4.0**: https://creativecommons.org/licenses/by/4.0/ .
- A página informa aproximadamente 161,9 mil triângulos e 83,6 mil vértices; a contagem de entradas POSITION no GLB é maior por separação de UVs/normais/primitivas. Não são duas contagens equivalentes de vértices únicos.
- Não foi comparado hash com novo download. A correspondência é por metadados, identificador e contagem de triângulos.
- Nenhum documento adicional de licença/autoria foi encontrado junto ao arquivo. Ver condições, atribuição e limitações em `CREDITS.md`.

## Geometria e hierarquia

- **161.868 triângulos**, **148.630 entradas POSITION** somadas entre primitivas (não posições únicas deduplicadas).
- **82 nós, 42 meshes, 42 primitivas triangulares, 22 materiais**.
- **Zero animações e zero skins**; sem atributos JOINTS/WEIGHTS ou rig esquelético identificado. Não há clipes para listar por nome/duração/finalidade e não há justificativa para AnimationMixer neste arquivo atual.

```text
Sketchfab_model
└── bbc2e798c5ca477aa302563360771b51.fbx
    └── RootNode
        ├── main body → carroceria e elementos associados
        ├── frame → estrutura
        ├── tyre → tyre_Material.007_0 (par dianteiro)
        ├── rims → rims_rims_0 (par dianteiro)
        ├── tyre back → tyre back_Material.007_0 (par traseiro)
        ├── rim back → rim back_rims_0 (par traseiro)
        ├── front suspension → front suspension_front supension_0
        ├── rear suspension → rear suspension_rear suspension_0
        ├── motor → três meshes/materiais
        ├── seat / console / steering wheel
        └── fender / tail light / air intake / battery / peças adicionais
```

Suspensões são geometria separada, mas não um mecanismo articulado ou rig de compressão. Rodas, aros e suspensões são ramos irmãos: não há quatro conjuntos prontos de pivô de direção → pivô de rotação → pneu/aro. Alguns nós auxiliares têm nomes ilegíveis; não mapear funções críticas a esses nomes.

## Eixos, dimensões e rodas

As matrizes dos wrappers incluem conversões de eixos e fatores de escala. Após aplicá-las aos **vértices reais**, a caixa global mede aproximadamente:

- X: **17,031** unidades de largura;
- Y: **9,705** unidades de altura;
- Z: **25,178** unidades de comprimento.

Não interpretar esses números como metros reais. Não usar apenas os limites locais dos accessors transformados: uma caixa rotacionada pode superestimar dimensões. A adaptação precisa recentralizar, apoiar o pneu no solo e normalizar o comprimento visual, sem mudar o collider aprovado.

No mundo glTF carregado, Y é vertical, X é lateral e Z longitudinal. Os conjuntos nomeados dianteiros ficam perto de Z = -1,747 e os traseiros de Z = -20,466, indicando frente em +Z; confirmar a aparência em render antes de aprovar.

Verificação numérica de pneus e aros: **zero triângulos atravessam o plano lateral X=0** nos quatro meshes de roda. É possível separar as duas metades de cada eixo em memória por triângulos inteiros, preservando normals, UVs, tangents e materiais, sem recortar a superfície. Não basta rotacionar o nó original, pois ele contém os dois lados e não tem pivô centralizado por roda.

Centros aproximados dos pneus (antes de normalizar):

| Roda | X | Y | Z |
| --- | ---: | ---: | ---: |
| Dianteira, lado X negativo | -7,661 | -0,699 | -1,747 |
| Dianteira, lado X positivo | 7,661 | -0,699 | -1,747 |
| Traseira, lado X negativo | -7,476 | -0,699 | -20,466 |
| Traseira, lado X positivo | 7,476 | -0,699 | -20,466 |

Raio dos pneus: aproximadamente **2,490** unidades antes da normalização. Eixo de rotação: X; esterçamento: Y. Isso permite calcular rotação por deslocamento longitudinal/raio em vez de usar velocidade decorativa fixa. A geometria dos aros precisa compartilhar o pivô do pneu correspondente.

## Materiais e texturas

- **31 imagens embutidas**, sendo 30 PNG e uma JPEG; não é necessário solicitar texturas de endereços externos conforme a inspeção.
- PNGs: 16 de 2048×2048 e 14 de 1024×1024. A resolução da JPEG não foi decodificada nesta inspeção; não declarar as dimensões com base no cabeçalho PNG.
- Imagens somam **21.598.377 bytes comprimidos**. Isso não equivale à memória de GPU; mapas decodificados e mipmaps custam mais.
- Mapas PBR de cor, normal e metallic/roughness; extensões specular, clearcoat, emissive strength e texture transform.
- Todos os 22 materiais estão marcados doubleSided. Não remover essa característica sem avaliação visual.
- `main_body` é usado pela carroceria e para-lamas; permite aplicar tint em material clonado, mantendo mapas PBR. Não trocar a cor de `Atlas`, pneus, aros, suspensão ou materiais compartilhados de mecânica.

## Custo e riscos

- O modelo tem aproximadamente 162 mil triângulos por instância. Quatro instâncias representariam ~647 mil triângulos antes da pista, com custo adicional de mapas/materiais e meshes. Não há medição de FPS ou justificativa ainda para LOD automático.
- Compartilhar templates/geometrias/texturas e clonar apenas pintura e estado de animação. Separar rodas uma única vez no template, não por frame nem a cada repaint.
- Uma animação geral da carroceria não equivale a suspensão mecanicamente articulada. Limitar deslocamentos visuais para não separar molas, braços e cubos; informar essa limitação na avaliação visual.
- Nitro, dano e slip devem vir da simulação, não da inspeção nem de clipes inexistentes.

## Arquitetura aprovada e implementada — testes locais

1. Plugin Vite **somente em desenvolvimento**, com endpoint exato para este arquivo fixo. Sem parâmetros de caminho, listagem de diretórios, cópia para `public`, emissão de asset ou middleware no preview de produção. Falhas preservam o procedural.
2. Carregamento opt-in, por exemplo `?localRiftBlaze=1`, em módulo importado apenas sob `import.meta.env.DEV`. Produção sempre mantém os procedurais aprovados. Não mudar IDs, atributos ou save.
3. Template local de GLB normalizado, com os quatro conjuntos de rodas separados em memória e material de pintura explicitamente selecionado.
4. Adaptador visual: raiz segue pose interpolada; filho de carroceria recebe apenas peso/impacto visual; pivôs de direção/rotação independentes. Não escrever na simulação ou criar outro loop de corrida.
5. Fumaça com pool e geometria/textura própria, em espaço de mundo. Slip longitudinal/lateral, velocidade assinada, controle e nitro devem ser entradas de apresentação; nenhuma alteração do balanceamento para gerar efeitos.
6. Testes focados de pivôs, pintura, atributos, carregamento local e ausência de asset/rota de desenvolvimento no build/preview público. Medir custo no navegador, sem prometer 60 FPS em hardware não testado.

### Como ativar

Reinicie o Vite depois da alteração da configuração e abra `http://127.0.0.1:5173/?localRiftBlaze=1` (ajuste a porta se necessário). O arquivo permanece no nome real inspecionado. Selecione Rift Blaze e qualquer uma das três pinturas; a garagem e preparação mostram o modelo local e a identificação do autor. Na corrida, só o jogador usa o GLB. Bots, outros veículos e produção permanecem procedurais. Sem o parâmetro, nada é solicitado; carregamento inválido/ausente mantém o procedural e informa o fallback na garagem.

### Estado da implementação

- Plugin `scripts/localRiftBlazePlugin.js`: endpoint fixo `/__local-models/rift-blaze.glb`, GET/HEAD, no-store e streaming. Bloqueia diretórios redirecionados para fora por junction/symlink e bloqueia acesso genérico do Vite à pasta de referências. Não existe middleware no build/preview de produção.
- `BuggyTemplate`: aplica transforms e normaliza, separa índices e atributos por lado, cria pivôs e compartilha geometrias/texturas. Pinturas clonam somente `main_body` por carro. Não há gravação de GLB derivado.
- `BuggyVisualAdapter`: recebe telemetria interpolada derivada da física (velocidades longitudinal/lateral assinadas, comando de direção, aceleração e intensidade de impacto). Não escreve em posição física, checkpoints, carteira ou saves. A raiz continua sendo posicionada exclusivamente por `RaceWorld`.
- Rodas giram por `velocidade longitudinal × dt / raio`, com ré e parada naturais; dianteiras esterçam em pivô separado. Nenhum AnimationMixer ou loop paralelo.
- Suspensão é **aproximação visual limitada**: pitch/roll/heave suaves no grupo da carroceria e suspensão, com pneus apoiados. Não há reconstrução de molas/triângulos articulados ou curso individual real; validar folgas nos maiores ângulos antes de expandir movimentos.
- Fumaça própria: pool de 128 pontos, círculos em shader sem imagem, vida 0,6–1 s, emissão somente acima de 3 unidades/s longitudinais e 2 laterais; traseiras recebem maior intensidade. Partículas ficam no mundo e são liberadas com a cena.
- Propulsão: dois cones luminosos originais nas âncoras traseiras, visíveis somente durante `nitroActive`. Não modificam cargas, duração ou limite de velocidade.

### Medições e limites

Chromium/ANGLE **SwiftShader por software**, amostras automatizadas: carga/template ~604–652 ms (não inclui compilação/upload de todos os shaders/texturas); framebuffer da corrida limitado pelo sistema existente; 33 texturas e 54 geometrias residentes na preparação segundo `renderer.info.memory` — contagens, não bytes nem VRAM medida. Corrida: ~2,5–3,2 FPS, 103–127 draw calls e ~178 mil triângulos visíveis, um jogador detalhado + três bots procedurais. A última amostra mediu ~2,48 FPS, 127 draw calls, 178.476 triângulos e ~0,1 ms para submissão CPU da animação. Não são medições em GPU física ou prova de 60 FPS. O relógio do navegador limita a precisão desse tempo de animação; ele não representa tempo de GPU.

Antes de permitir mais instâncias, recomenda-se avaliar **cópia de texturas reduzidas em memória** e mapas não visíveis nas câmeras de jogo, medir em GPU física, depois estudar LOD. Nenhuma redução foi aplicada silenciosamente: qualidade/texturas originais foram mantidas. O desempenho baixo do software é limitação real do teste.

### Verificações disponíveis

- `node --test tests/buggy-visual.unit.js tests/tire-smoke.unit.js tests/local-rift-route.unit.js`.
- `npm.cmd test -- --project=desktop tests/local-buggy.spec.js --retries=0 --max-failures=1`.
- `npm.cmd run test:race`, `test:controls` e `test:camera` preservam verificações de física/IA/câmeras.
- Capturas ignoradas em `test-results/.../buggy-garage-blue.png`, `buggy-preparation.png`, `buggy-race-chase.png` e `buggy-race-isometric.png`.

Os testes de slip/impacto usam entradas controladas do adaptador e não comprovam qualidade de uma derrapagem pilotada. Ausência de tremedeira, contato da garra/rodas e orientação visual final dependem da avaliação do proprietário. Não há aprovação visual ou autorização de publicação implícita.
