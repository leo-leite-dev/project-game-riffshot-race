# Verificação — Thunder, condução, dano, câmeras, rodas e motores

## Escopo e política incremental

Esta entrega substitui o carro de 2.000 créditos pelo Thunder Bug sem trocar seu ID persistido, aplica atributos reais, capacidade de vida e dano progressivo, destruição/respawn, rodas, escala de corrida, câmeras e motores. Regras e arquivos de responsabilidade estão em [VEHICLE_COMBAT.md](VEHICLE_COMBAT.md). As alterações preexistentes do diretório foram preservadas; não houve commit, push ou deploy.

As verificações foram escolhidas conforme AGENTS §11 e [TESTING.md](TESTING.md): física e gates realmente afetados, modelos/derivado/allowlist, câmeras, áudio e efeitos; no navegador, somente compra e telas/estados alterados com saves isolados. Não foi executada a matriz completa de Playwright nem todas as suítes antigas de gameplay, campeonato ou exclusão de progresso.

## Resultados consolidados

As contagens abaixo são de **casos distintos aprovados ao longo das etapas**, não soma das reexecuções nem alegação de uma execução monolítica da versão final. Após cada ajuste, foram repetidos os casos diretamente afetados, sem repetir os demais indiscriminadamente.

| Área | Casos distintos aprovados | Falhas pendentes | Ignorados reportados nas seleções aprovadas |
| --- | ---: | ---: | ---: |
| Física, atributos, dano, respawn, gates e regressões relacionadas | 42 — 28 novos e 14 regressões | 0 | 0 |
| GLBs, rodas, cache, allowlist e otimização Thunder | 20 | 0 | 0 |
| Câmeras, zoom, obstáculos e enquadramento | 12 | 0 | 0 |
| Áudio e controle global, com Web Audio simulado | 18 | 0 | 0 |
| Fumaça/explosão, pools e descarte | 15 | 0 | 0 |
| **Total unitário distinto** | **107** | **0** | **0** |
| **Integrações de navegador distintas** | **6** | **0** | **0 skips intencionais** |

Casos fora dos filtros não foram executados e não contam como aprovação. Listagem, parsing e inspeção Git não foram contados como testes funcionais. O teste de throttle público foi contado uma única vez, separado dos 41 casos de física consolidados pelo agente dessa área.

### Evidências funcionais importantes

- Com piloto idêntico e sem nitro, Thunder atingiu máxima **9,86% maior que Camaro** e ganhou **31,37% mais velocidade na arrancada que Armored**. Notas isoladas de velocidade/aceleração também foram testadas sem alterar o outro parâmetro.
- Resistência produz capacidades 3/4/5/6/7; dano de carro e parede usa aproximação normal e cooldown/episódio, sem redução dupla por blindagem.
- Respawn não recupera nitro nem concede checkpoint/volta/distância; foram corrigidos e cobertos débito após ré, emenda da pista, gate por empurrão, chegada antes de dano letal e progresso inicial coerente.
- Os quatro participantes completaram quatro voltas nas duas pistas em Normal, com destruições/respawns forçados. Após o último reforço das barreiras durante proteção, foi repetido somente Neon Furnace: quatro resultados válidos, última chegada em **129,65 s**. Isso não valida a matriz completa de veículos/dificuldades nem o equilíbrio perceptivo de dificuldade.
- Proteção impede dano e contato com outros carros, **não atravessamento das paredes**. A barreira conserva sua contenção e rebate padrão sem repetir o corte a cada passo.
- Rodas reais foram separadas nos cinco GLBs, mantendo triângulos, UVs e materiais; no navegador os quatro modelos em corrida tinham quatro rodas e a roda do jogador mudou de ângulo após acelerar com W.
- O navegador mediu sinal real dos motores, perfis com pitches distintos, queda para silêncio por M, retorno pelo botão e zero nós próprios após sair. Essa verificação foi feita **sem OfflineAudioContext**, comprovando que falha da trilha não desabilita motores.
- Compra do Thunder por 2.000, cancelamento sem débito e persistência após reload passaram. Race Car 2 permanece bloqueado; não foi criado novo schema de save para a simulação transitória.

## Comandos unitários executados

### Física e atributos

Execuções iniciais e recortes após alterações específicas:

