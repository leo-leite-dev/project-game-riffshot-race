# Testes direcionados — RIFFSHOT RACING

## Regra permanente

A seção **11 — POLÍTICA DE TESTES INCREMENTAIS E EFICIENTES** do `AGENTS.md` vale para a Normandy e os subagentes em todas as sessões. Testar por impacto, não pelo número de arquivos ou por uma lista fixa de suítes.

1. Liste os comportamentos alterados e suas dependências reais.
2. Escolha arquivos/casos que validem esses comportamentos e o menor conjunto suficiente de regressões relacionadas.
3. Use filtros por nome quando o arquivo de testes for maior que o impacto.
4. Execute uma vez, com timeout adequado. Se falhar, investigue antes de repetir; repita só os casos afetados pela correção.
5. Faça build para alterações da aplicação/distribuição e captura real para alterações visuais.
6. Informe o que foi executado e o que ficou sem validação. Sintaxe/listagem não são aprovação funcional.

Não reexecute física, bots, corrida ou todo o campeonato ao mudar apenas APAGAR PROGRESSO. Não use `node --test tests/*.unit.js`, `npm test` sem seleção ou a matriz completa de Playwright como rotina. Uma suíte extensa exige explicação e aprovação prévia, exceto quando a validação abrangente já tiver sido solicitada explicitamente.

### Situação das verificações da release

O registro de **107 casos unitários e 6 casos de navegador distintos aprovados** em [VEHICLE_COMBAT_VERIFICATION.md](VEHICLE_COMBAT_VERIFICATION.md) pertence à **entrega anterior de condução/combate**. Inclui build e capturas daquela etapa; não é resultado atual para o pacote versionado, a página HTML de créditos ou o deploy desta atualização.

A preparação de publicação teve **14 testes unitários e 4 casos de navegador aprovados**, sem falhas/ignorados, com build e capturas em [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md). Os comandos abaixo continuam sendo opções por impacto, não uma lista obrigatória nem resultados automaticamente aprovados.

## Comandos por área

Use `npm.cmd` e `npx.cmd` no PowerShell se a política do Windows bloquear scripts `.ps1`. Nos demais terminais, `npm` e `npx` equivalem aos comandos abaixo. Nenhuma ferramenta nova é necessária.

### Node — regras e componentes sem navegador

| Comando | Seleção | Quando usar |
| --- | --- | --- |
| `npm.cmd run test:controls` | `player-controls.unit.js` | WASD, giro local, freio/ré, independência da câmera |
| `npm.cmd run test:camera:rig` | `race-camera.unit.js` | Enquadramento, transição e obstáculos da câmera, sem repetir atribuição de pistas |
| `npm.cmd run test:tracks` | `track-assignment.unit.js` | Ciclo e atribuição de pistas; refinar por nome se necessário |
| `npm.cmd run test:vehicles` | `buggy-visual.unit.js` | Pivôs, geometria, pinturas e animação do adaptador do buggy |
| `npm.cmd run test:particles` | `tire-smoke.unit.js` | Emissão, vida, limites e reutilização de partículas |
| `npm.cmd run test:save` | Casos de storage/migração/backup/conflito de `championship.unit.js` | Mudanças no armazenamento que afetem essas garantias; não executa todos os casos do campeonato |
| `npm.cmd run test:save:erase` | Casos `apagar progresso`, `falha ao excluir backup`, `falha parcial na exclusão` no serviço | Exclusão, isolamento, limpeza em memória, conflito de outra aba e falhas de remoção |
| `npm.cmd run test:race` | `race-simulation.unit.js` | Mudança realmente ampla na simulação; para um comportamento isolado, filtrar por nome |

Essas categorias **não são uma obrigação de executar todos os casos listados**. Exemplo: uma alteração só no texto da confirmação não exige `test:save`, porque o armazenamento não foi modificado.

Outros arquivos disponíveis, sem atalhos extras desnecessários:

