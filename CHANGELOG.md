# Changelog

Este arquivo registra as mudanças relevantes do projeto seguindo [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). As alterações ainda não publicadas ficam em **Unreleased**.

## [Unreleased]

### Adicionado

- Seleção de três pinturas cosméticas, com dados e atributos-base centralizados; Air Blade é restrito ao GLB local e a versão pública usa a designação ORIGINAL RACER.
- Garagem retrofuturista com prévia GLB em Three.js integrada à interface Phaser, compartilhamento do carregamento/geometria e materiais de pintura independentes.
- Braço mecânico animado por tempo decorrido, com alinhamento, descida, fechamento da garra, levantamento e transporte do veículo.
- Tela independente de preparação com informações provisórias da campanha, retrato do piloto, rival identificado como conteúdo futuro, veículo selecionado e barras de atributos.
- Módulos de preparação interativos, com ações ainda não implementadas claramente indicadas como “Em breve”, e tela “Corrida em desenvolvimento” acessível por START RACE.
- Créditos e restrições de uso local do modelo provisório em `CREDITS.md`; o GLB foi adicionado ao `.gitignore` para não ser enviado ao repositório público.
- Testes de navegador para renderização/material, seleção por teclado e mouse, ciclo mecânico, preparação, erros de carregamento, ciclo de vida e tamanhos de tela.

### Alterado

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
- Instruções para configuração do build e diretório de saída do Cloudflare Pages incluídas no README.

### Corrigido

- Remoção de recursos 3D, textura da prévia e listeners ao trocar/destruir cenas; rejeições de carregamento tardias não atualizam cenas encerradas.
- GLB local ausente/inválido usa a apresentação original e identifica esse fallback em vez de bloquear a garagem.
- Redimensionamento redundante do renderer evitado; a garagem respeita movimento reduzido nas animações decorativas.
- A prévia 3D reaplica o frame ao mudar o tamanho da CanvasTexture, evitando deslocamento visual.
- O GLB local não é requisitado no build nem emitido para `dist`; os testes de produção verificam o fallback e ausência da requisição.

## Histórico anterior

- `95ac3d1` — `chore: initial project setup` (configuração inicial do projeto).