```powershell
node --test --test-timeout=30000 tests/race-damage.unit.ts
node --test --test-timeout=30000 --test-name-pattern="catálogo|nitro|contato de colisão|barreira|coincidentes|presentation|sequenced geometric|parede:|controle do veículo" tests/race-simulation.unit.ts tests/race-wall.unit.ts tests/race-drift.unit.ts
node --test --test-timeout=15000 --test-name-pattern="^respawn:|^gates respawn lateral:" tests/race-damage.unit.ts
node --test --test-timeout=30000 --test-name-pattern="^respawn:|gates|bots dano|sequenced geometric" tests/race-damage.unit.ts tests/race-simulation.unit.ts
node --test --test-timeout=30000 --test-name-pattern="^nitro respawn:|^gates: chegada|^gates dano:|^respawn:|^telemetria:" tests/race-damage.unit.ts
node --test --test-timeout=30000 --test-name-pattern="^contato: cooldown|^contato letal:|^respawn:|^gates respawn lateral:|^bots dano:" tests/race-damage.unit.ts
node --test --test-timeout=30000 --test-name-pattern="cinco velocidades|^atributos motor:|^bots dano:|nitro consome|bônus limitado a 6%" tests/race-damage.unit.ts tests/race-simulation.unit.ts tests/race-drift.unit.ts
node --test --test-timeout=15000 --test-name-pattern="^throttle público:" tests/race-damage.unit.ts
node --test --test-timeout=30000 --test-name-pattern="^progresso seguro:|^gates empurrão:|^gates respawn|^gates: chegada|^gates dano:|^respawn:|^contato letal:|^bots dano: completam neon-furnace" tests/race-damage.unit.ts
node --test --test-timeout=15000 --test-name-pattern="^gates empurrão:" tests/race-damage.unit.ts
node --test --test-timeout=15000 --test-name-pattern="^progresso inicial:|^progresso seguro: recuar|^respawn:|^gates respawn lateral:" tests/race-damage.unit.ts
node --test --test-timeout=30000 --test-name-pattern="^guards:|^parede dano:|^respawn:|^bots dano: completam neon-furnace" tests/race-damage.unit.ts
```

A implementação inicial encontrou duas falhas: resíduo numérico no fim da proteção e gate após centralização lateral. Foram investigadas e corrigidas, com repetição direcionada. Revisão posterior encontrou os casos de ré/empurrão/progresso inicial e a parede intangível durante proteção; os respectivos novos asserts/regressões passaram. A última seleção de física acima teve **4 aprovados, 0 falhas e 0 ignorados**, sem repetir todas as aprovações anteriores.

### Modelos, distribuição, câmeras, áudio e efeitos

```powershell
node --test --test-timeout=30000 tests/vehicle-models.unit.ts tests/vehicle-assets-plugin.unit.ts
node --test --test-timeout=120000 tests/thunder-optimization.unit.ts
node --test --test-timeout=30000 --test-name-pattern="(GLB real (armored|widowmaker)|inspeção bloqueia)" tests/vehicle-models.unit.ts
node --test --test-timeout=120000 --test-name-pattern="Thunder real:" tests/thunder-optimization.unit.ts
node --test --test-timeout=30000 --test-name-pattern="(GLB real armored|fábrica usa|otimizador Thunder)" tests/vehicle-models.unit.ts tests/thunder-optimization.unit.ts
node --test --test-timeout=15000 tests/race-camera.unit.ts
node --test --test-timeout=15000 --test-name-pattern="^(?!isométrica explícita)" tests/race-camera.unit.ts
node --test --test-timeout=15000 --test-name-pattern="zoom preserva carro inteiro" tests/race-camera.unit.ts
node --test --test-timeout=15000 --test-name-pattern="^Thunder real:" tests/race-camera.unit.ts
node --test --test-timeout=15000 tests/audio.unit.ts
node --test --test-timeout=15000 tests/vehicle-damage-effects.unit.ts
node --test --test-timeout=15000 --test-name-pattern="capô|dano maior|respawn limpa fumaça" tests/vehicle-damage-effects.unit.ts
```

Houve ajustes durante o diagnóstico de extensões materiais/UVs dos modelos e enquadramento das câmeras; as seleções relevantes passaram após correção. A suíte de câmeras teve 11 aprovados e depois um novo caso Thunder real aprovado: oito cantos, centro, três zooms, desktop/retrato, quatro orientações e velocidades 0/40, sem repetir os anteriores. O último filtro de efeitos foi repetido após melhorar tamanho/opacidade e depois elevar o emissor: antes ele podia emitir dentro do capô e ficar oculto pelo depth test. **3 aprovados, 0 falhas e 0 ignorados** nesse recorte final.

## Navegador: execução incremental e falhas diagnosticadas

1. Primeiro recorte com cinco casos: **1 falha por timeout global, 4 não executados**. O caso combinava desktop e mobile com muitas capturas no SwiftShader. Separado em dois casos e ajustada a janela explícita, sem retries automáticos.
2. Recorte de seis: **2 aprovados, 1 falha e 3 não executados**. Câmeras desktop/mobile passaram. O dano revelou `progress` inicial zero, enquanto `_distance` já representava o grid; primeiro passo após respawn mostrava 0,24625. Corrigida a inicialização para ser coerente desde `waiting`, sem alterar checkpoints/voltas.
3. Somente quatro casos ainda pendentes: **1 aprovado, 1 falha e 2 não executados**. Dano/respawn passaram. Rodas, som e mute passaram seus asserts, mas Escape não saiu porque o foco estava no botão HTML SOM. Corrigido apenas o teste, devolvendo foco ao canvas.
4. Somente os três restantes: **3 aprovados**. Reutilizado o build da mesma versão com configuração temporária, sem build repetido.
5. Após revisão real das imagens e ajuste do emissor de fumaça: repetidos somente dano e produção: **2 aprovados**. A captura de produção passou a aguardar Largada/fim do fade.

