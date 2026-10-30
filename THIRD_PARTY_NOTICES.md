# Avisos de licenças de terceiros incluídos na versão web

Estes créditos e avisos acompanham a versão web em `credits.html` e `THIRD_PARTY_NOTICES.txt`, acessíveis pelo link “Créditos e licenças” no canto inferior direito do jogo. Incluem os cinco modelos GLB, suas adaptações, os sons sintetizados do projeto e os avisos MIT dos componentes distribuídos. Nos cinco modelos atuais, a licença declarada é CC BY 4.0; nenhum deles foi reclassificado como CC0.

## Modelos de veículos GLB atuais

### THUNDER BUG — race car

- Título original: **race car**. THUNDER BUG é o nome no catálogo deste projeto.
- Autor declarado: **Chenchanchong** — https://sketchfab.com/Chenchanchong
- Fonte: https://sketchfab.com/3d-models/race-car-97768c0e69744cd5922ddc5a9fd59266
- Licença declarada: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/
- Título, autoria, fonte e licença coincidem entre `asset.extras` e a página consultada em 28/10/2026.
- Adaptado para o ID persistente `rift-blaze`, com normalização, separação de rodas/aros/discos, pivôs e animação própria de rodas; pinças acompanham o esterço sem girar com os pneus. O clipe **Fan** do autor (2 s, nó EngineFan) é preservado e reproduzido por instância.
- Derivado de distribuição sem perdas: recompressão PNG, remoção de UVs não usados, índices compactados, união de vértices com atributos idênticos e deduplicação de dados/imagem embutidos. Preserva pixels, dimensões das imagens, triângulos, UVs usados e animação Fan. O original de 28.914.440 bytes permanece inalterado; derivado de 25.452.592 bytes disponibilizado como `thunder_bug.glb`.

### RACE CAR 2 — Race Car

- Título: **Race Car**.
- Autoria declarada: **Tasneem** — https://sketchfab.com/Tasneem
- Fonte: https://sketchfab.com/3d-models/race-car-517dfa8823394b178c9c313d7e68fb7f
- Licença declarada: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/
- Adaptado para `race-car-2`; `race_car2.glb` é um alias do único original local `race_car.glb`, sem exigir ou publicar um arquivo duplicado.
- Ressalva expressa da página de origem: o uploader diz que usou a malha para praticar texturização e **não é dono do modelo**. A licença declarada não comprova autorização do titular da malha original.

### CAMARO — Transformers Universe: Drive-By's Vehicle Form

- Título original do asset: **Transformers Universe: Drive-By's Vehicle Form**. “CAMARO” é o nome usado pelo catálogo deste projeto, não o título original do download.
- Autoria/uploader declarado: **Primus03** — https://sketchfab.com/Primus03
- Fonte: https://sketchfab.com/3d-models/transformers-universe-drive-bys-vehicle-form-1eee5b31a3dd46ef9b91a95b9261e7f8
- Licença declarada: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/
- A própria página descreve o arquivo como um modelo sem rig e sem edições do modo veículo de Drive-By, de **Transformers Universe, da Jagex**. A declaração de licença pelo uploader não demonstra direitos de redistribuição sobre o conteúdo original do jogo ou sobre marcas/designs representados.

### ARMORED CAR — Armored car (death race)

- Título: **Armored car (death race)**.
- Autoria declarada: **jaack** — https://sketchfab.com/jaack
- Fonte: https://sketchfab.com/3d-models/armored-car-death-race-ea76bac506f04676b8514951b67994f8
- Licença declarada: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/
- Adaptado para o ID `iron-bastion`.

### WIDOWMAKER — Widowmaker - Death Race 2000

- Título: **Widowmaker - Death Race 2000**.
- Autoria declarada: **Brian Trepanier** — https://sketchfab.com/CMBC
- Fonte: https://sketchfab.com/3d-models/widowmaker-death-race-2000-15b6eb31787446879f063bb9b25cbc5c
- Licença declarada: **CC BY 4.0** — https://creativecommons.org/licenses/by/4.0/
- Adaptado para o ID `widowmaker`.

### Condições e modificações dos cinco assets

Títulos, autores/uploader, URLs e licenças foram extraídos dos metadados `asset.extras` dos GLBs fornecidos localmente; as cinco páginas de origem, consultadas em 28/10/2026, também indicam CC Attribution. Não houve verificação por download independente nem comprovação adicional da titularidade dos uploaders.

Modificações de apresentação em memória: ajuste uniforme para comprimento 3,25, centralização, alinhamento do chão a y=0 e rotação para frente +Z (Thunder 0°, Race Car 2 +90°, Camaro 0°, Armored −90°, Widowmaker −34,52°). Separação de triângulos completos para quatro rodas por veículo, preservando UVs/atlas, materiais e transforms de repouso; pivôs independentes e animação própria de giro e esterço. Estepe de Race Car 2 permanece fixo; orientação dianteira original de Armored é preservada. No Widowmaker, pneus/cubos são selecionados por regiões cilíndricas explícitas nas malhas mistas, deixando a carroceria fixa. As animações de rodas são código do projeto, não criações dos autores dos GLBs; Fan do Thunder é o clipe original. Os originais privados não são editados e não se aplica tinta global aos atlas mistos. A otimização do derivado Thunder está descrita acima; os demais binários permanecem sem modificações.

