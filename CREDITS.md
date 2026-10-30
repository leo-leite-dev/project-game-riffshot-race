# Créditos e restrições de distribuição

## Modelos GLB atuais — cinco veículos / cinco assets distintos

Os modelos abaixo são disponibilizados pela fábrica compartilhada. A seleção inicial e as regras da loja pertencem ao catálogo. O plugin emite exclusivamente os cinco arquivos da allowlist em `/assets/models/vehicles/`, a partir do pacote versionado em `public/assets/models/vehicles/`, com tamanhos e SHA-256 conferidos pelo manifesto. “Allowlist” é aprovação técnica de empacotamento, não certificação jurídica. A pasta `referencias-locais/` não é publicada; os originais locais permanecem inalterados. **THUNDER BUG** substitui a apresentação anterior de `rift-blaze`, preservando esse ID e os saves. **Race Car 2** usa `modelFile: race_car2.glb` como alias para `race_car.glb` (SHA-256 `71e361015328d4a1eb8e556890665294730bb09b401c1ba11ce66983968a5e2f`); não depende de um arquivo `race_car2.glb`, nem o publica.

| IDs no jogo | Arquivo publicado | Título e autoria declarados no GLB | Fonte |
| --- | --- | --- | --- |
| `rift-blaze` (THUNDER BUG) | `thunder_bug.glb` (derivado sem perdas) | **race car**, Chenchanchong — https://sketchfab.com/Chenchanchong | https://sketchfab.com/3d-models/race-car-97768c0e69744cd5922ddc5a9fd59266 |
| `race-car-2` | `race_car.glb` | **Race Car**, Tasneem — https://sketchfab.com/Tasneem | https://sketchfab.com/3d-models/race-car-517dfa8823394b178c9c313d7e68fb7f |
| `volt-vector` (CAMARO no catálogo) | `camaro.glb` | **Transformers Universe: Drive-By's Vehicle Form**, Primus03 — https://sketchfab.com/Primus03 | https://sketchfab.com/3d-models/transformers-universe-drive-bys-vehicle-form-1eee5b31a3dd46ef9b91a95b9261e7f8 |
| `iron-bastion` | `armored_car_death_race.glb` | **Armored car (death race)**, jaack — https://sketchfab.com/jaack | https://sketchfab.com/3d-models/armored-car-death-race-ea76bac506f04676b8514951b67994f8 |
| `widowmaker` | `widowmaker_-_death_race_2000.glb` | **Widowmaker - Death Race 2000**, Brian Trepanier — https://sketchfab.com/CMBC | https://sketchfab.com/3d-models/widowmaker-death-race-2000-15b6eb31787446879f063bb9b25cbc5c |