Comandos utilizados, sempre zero retries e limite de uma falha:

```powershell
npx.cmd --no-install playwright test tests/vehicle-combat.spec.ts tests/vehicle-shop.spec.ts --project=desktop --grep "Thunder integrado|dano integrado|rodas e motores integrados|produção Thunder|Thunder Bug custa" --retries=0 --max-failures=1 --timeout=150000
npx.cmd --no-install playwright test tests/vehicle-combat.spec.ts tests/vehicle-shop.spec.ts --project=desktop --grep "Thunder integrado|Thunder mobile|dano integrado|rodas e motores integrados|produção Thunder|Thunder Bug custa" --retries=0 --max-failures=1 --timeout=210000
npx.cmd --no-install playwright test tests/vehicle-combat.spec.ts tests/vehicle-shop.spec.ts --project=desktop --grep "dano integrado|rodas e motores integrados|produção Thunder|Thunder Bug custa" --retries=0 --max-failures=1 --timeout=210000
npx.cmd --no-install playwright test tests/vehicle-combat.spec.ts tests/vehicle-shop.spec.ts --config "C:\Users\Sille\AppData\Local\Temp\opencode\rock-racing-existing-build.config.mjs" --project=desktop --grep "rodas e motores integrados|produção Thunder|Thunder Bug custa" --retries=0 --max-failures=1 --timeout=210000
npx.cmd --no-install playwright test tests/vehicle-combat.spec.ts --project=desktop --grep "dano integrado|produção Thunder" --retries=0 --max-failures=1 --timeout=210000
```

A configuração temporária herda a do projeto, com diretórios absolutos e apenas o comando do preview substituído para não recompilar o `dist` existente. Não modifica outro projeto nem adiciona dependências.

## Build, revisão e capturas reais

- Builds da integração aprovados pelos servidores Playwright; a transformação sem perdas levou aproximadamente 29 segundos por versão.
- **`npm.cmd run build` final aprovado, 29,39 s**, necessário após corrigir a contenção de parede durante proteção. Não se repetiu o navegador inteiro por esse ajuste não visual: guards/parede/respawn e conclusão em Neon validaram o impacto real. Os seis casos de navegador são aprovações da integração nas etapas indicadas, não seis reexecuções depois desse último ajuste.
- Avisos não impeditivos: chunk principal acima de 500 kB e tempo do callback de otimização. Nenhum aviso foi suprimido.
- Thunder emitido: **25.452.592 bytes — 24,27 MiB**, abaixo de 25 MiB; original de 28.914.440 bytes preservado. `dist/models/vehicles/` contém somente os cinco assets distintos aprovados.
- Revisados código/arquivos alterados; `node --check` nos pontos integrados e `git diff --check` nos rastreados envolvidos passaram. Avisos LF/CRLF não são falhas funcionais.

Capturas geradas e abertas para inspeção:

- `previews-ui/compra-inicial-desktop.png` — Thunder, preço e atributos.
- `previews-ui/thunder-camera-proxima.png`
- `previews-ui/thunder-camera-zoom-2.png`
- `previews-ui/thunder-camera-zoom-3.png`
- `previews-ui/thunder-camera-isometrica.png`
- `previews-ui/thunder-terceira-mobile.png`
- `previews-ui/thunder-zoom-mobile.png`
- `previews-ui/thunder-isometrica-mobile.png`
- `previews-ui/thunder-danificado-fumaca.png`
- `previews-ui/thunder-explosao.png`
- `previews-ui/thunder-producao.png`

A espera de câmera é por estado real estável. Capturas não demonstram animação contínua, qualidade sonora percebida nem FPS. A explosão e os estados de vida foram preparados pela API de dano real em uma corrida isolada; não se afirma que uma pessoa dirigiu um campeonato para produzi-los.

## Não executado e riscos pendentes

- Não executados todos os testes antigos ajustados, suítes completas de gameplay/campeonato/Playwright ou a matriz de dificuldades/veículos. Apenas dependências comprovadas foram selecionadas. Não foram repetidos os testes de economia destrutiva, pois schema, chaves e exclusão de saves não foram alterados nesta etapa.
- Sem medição de FPS/VRAM em GPU física, telefone real, Firefox ou Safari. SwiftShader foi lento nas capturas; isso não fornece medida confiável de desempenho final. O carregamento por subconjunto reduz antecipação, mas modelos/texturas ainda têm custo relevante.
- Timbres são sintetizadores distintos com sinal validado; adequação artística precisa de escuta humana. O perfil do Race Car 2 está preparado/testado sem desbloquear o chefão.
- O Widowmaker pode mostrar pequenas costuras na extração conservadora das rodas; requer observação prolongada em movimento. Não há física completa de suspensão.
- Vida e posição da simulação são transitórias. Recarregar mantém o contrato anterior da corrida ativa, não um checkpoint persistente de cada movimento/HP.
- Procedência e direitos dos modelos continuam exigindo revisão antes de publicação, conforme créditos/avisos. Não houve publicação nem custos obrigatórios.
