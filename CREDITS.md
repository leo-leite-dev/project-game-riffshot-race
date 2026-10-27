# Créditos e restrições de distribuição

## Modelo provisório Air Blade — somente desenvolvimento e testes locais

- Arquivo: `public/models/cars/air_blade_rock_n_roll_racing.glb`.
- Título declarado: **Air blade Rock N\` Roll Racing**.
- Autor declarado: **Linomig** — https://sketchfab.com/linomig
- Origem: https://sketchfab.com/3d-models/air-blade-rock-n-roll-racing-d1253a4efaef43cc9e10927289c62e99
- Licença declarada pelo autor e nos metadados: **Creative Commons Attribution 4.0 International (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/
- Uso no protótipo: três cores aplicadas ao material de pintura em memória. O GLB original não é alterado. A animação de suspensão permanece desativada.

O proprietário autorizou exclusivamente o uso provisório em desenvolvimento e testes locais. Isso **não confirma direitos autorais nem autoriza distribuição pública**. A licença declarada pelo modelador não esclarece eventuais direitos de terceiros sobre o design reproduzido.

O GLB está ignorado pelo Git e é carregado somente no servidor de desenvolvimento. O build de produção do Vite **não copia a pasta `public`**; emite somente o favicon SVG revisado e os avisos de licença de runtime. Verifique `dist/models/` antes da distribuição: o GLB não pode estar presente. A geometria procedural original é utilizada quando o GLB não está disponível e também em produção.

## Arte procedural do projeto

Garagem, braço mecânico, plataformas, painéis, ícones, veículo público ORIGINAL RACER, silhueta de rival, favicon, fundos e retratos são desenhados por código; não há sprites, capturas de tela, fontes ou gravações de outros jogos no build. O logo RIFFSHOT RACING também é desenhado por código. Isso descreve como os arquivos foram criados, mas **não certifica exclusividade jurídica nem ausência de semelhança**.

## Identidade RIFFSHOT RACING

- Nome público escolhido pelo proprietário: **RIFFSHOT RACING**.
- Slogan: **“Sinta a batida. Pise fundo. Abra fogo.”**
- O logotipo novo usa lettering cromado e um emblema original de palheta/onda sonora, desenhados por código. A mudança visual não equivale a busca ou liberação de marca.
- Dax Voltage substitui Raze Riot: personagem descrito como técnico de ressonância/engenharia de som das arenas orbitais. O retrato é criado por vetores Canvas no projeto. O nome, perfil e aparência ainda exigem revisão de direitos; não foi feita uma busca jurídica exaustiva.
- Vera Volt, Kira Comet, Echo-7, Atlas Knox e Zuri Spark permanecem no elenco, com estatísticas e funções preservadas. Seus retratos são ilustrações procedurais próprias com motivos distintos (crista mecânica, capuz-cartógrafo, sensor assimétrico, respirador de carga e bobina de propulsor); não usam arquivos de imagem externos. Isso não substitui comparação independente com catálogos de personagens.
- A preparação foi redesenhada como estação de equipe assimétrica, sem reproduzir uma captura de tela ou arte do jogo clássico. Ainda preserva grupos funcionais comuns — piloto/rival, temporada, pontuação, condição do veículo e módulos — por requisito do jogo; essa inspiração de estrutura merece revisão jurídica antes da publicação.
- O GLB Air Blade é explicitamente derivado segundo sua página de origem e permanece exclusivamente local; não é incluído no repositório público nem em `dist`.

Antes de distribuição pública, o proprietário deve confirmar que pode usar RIFFSHOT RACING, o slogan, Dax Voltage, os demais personagens e a estrutura da estação de equipe, ou obter orientação jurídica. Este inventário não é parecer jurídico nem confirmação de marca registrada disponível.

## Áudio e fontes

- A trilha é sintetizada em tempo de execução pelo código original de `src/audio/rockLoop.js`; não há arquivos de música, samples ou gravações externas.
- A interface usa fontes de sistema (“Arial”, “Arial Black”, “Consolas” e alternativas genéricas). Nenhum arquivo de fonte é distribuído.
- Não foram identificadas imagens raster ou outros assets de terceiros requeridos pela versão de produção.

## Licenças de software

- Phaser 3 — licença MIT.
- Three.js — licença MIT.
- Vite — licença MIT (ferramenta de desenvolvimento/build).
- Playwright — licença Apache-2.0 (dependência de testes).

Os avisos MIT integrais de Phaser e Three.js são emitidos no build em `dist/THIRD_PARTY_NOTICES.txt`; a fonte é `THIRD_PARTY_NOTICES.md`. Vite e Playwright não são runtime da página.

Os metadados e descrições no repositório são inventário técnico, não parecer jurídico nem prova independente de autoria. Antes da publicação, o proprietário deve confirmar os direitos de marca/título, de Dax Voltage e demais personagens, da estrutura inspirada da estação de equipe e dos outros elementos criativos, assim como a autoria e possibilidade de distribuição da música procedural.