Licença declarada para os cinco arquivos: **Creative Commons Attribution 4.0 International (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/ . Títulos, autores e fontes foram lidos de `asset.extras`; as páginas de origem foram consultadas em 28/10/2026 e também indicam CC Attribution. No Thunder, os metadados e a página confirmam título **race car**, autor **Chenchanchong** e o identificador `97768c0e69744cd5922ddc5a9fd59266`. Não houve comparação com downloads independentes. A atribuição não implica endosso dos autores ao projeto.

Procedência relevante, conforme as próprias páginas: **Tasneem diz que usou a malha para praticar texturização e não é dono do modelo**. **Primus03 descreve o Camaro como um modelo sem alterações extraído de Transformers Universe, da Jagex**. A declaração CC BY pelo uploader não comprova direitos sobre essas malhas, marcas ou designs de terceiros. Os avisos distribuídos registram essas informações expressamente; não se afirma liberação independente de direitos.

Adaptações de apresentação em memória: rotação para frente +Z, centralização XZ, alinhamento do ponto inferior a y=0 e escala uniforme para comprimento 3,25. Yaw após as transformações do arquivo: Thunder 0° (faróis +Z); Race Car 2 +90° (frente original −X); Camaro 0° (frente +Z); Armored −90° (frente +X); Widowmaker −34,52° (arquivo diagonal, alinhado pelo retângulo XZ de área mínima e conferido por projeção da malha). As dimensões vêm dos vértices transformados, não das caixas aproximadas do catálogo.

Os atlas originais são preservados: `Vechicle_Main` mistura peças e detalhes; os dois atlas do Camaro cobrem rodas/carroceria e outros detalhes; `Car01` é compartilhado por carroceria/rodas; `Material_0` do Widowmaker cobre o veículo inteiro. Não há material de tinta isolado identificado com segurança. Assim, os GLBs atuais declaram `paintSupported: false`, `paintMaterials: []` e mantêm a pintura original (a escolha `paintId` continua registrada).

Todos os cinco modelos têm quatro rodas com pivôs próprios por instância, preparados uma vez no template: Thunder separa os quadrantes das malhas agregadas Rims/Object_59, Discs/Object_61, Tire/Object_63 e Klotz/Object_65; as pinças acompanham esterço, sem girar com o pneu. Camaro separa os quatro componentes de 178 triângulos da primeira malha. Race Car 2 separa os dois pares de rodas, mantendo o estepe fixo. Armored preserva os transforms das quatro rodas de nomes duplicados, inclusive os 20° de esterço autoral dianteiro. Widowmaker usa volumes cilíndricos explícitos para pneus/cubos das três malhas mistas; **183.786 triângulos** continuam na carroceria fixa e **21.502** nas rodas. Nenhum triângulo é cortado, removido ou duplicado; UVs, materiais e demais atributos são preservados. Na borda conservadora do scan do Widowmaker podem existir pequenas costuras durante o movimento; a aparência animada ainda requer a validação final em navegador.

O adaptador próprio anima giro no eixo local +X, esterço dianteiro Y e, somente no Thunder, o clipe original **Fan** (rotação do nó 8 `EngineFan_Engine_0_000_5`, 101 chaves, duração 2 s). Skins, morphs, recursos externos e outros clipes continuam bloqueados. Não há processamento de geometria por frame. O experimento Sci - Fi Buggy permanece separado e opt-in.

### Thunder Bug — derivado de distribuição

`scripts/optimizeThunderBug.js` reutiliza o processo sem perdas do buggy: recompressão/refiltro PNG, remoção de 41 atributos UV não utilizados pelos materiais, compactação de 21 accessors de índices e união de 162 vértices com todos os atributos retidos idênticos. Deduplicação adicional de dados/imagem embutidos economiza **1.440.417 bytes**; a recompressão PNG economiza **276.750 bytes**. As imagens passam de 31 referências originais para 30 fontes únicas; suas dimensões e pixels permanecem idênticos. Todos os 63.181 triângulos, UVs usados e dados do Fan são preservados.

- Original: **28.914.440 bytes**, SHA-256 `4f642d8d02b8669e85f69e6e89ec0868bb5b6da3b745446c4b65649d1ee44644`.
- Derivado: **25.452.592 bytes (24,27 MiB)**, abaixo de 25 MiB; SHA-256 `1fb69db423f5a360dadb17fbbc073e2f02729c6776bc04c20fae64fcd3930feb`.
- Preparado explicitamente por `npm run assets:prepare` e versionado em `public/assets/models/vehicles/thunder_bug.glb`. Dev e build conferem esse payload pelo manifesto, sem depender das referências privadas nem repetir a otimização. O original privado nunca é sobrescrito; falha de preparação não entrega o original acima do limite.
- Recompressão PNG reduz transferência, não a memória RGBA8 decodificada. Não houve redimensionamento ou compressão com perdas.

### Inventário técnico / custo estimado

| Asset distinto | Bytes GLB | Triângulos | Meshes | Dimensões normalizadas X/Y/Z | Texturas RGBA8 + mipmaps estimadas |
| --- | ---: | ---: | ---: | --- | ---: |
| Thunder Bug (derivado) | 25.452.592 | 63.181 | 21 | 2,37113 / 1,51635 / 3,25 | 130,69 MiB (23 imagens 1024², 6 de 512² e 1 de 64², antes de eventuais cópias por uso/formato) |
| Race Car | 10.411.768 | 26.915 | 61 | 1,94755 / 1,17171 / 3,25 | 69,33 MiB (13 imagens 1024²) |
| Camaro | 530.436 | 6.593 | 2 | 1,31916 / 0,89791 / 3,25 | 1,42 MiB (128² + 512²) |
| Armored | 9.936.700 | 23.444 | 6 | 1,37272 / 0,98887 / 3,25 | 32 MiB (6 imagens 1024²) |
| Widowmaker | 7.577.992 | 205.288 | 3 | 1,27541 / 1,01240 / 3,25 | 5,33 MiB (1 imagem 1024²) |

Total transferido sem compressão HTTP ao carregar todos: **53.909.488 bytes**, sem duplicar Race Car 2. Estimativa-base de texturas: **238,77 MiB**, antes de buffers, framebuffer, possíveis cópias por uso e ambiente; o driver/formato/upload real pode variar. O custo elevado do ambiente existente permanece relevante. `GarageResources.load(vehicleIds)` permite ao chamador carregar somente os IDs necessários; `load()` mantém compatibilidade e carrega todos. Meshes da tabela são os originais; após separar rodas, a apresentação tem Thunder 33, Race Car 2 63, Camaro 5, Armored 6 e Widowmaker 15 malhas. Não são medições de draw calls: vidro/transmission (Armored), transparências e passes do renderer podem aumentar o custo. Nenhuma medição de GPU física/FPS foi realizada nesta integração. Geometrias derivadas, texturas e materiais são compartilhados por instâncias; o cache é por jogo, incluindo promises em andamento e falhas, e descarta recursos uma vez, inclusive resultados que chegam após destroy. `resources.metrics` fornece um snapshot somente leitura de modelos carregados e falhas/fallbacks.

## Histórico preservado: Sci - Fi Buggy — candidato anterior ao Rift Blaze

O registro abaixo documenta a etapa anterior. O modelo padrão atual do ID `rift-blaze` é **Thunder Bug**, listado acima; o candidato otimizado do buggy não integra a allowlist de produção.

- Original local preservado: `referencias-locais/Vehicles/sci_-_fi_buggy.glb` (nome diferente de `sci_fi_buggy.glb`).
- Candidato criado: `referencias-locais/legacy-assets/vehicles/rift-blaze/rift-blaze.glb`, 27.208.448 bytes. Ainda excede o limite de 25 MiB do Pages; não foi incluído em `dist`, publicado ou ligado como modelo padrão. Relatório em `docs/RIFT_BLAZE_OPTIMIZATION.md`.
- Título declarado no GLB: **Sci - Fi Buggy**.
- Autor declarado: **TiyaMakes** — https://sketchfab.com/tiyamakes
- Fonte: https://sketchfab.com/3d-models/sci-fi-buggy-085bd97876a64eacbc041299ac945e9c
- Licença declarada nos metadados: **CC-BY-4.0**. A página de origem também aponta Creative Commons Attribution para https://creativecommons.org/licenses/by/4.0/ .
- A identidade de título, autoria e URL coincide entre o arquivo e a página; não foi feita comparação de hash com um download independente.
- A licença permite compartilhar e adaptar, inclusive comercialmente, sob suas condições: manter atribuição e avisos fornecidos, linkar a licença, indicar modificações e não sugerir endosso do autor. Não impor restrições jurídicas/tecnológicas incompatíveis com os direitos licenciados.
- A licença não garante direitos de terceiros sobre eventuais marcas/designs representados. Não foram localizados documentos de licença adicionais junto ao arquivo; não há comprovação jurídica independente de originalidade.
- Modificações aplicadas ao candidato: otimização **SEM PERDAS** das imagens PNG, compactação de índices, união de vértices com atributos idênticos e remoção de conjuntos UV não utilizados. O original local permanece preservado; hashes registrados em `referencias-locais/legacy-assets/vehicles/rift-blaze/optimization.json`.
- Adaptações da integração em memória: separação de rodas/aros por lado, aplicação das matrizes em geometrias de apresentação, normalização da escala para 3,25 unidades de comprimento, pivôs independentes, pintura do material `main_body`, animações próprias de rodas e carroceria e partículas originais do projeto.
- O modelo não possui clipes embutidos. As animações/partículas adicionadas são código próprio, não material criado pelo autor do GLB.
- Estado atual: histórico de experimento anterior, não distribuído nesta versão. Não integra `public/assets/models/vehicles/` nem a allowlist atual; THUNDER BUG é o modelo oficial do ID preservado.
- Histórico: a integração começou em testes locais opt-in via `?localRiftBlaze=1`. O código do adaptador não contém os buffers do modelo. Registro técnico dessa etapa: `docs/LOCAL_BUGGY_INSPECTION.md`.
- Crédito acessível ao jogador: link HTML “Créditos e licenças” no shell, para `credits.html`; a página também oferece os avisos completos em `THIRD_PARTY_NOTICES.txt`. Ambos são gerados da mesma fonte `THIRD_PARTY_NOTICES.md`.

Crédito preparado para a integração oficial: **“Sci - Fi Buggy”, de TiyaMakes, disponível no Sketchfab (link acima), sob CC BY 4.0 (link acima). Adaptado para o Rift Blaze com otimizações sem perdas de PNG, compactação de índices, remoção de UV sets não utilizados, separação em memória de rodas/aros, pivôs, pintura `main_body`, escala, animação própria e partículas originais do projeto. Esta atribuição não implica endosso do autor ao Rift Blaze ou ao RIFFSHOT RACING.**

## Modelo provisório Air Blade — removido do jogo

- Arquivo: `public/models/cars/air_blade_rock_n_roll_racing.glb`.
- Título declarado: **Air blade Rock N\` Roll Racing**.
- Autor declarado: **Linomig** — https://sketchfab.com/linomig
- Origem: https://sketchfab.com/3d-models/air-blade-rock-n-roll-racing-d1253a4efaef43cc9e10927289c62e99
- Licença declarada pelo autor e nos metadados: **Creative Commons Attribution 4.0 International (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/
- Uso anterior: prévia local de desenvolvimento, sem alteração do arquivo. O modelo não faz mais parte do aplicativo nem é carregado pelo jogo.

O proprietário autorizou exclusivamente o uso provisório em desenvolvimento e testes locais. Isso **não confirma direitos autorais nem autoriza distribuição pública**. A licença declarada pelo modelador não esclarece eventuais direitos de terceiros sobre o design reproduzido.

O arquivo local foi preservado em um backup privado fora do repositório antes de ser removido da pasta `public`. O build não o publica. A preparação dos créditos oficiais do Sci - Fi Buggy para o Rift Blaze, descrita acima, não reintroduz Air Blade. O backup permanece sujeito à autorização provisória de uso local indicada acima; não distribuir nem reintroduzir esse modelo.

## Arte procedural do projeto

Garagem, braço mecânico, plataformas, painéis, ícones, veículos procedurais, favicon, fundos e retratos são desenhados por código; não há sprites, capturas de tela, fontes ou gravações de outros jogos no build. A Estação de Equipe usa fundo industrial, lua vermelha, molduras e título próprios de `StationArt.js`, além do retrato original de **Ravik Ferro, O Fundidor**. A imagem local de layout foi somente referência de composição e não é distribuída, inclusive seu retrato protegido. O logo RIFFSHOT RACING também é desenhado por código. Isso descreve a criação dos arquivos, mas **não certifica exclusividade jurídica nem ausência de semelhança**.

## Identidade RIFFSHOT RACING

- Nome público escolhido pelo proprietário: **RIFFSHOT RACING**.
- Slogan: **“Sinta a batida. Pise fundo. Abra fogo.”**
- O logotipo novo usa lettering cromado e um emblema original de palheta/onda sonora, desenhados por código. A mudança visual não equivale a busca ou liberação de marca.
- Dax Voltage substitui Raze Riot: personagem descrito como técnico de ressonância/engenharia de som das arenas orbitais. O retrato é criado por vetores Canvas no projeto. O nome, perfil e aparência ainda exigem revisão de direitos; não foi feita uma busca jurídica exaustiva.
- Vera Volt, Kira Comet, Echo-7, Atlas Knox e Zuri Spark permanecem no elenco, com estatísticas e funções preservadas. Seus retratos são ilustrações procedurais próprias com motivos distintos (crista mecânica, capuz-cartógrafo, sensor assimétrico, respirador de carga e bobina de propulsor); não usam arquivos de imagem externos. Isso não substitui comparação independente com catálogos de personagens.
- A preparação foi redesenhada como estação de equipe assimétrica, sem reproduzir uma captura de tela ou arte do jogo clássico. Ainda preserva grupos funcionais comuns — piloto/rival, temporada, pontuação, condição do veículo e módulos — por requisito do jogo; essa inspiração de estrutura merece revisão jurídica antes da publicação.
- A antiga integração do GLB Air Blade foi removida; este registro permanece para identificar a procedência do backup local e a restrição de não distribuição.

Antes de distribuição pública, o proprietário deve confirmar que pode usar RIFFSHOT RACING, o slogan, Dax Voltage, os demais personagens e a estrutura da estação de equipe, ou obter orientação jurídica. Este inventário não é parecer jurídico nem confirmação de marca registrada disponível.

## Áudio e fontes

- A trilha é sintetizada em tempo de execução pelo código original de `src/audio/rockLoop.ts`; ela não utiliza gravações externas.
- Motores são perfis sintéticos originais de `src/audio/RaceEngineAudio.ts`; não usam gravações de veículos ou samples externos. Explosões, colisões e fallback de efeitos também são sínteses do projeto.
- Disparo do Widowmaker, impacto de tiro e derrapagem usam localmente `canhão_disparo_windowmaker.mp3`, `impacto_disparo.mp3` e `pneu_derrapando.mp3`, fornecidos pelo proprietário em `referencias-locais/audio/`. Autoria, origem e licença não foram informadas; não são declarados como originais nem como recursos livres de direitos. Até a confirmação de autorização, esses MP3 não são publicados: o build usa os efeitos procedurais existentes como fallback. O arquivo do disparo preserva o nome e os bytes originais.
- A interface usa fontes de sistema (“Arial”, “Arial Black”, “Consolas” e alternativas genéricas). Nenhum arquivo de fonte é distribuído.
- O modelo de terceiros Sci - Fi Buggy e suas texturas estão identificados na seção do Rift Blaze acima, com atribuição oficial preparada; este inventário não confirma sua publicação.

## Licenças de software

- Phaser 3 — licença MIT.
- Three.js — licença MIT.
- Vite — licença MIT (ferramenta de desenvolvimento/build).
- Playwright — licença Apache-2.0 (dependência de testes).

Os créditos do Rift Blaze e os avisos MIT integrais de Phaser e Three.js são emitidos no build em `dist/THIRD_PARTY_NOTICES.txt`; a fonte é `THIRD_PARTY_NOTICES.md`. O jogador pode consultá-los pelo link HTML “Créditos e licenças” na página do jogo. Vite e Playwright não são runtime da página.

Os metadados e descrições no repositório são inventário técnico, não parecer jurídico nem prova independente de autoria. Antes da publicação, o proprietário deve confirmar os direitos de marca/título, de Dax Voltage e demais personagens, da estrutura inspirada da estação de equipe e dos outros elementos criativos, assim como a autoria e possibilidade de distribuição da música procedural.