```powershell
# Economia e propriedade; filtre por "^loja:" ou "^rival:" para impacto menor:
node --test --test-timeout=15000 tests/vehicle-shop.unit.js

# Exclusão de escrita entre abas (não testa gameplay):
node --test --test-timeout=15000 tests/championship-writer.unit.js

# GLBs oficiais/cache e allowlist Vite, somente se esses contratos mudarem:
node --test --test-timeout=30000 tests/vehicle-models.unit.js tests/vehicle-assets-plugin.unit.js

# Pacote de release, manifesto/atribuições, bytes/SHA-256 e preparação explícita:
node --test --test-timeout=30000 tests/release-assets.unit.js

# Somente se a rota/segurança de carregamento local mudou:
node --test tests/local-rift-route.unit.js

# Somente se o processo de otimização do asset mudou:
node --test tests/rift-optimization.unit.js
```

### Playwright — telas e integrações específicas

| Comando | Seleção padrão desktop | Escopo |
| --- | --- | --- |
| `npm.cmd run test:ui:erase` | `erase-progress.spec.js` | Confirmação, cancelamento, exclusão/reload e falha do botão na equipe |
| `npm.cmd run test:ui:credits` | `public-credits.spec.js` | Créditos HTML/TXT, link, teclado e integridade dos cinco payloads publicados |
| `npm.cmd run test:vehicles:flow` | `local-buggy.spec.js` | GLB experimental, garagem, rodas/efeitos e fallback/produção |
| `npm.cmd run test:integration:race` | `race-flow.spec.js` | Fluxo crítico da corrida; contém duas pistas, câmeras e resultados, portanto não usar para pequenas mudanças isoladas de UI |
| `npm.cmd run test:championship:flow` | `championship-flow.spec.js` | Recibos, progresso/reload e limites do campeonato; filtrar caso afetado |
| `npm.cmd run test:smoke` | Caso com `produção em 4183` no nome | Fluxo crítico público quando a distribuição ou o fluxo geral forem afetados |

Todos os atalhos novos de navegador usam zero retries, um limite de falhas e timeout explícito. Alguns testes existentes definem timeout próprio; o limite interno pode prevalecer sobre a linha de comando. Não repetir automaticamente uma execução lenta.

Comandos antigos preservados por compatibilidade:

- `npm.cmd run test:camera`: combina câmera **e** atribuição de pistas; prefira `test:camera:rig` ou `test:tracks` para impacto isolado.
- `npm.cmd run test:championship`: executa os dois arquivos completos de regras/serviço do campeonato; **não é o padrão para pequenas mudanças de save ou UI**.
- `npm.cmd test`: mantém a suíte completa Playwright disponível para validação abrangente autorizada; nunca executá-la automaticamente.

## Filtros nativos para um único comportamento

Condução/dano/motores e câmeras têm fixtures isoladas em `tests/vehicle-combat.spec.js` (`--grep "dano integrado"`, `"Thunder mobile"` ou `"rodas e motores integrados"`). Use somente os casos afetados; o teste de imagem não precisa percorrer um campeonato. Resultados **históricos da entrega anterior** em [VEHICLE_COMBAT_VERIFICATION.md](VEHICLE_COMBAT_VERIFICATION.md).

Dev/build normais agora leem os cinco GLBs preparados em `assets/vehicles/` e validam manifesto, bytes, SHA-256, limite estrito **menor que 25 MiB** e estrutura GLB, sem ler as referências privadas nem importar o otimizador. O processamento de cerca de 30 segundos pertence à preparação explícita `npm run assets:prepare` ou aos testes específicos do otimizador; não é mais custo esperado de cada build/primeiro carregamento dev. O timeout do servidor não é uma medição de desempenho. Não executar a preparação para uma mudança apenas documental ou para validar o pacote já preparado.

Loja e prêmio do rival têm casos isolados em `tests/vehicle-shop.spec.js`. Selecione por nome (`--grep "cinco opções"`, `--grep "meta antes"` ou `--grep "economia entre abas"`), sempre com projeto, zero retries e limite de falhas. Esse arquivo não exige percorrer corridas reais para preparar a premiação; consulte também `docs/VEHICLE_SHOP.md`.

### Recorte para pacote público e créditos