A **Creative Commons Attribution 4.0 International** permite compartilhar e adaptar o material, inclusive comercialmente, nos termos da licença: manter atribuição e avisos fornecidos, indicar alterações e fornecer o link da licença. Não impor restrições jurídicas ou tecnológicas incompatíveis com os direitos licenciados. Consulte https://creativecommons.org/licenses/by/4.0/ e o texto integral em https://creativecommons.org/licenses/by/4.0/legalcode .

Estas atribuições não implicam endosso dos autores, uploaders, titulares de marcas ou dos jogos/filmes citados ao RIFFSHOT RACING. A licença é fornecida sem garantias e não assegura direitos de terceiros sobre marcas, designs ou elementos representados. As ressalvas de procedência de Race Car e do arquivo chamado Camaro estão explicitadas acima.

## Histórico de desenvolvimento — Sci - Fi Buggy (experimento separado)

O registro abaixo foi preservado como histórico do candidato anterior. O ID `rift-blaze` padrão atual usa Thunder Bug; Sci - Fi Buggy não faz parte da allowlist dos cinco GLBs de produção.

“Sci - Fi Buggy”, de TiyaMakes.

- Autor: TiyaMakes — https://sketchfab.com/tiyamakes
- Fonte: https://sketchfab.com/3d-models/sci-fi-buggy-085bd97876a64eacbc041299ac945e9c
- Licença do modelo: Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/
- Adaptação para o veículo Rift Blaze de RIFFSHOT RACING.

Modificações da adaptação: otimização SEM PERDAS das imagens PNG; compactação de índices e remoção de conjuntos UV não utilizados; separação em memória de rodas e aros; pivôs independentes; pintura do material `main_body`; ajuste de escala; animação própria e partículas originais do projeto. As animações e partículas adicionadas não são criações de TiyaMakes.

Estado deste registro: histórico de um experimento anterior, não distribuído nesta versão. O modelo atual desse veículo é o Thunder Bug; manter este crédito histórico não reintroduz o buggy na distribuição.

A CC BY 4.0 permite compartilhar e adaptar o material, inclusive comercialmente, cumprindo suas condições: atribuir a autoria, preservar os avisos fornecidos, indicar alterações e fornecer o link da licença. Não se podem impor restrições jurídicas ou tecnológicas incompatíveis com os direitos concedidos pela licença. Consulte os termos no link acima.

Esta atribuição não implica endosso de TiyaMakes ao Rift Blaze ou ao RIFFSHOT RACING. A licença é fornecida sem garantias e não assegura direitos de terceiros sobre eventuais marcas, designs ou outros elementos representados.

## Música, motores e efeitos originais

**Neon Ignition** é a trilha sintética original do projeto RIFFSHOT RACING, gerada pelo código `src/audio/rockLoop.ts`. Os motores são timbres originais sintetizados por `src/audio/RaceEngineAudio.ts`, com osciladores e filtros; não usam gravações, músicas comerciais ou samples extraídos de outros jogos.

A faixa **Neon Furnace** foi fornecida pelo proprietário, que declara tê-la criado com auxílio de IA. O áudio foi extraído do vídeo local `music-fase-1.mp4`, sem incorporar o vídeo ao jogo; o arquivo MP4 permanece em `referencias-locais/audio/` e não é distribuído. A autoria informada é uma declaração do proprietário, não uma verificação independente do processo de geração.

Os MP3 de disparo do Widowmaker, impacto e derrapagem foram fornecidos pelo proprietário, mas a autoria, a origem e a licença ainda não foram confirmadas. Os arquivos originais permanecem em `referencias-locais/audio/`, não são enviados a `dist/` nem declarados como criações originais ou recursos livres de direitos. Em produção, o disparo, o impacto e a derrapagem usam os efeitos procedurais existentes. Explosões e colisões também continuam sintetizadas pelo projeto.

**RIFFSHOT RADIO** consulta metadados na API gratuita Radio Browser (<https://api.radio-browser.info/>). A API fornece catálogo/endereços, não licença para o conteúdo musical das emissoras. O jogo toca os streams HTTPS diretamente no navegador e não os baixa, grava nem retransmite. A emissora responde por seus direitos e restrições; uma estação pode exigir confirmação de autorização antes de publicação comercial. A documentação de integração fica em `docs/RIFFSHOT_RADIO.md`.

Garagem, cenários, retratos, interface, animação das rodas, fumaça e explosões adicionados pelo projeto são apresentação/código próprios, não recursos criados pelos autores dos GLBs. A animação Fan do Thunder é original do modelo e está identificada na atribuição correspondente.

As licenças CC BY dos modelos e MIT dos componentes abaixo se aplicam aos respectivos recursos; esta página não concede uma licença nova ao código, música ou demais criações próprias do projeto. As atribuições não sugerem endosso de autores, marcas ou titulares ao jogo.

## Phaser 3

The MIT License (MIT)

Copyright (c) 2024 Richard Davey, Phaser Studio Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Three.js

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## eventemitter3 — componente utilizado pelo Phaser

The MIT License (MIT)

Copyright (c) 2014 Arnout Kazemier

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Ferramentas não incluídas no runtime da página

Vite e Playwright são usados apenas em desenvolvimento, build e testes; não são carregados pelo navegador no build do jogo. Suas licenças declaradas constam nos metadados dos pacotes fixados em `package-lock.json`.