- **Pacote/manifesto/preparação:** selecionar os contratos afetados em `tests/release-assets.unit.js` e `tests/vehicle-assets-plugin.unit.js`: cinco arquivos canônicos, alias sem duplicação, atribuições/adaptações, tamanhos/hashes, falhas de integridade, bloqueio de recursos externos e emissão sem referências privadas. Os testes de preparação usam fontes sintéticas isoladas; não precisam reconstruir os GLBs reais para verificar nomes fixos e preservação dos originais.
- **Otimizador:** `tests/thunder-optimization.unit.js` somente quando a transformação mudar. Pixel/UV/triângulo/Fan são contratos da transformação; mudar o empacotamento não exige repetir física, bots ou todas as verificações de otimização.
- **Créditos públicos:** validar `/credits.html` gerado com escape de `THIRD_PARTY_NOTICES.md`, `/THIRD_PARTY_NOTICES.txt` integral, os cinco autores/fontes/CC BY 4.0 e adaptações, áudio original Neon Ignition/RaceEngineAudio e três avisos MIT (Phaser, Three.js e eventemitter3). Conferir o rodapé `href="./credits.html"`, nova aba, teclado e preservação da página do jogo, sem recarregá-la; usar somente telas/resoluções afetadas e capturar em `previews-ui/`.
- **Contrato atualizado:** `tests/public-credits.spec.js` cobre HTML + TXT, os cinco autores/fontes, três avisos MIT e o pacote distribuído. `tests/public-credits.unit.js` verifica escape e geração da mesma fonte; os resultados executados são registrados no relatório da release, não inferidos pela presença dos casos.
- **Distribuição/publicação:** o build deve funcionar com o pacote do repositório sem `referencias-locais/` ou `public/models/` histórico e emitir somente os cinco GLBs previstos, sem Sci - Fi Buggy ou Air Blade. O relatório atual deve registrar o build da versão verificada e, após o push, o check/deploy do commit correspondente pela integração Pages existente. O check antigo de `4eeafe1` e o preview anterior não comprovam a publicação atual.

### Node: opções antes dos arquivos

```powershell
# Exemplo: só colisão contra parede.
node --test --test-timeout=15000 --test-name-pattern="barreira" tests/race-simulation.unit.js

# Exemplo: só exclusão e suas falhas; sem as premiações e progressão.
node --test --test-timeout=15000 --test-name-pattern="^(apagar progresso|falha ao excluir backup|falha parcial na exclusão)" tests/championship-service.unit.js

# Exemplo: só conflito de abas no serviço.
node --test --test-timeout=15000 --test-name-pattern="conflito com outra aba" tests/championship-service.unit.js
```

O filtro é expressão regular; confirme os nomes existentes no arquivo. Posicione `--test-name-pattern` **antes** do arquivo. Não acrescente esse argumento ao final de um script npm que já termina no arquivo; use o comando Node direto para refinar o filtro sem ambiguidade. O Node pode apresentar casos não selecionados como ignorados; não somá-los aos aprovados.

### Playwright: arquivo + projeto + `--grep`

```powershell
# Listar apenas os casos selecionados, sem rodar testes, servidores ou build:
npm.cmd run test:ui:erase -- --list

# Apenas confirmação/cancelamento/exclusão/reload, sem o caso de falha de storage:
npm.cmd run test:ui:erase -- --grep "cancelar preserva"

# Apenas a falha de armazenamento na equipe:
npm.cmd run test:ui:erase -- --grep "falha de armazenamento"

# Outro exemplo: só o recibo do campeonato, não os limites de sucesso/fracasso:
npm.cmd run test:championship:flow -- --grep "chegada premia uma vez"
```

Os atalhos selecionam desktop. Para uma regressão específica de mobile/landscape, escolha diretamente o projeto afetado; não acrescente todos os projetos por rotina:

```powershell
npx.cmd --no-install playwright test tests/erase-progress.spec.js --project=mobile --grep "cancelar preserva" --retries=0 --max-failures=1 --timeout=60000
```

Na configuração atual, uma **execução** Playwright inicia os servidores isolados em 5183 e 4183 e executa `npm run build` para o preview. `--list` não faz isso. Quando testes de navegador relacionados precisarem rodar juntos, passe seus arquivos/filtros numa única invocação para evitar recompilar/inicializar servidores repetidamente. Não repetir o build da mesma versão depois dessa execução aprovada sem mudança relevante.

## Exemplo de seleção por impacto: APAGAR PROGRESSO

- **Só aparência/texto:** verificar a tela da equipe, cancelamento quando relevante e captura; não repetir simulação e todos os saves.
- **Confirmação/navegação:** caso Playwright de cancelar/confirmar/excluir/voltar à abertura. Acrescentar teclado ou resolução afetada.
- **Remoção no armazenamento/serviço:** `test:save:erase` para isolamento, dados corretos, limpeza de Registry, conflito e falhas; caso Playwright relacionado para UI/persistência quando necessário.
- **Mudança geral no formato do save:** selecionar os testes de migração, validação e armazenamento efetivamente afetados; justificar casos adicionais. Não concluir que todo o campeonato precisa rodar apenas porque `championshipStorage.js` mudou.

Segurança não pode ser reduzida para economizar casos. Exclusões devem cobrir cancelamento, dados removidos, preservação de dados de outros projetos e persistência; incluir falha parcial, acesso bloqueado e conflito de abas quando essas garantias forem impactadas. Usar storage/fixtures isolados, nunca o save real do proprietário.

## Capturas reais da tela modificada

Em toda mudança visual, aguarde a cena, layout e assets necessários antes de capturar. Use um teste direcionado da tela existente ou uma fixture isolada; não navegue por toda a corrida/campeonato para preparar uma tela que pode ser aberta por fixture.

Nas próximas alterações visuais, gravar a captura explicitamente em **`previews-ui/`**, ignorada pelo Git e não copiada para o build. Criar a pasta de saída quando necessário. Exemplo de trecho dentro do teste selecionado:

```js
// Depois de aguardar a cena e os recursos afetados, com save isolado:
await page.screenshot({ path: 'previews-ui/equipe-desktop.png' });
```

Os testes existentes podem continuar gerando evidências em `test-results/` com `testInfo.outputPath()`. Isso não atende, sozinho, ao destino permanente `previews-ui/`: na próxima tarefa visual, ajustar apenas o ponto de captura relevante para também produzir o arquivo solicitado. Não é necessário refatorar ou executar os testes antigos por causa desta política.

Capturar apenas resoluções/estados relevantes. Informar o caminho e examinar a imagem real. Uma captura não comprova animação contínua, ausência de tremedeira ou 60 FPS em GPU física.

## Build, tempo e relato

- Código da aplicação ou distribuição alterado: executar `npm run build`, ou usar o build da mesma versão já executado pelo servidor Playwright.
- Só documentação: sem build e sem servidor. Scripts de testes/instruções de agente podem ser verificados com parsing JSON, `node --check`, `--list` e resolução local do OpenCode.
- Não instalar dependências, criar uma nova infraestrutura de testes ou duplicar casos quando Node e Playwright existentes bastam.
- Timeout deve refletir a operação: testes puros rápidos não precisam da janela de carregamento de um GLB. Não usar retries, loops, force-exit ou suítes amplas para esconder causas de falha.
- Antes de rodar suíte extensa/demorada, explicar o risco não coberto e solicitar aprovação, exceto se o proprietário já pediu essa validação explicitamente.

Modelo de relatório:

```text
Alteração/arquivos e impacto:
Seleção e motivo dos testes:
Comandos executados:
Resultado atual: X aprovados, Y falhas, Z ignorados (sem contar só listagem):
Build: aprovado/falhou/não necessário; indicar se já feito pelo Playwright:
Capturas reais: previews-ui/... ou não aplicável:
Não executado e por quê:
Riscos/limitações pendentes:
```

Se houve apenas sintaxe/listagem, informar **zero testes funcionais executados**. Não reaproveitar resultado antigo como aprovação de uma alteração nova.
