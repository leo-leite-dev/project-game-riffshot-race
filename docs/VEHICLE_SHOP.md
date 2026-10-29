# Veículos, loja e prêmio do rival

Estado atual por leitura da implementação integrada. O histórico das etapas anteriores permanece identificado abaixo; resultados antigos não constituem aprovação desta integração. Regras de condução, dano, respawn, HUD, câmeras e motores: [VEHICLE_COMBAT.md](VEHICLE_COMBAT.md).

## Regras aprovadas nesta etapa

| Veículo | Preço | Disponibilidade |
| --- | ---: | --- |
| THUNDER BUG (`rift-blaze`) | 2.000 | Seleção inicial e loja; substitui o antigo Race Car desse ID |
| Camaro | 800 | Seleção inicial e loja |
| Armored Car | 7.500 | Seleção inicial e loja; equivalente a cinco prêmios de vitória |
| Race Car 2 | 15.000 | Somente na loja, bloqueado como carro do chefão da fase 2 |
| Widowmaker | 24.000 | Loja e prêmio do rival inicial; equivalente a 16 prêmios de vitória |

Carreira nova começa com 2.000 créditos e nenhum carro adquirido. Comprar/equipar é uma transação única; um carro adquirido pode ser reequipado sem nova cobrança. Os preços de 5/10/16 vitórias são referências de valor, não exigências de contagem: qualquer crédito da carteira vale para comprar. Race Car 2 permanece bloqueado mesmo com saldo suficiente; esta etapa não implementa sua liberação nem a fase 2.

Todos os preços são em créditos **fictícios** da carreira. O jogo é gratuito e não vende veículos ou créditos por dinheiro real. Doações opcionais são apenas planejadas, sem pagamento ou QR Code implementado.

Ao alcançar a meta de 1.400 SCORE, o jogador pode continuar disputando as corridas restantes até o limite de oito ou encerrar o desafio escolhendo um prêmio. A escolha é **Widowmaker ou 12.000 créditos**, não ambos. Receber o prêmio encerra o farming deste desafio. A interface informa que a fase 2 ainda está em desenvolvimento. O carro-prêmio entra na garagem sem trocar automaticamente o carro equipado. Quem já comprou o Widowmaker pode receber os créditos, mas não outro exemplar.

## Responsabilidades e saves

- `src/data/vehicles.js`: catálogo, preços, opções iniciais, bloqueio e atributos aprovados. IDs antigos foram mantidos para preservar as carreiras. A etapa inicial da loja preservava os três perfis anteriores; a integração atual aplica os ratings abaixo à física real.
- `championshipState.js`: transições puras de compra, propriedade, farming e prêmio único. Corrida ativa e resultado pendente bloqueiam mudanças de seleção/compra/prêmio.
- `Championship.js`: cenas usam o serviço, nunca uma carteira paralela. Compra e prêmio só são aplicados após gravação bem-sucedida; falha não é apresentada como sucesso temporário.
- Schema 3 acrescenta `ownedVehicleIds` e `rivalRewardChoice`. Migração validada de v1/v2 preserva saldo, SCORE, histórico e recibos e concede o carro previamente selecionado sem cobrança retroativa. A chave histórica do armazenamento e seu backup são mantidos.
- Fracasso mantém os carros comprados, mas preserva a regra anterior de zerar carteira/SCORE/upgrades. APAGAR PROGRESSO remove também inventário e escolha de prêmio, somente após confirmação.
- `championshipWriter.js` usa Web Locks para dar a uma única aba a permissão de gravar o progresso. Não usa spinlock em localStorage. Outra aba fica em sessão temporária, sem permissão de comprar, receber prêmio ou apagar. Fechar a aba proprietária e recarregar libera o acesso. Sem Web Locks, a economia falha fechada com aviso; usar navegador atualizado em localhost/HTTPS.

## Modelos e recursos

O pacote público selecionado para versionamento fica em **`assets/vehicles/`**, com cinco GLBs e `manifest.json`. `scripts/vehicleAssetsPlugin.js` lê esse pacote e disponibiliza/emite somente **cinco assets distintos** da allowlist de `vehicleModels.js`, em `/models/vehicles/`: `thunder_bug.glb`, `race_car.glb`, `camaro.glb`, `armored_car_death_race.glb` e `widowmaker_-_death_race_2000.glb`. O manifesto registra autoria, título, fonte, licença/link, adaptações, URL pública, bytes e SHA-256 do original e do payload distribuído.

**Desenvolvimento/build normais não precisam das referências privadas:** leem os binários já preparados, sem importar o otimizador nem repetir seu processamento de cerca de 30 segundos. Os guards conferem cinco entradas únicas, atribuições obrigatórias, URLs previstas, tamanho e SHA-256, contêiner GLB e ausência de URIs de recursos externos. Cada GLB deve ter **menos de 25 MiB**; pacote ausente, inválido ou divergente impede a emissão, sem fallback para os originais privados. O fallback procedural do jogo é uma regra de apresentação distinta dessa validação do pacote.

O plugin não copia `referencias-locais/` nem `public/` inteira; rotas genéricas às referências são bloqueadas e a rota de modelos aceita apenas URLs/métodos previstos. `referencias-locais/` e `public/models/` histórico permanecem ignorados e não versionados. **Sci - Fi Buggy e Air Blade não integram a allowlist nem a distribuição.** “Assets aprovados” descreve essa seleção técnica, não aprovação jurídica. Esta documentação não registra deploy da atualização atual.

### Preparação explícita do pacote

```bash
npm run assets:prepare
```

`scripts/prepareVehicleAssets.js` lê somente os cinco nomes fixos em `referencias-locais/Vehicles`, sem varrer a pasta, e não edita os originais. Otimiza somente o Thunder, valida todos os payloads antes de escrever em `assets/vehicles/` e grava o manifesto por último. Os demais binários são copiados sem alteração. O comando é usado para regenerar deliberadamente o pacote; não é uma etapa automática de dev, build ou deploy no Pages. A distribuição usa os arquivos do pacote versionado, não as fontes privadas.

**Race Car 2:** `modelFile: race_car2.glb` é um alias de catálogo resolvido para o único original `race_car.glb`. Não existe original `race_car2.glb` exigido pelo carregamento e nenhum binário com esse nome é solicitado ou emitido. Na etapa anterior, Race Car e Race Car 2 compartilhavam esse mesmo binário; agora o primeiro perfil (`rift-blaze`) usa Thunder. Geometrias, texturas e templates canônicos são compartilhados entre instâncias. Os modelos são normalizados em memória para chão y=0, frente +Z e comprimento 3,25. Na corrida recebem escala visual ×1,3, sem alterar colisões.

Os GLBs usam atlas mistos. A escolha de cor identifica a equipe/plataforma, **não repinta os pneus, vidros ou a textura inteira do carro**; `paintId` continua salvo e os modelos atuais declaram `paintSupported: false`. A pintura original permanece. O experimento Sci - Fi Buggy continua separado e opt-in em desenvolvimento, não sendo o Thunder oficial.

Todos os cinco GLBs oficiais agora têm quatro rodas extraídas em memória, com pivôs por instância, rotação longitudinal assinada e esterçamento dianteiro. UVs, materiais, transforms autorais e triângulos são preservados; o estepe do Race Car 2 permanece fixo. Thunder mantém também o clipe original aprovado **Fan** (101 chaves, 2 s), sem liberar outros clipes/skins/morphs/recursos externos. O Widowmaker usa volumes cilíndricos específicos para separar pneus/cubos das malhas mistas: 183.786 triângulos na carroceria e 21.502 nas rodas. Podem aparecer pequenas costuras nas bordas durante o movimento; a revisão visual animada está pendente. Não há processamento de geometria por frame nem simulação completa de suspensão.

A estação usa uma miniatura estática do rival e o preview animado do jogador com o mesmo renderizador. Após capturar a miniatura, seu tamanho é restaurado para não dividir/deformar a imagem do jogador.

`GarageResources.load(vehicleIds)` carrega subconjuntos e estende o cache conforme necessário: **três opções na seleção inicial, até quatro IDs dos participantes na corrida e cinco opções na loja completa**. A equipe carrega o veículo equipado e o rival para sua miniatura. `load()` sem argumentos mantém compatibilidade carregando todos. Promises por asset canônico, templates, geometrias e texturas são reutilizados por jogo; falhas permitem fallback procedural e resultados tardios após destroy são descartados.

Os cinco binários distintos somam **53.909.488 bytes**, sem compressão HTTP. O Widowmaker mantém 205.288 triângulos. A estimativa-base de texturas RGBA8 com mipmaps é 238,77 MiB, antes de ambiente, framebuffer, buffers e eventuais cópias por uso/formato; não é medição de VRAM. Cache, carregamento por subconjunto e renderizador único reduzem duplicações, mas não comprovam FPS nem consumo real em GPU/celular. Medição em hardware permanece pendente.

### Thunder Bug — derivado sem perdas

`scripts/optimizeThunderBug.js` reutiliza as rotinas de `scripts/optimizeRiftBlaze.js`, preservando o original. O valor registrado para o original é **28.914.440 bytes**; o derivado é **25.452.592 bytes (24,27 MiB)**, abaixo do limite de 25 MiB por asset do Pages. Os hashes e o inventário detalhado estão em [CREDITS.md](../CREDITS.md).

A transformação recompõe PNGs sem perdas, elimina UV sets não usados pelos materiais, compacta índices, une vértices com todos os atributos retidos idênticos e deduplica dados/imagens embutidos. Mantém dimensões e pixels das imagens, UVs usados, 63.181 triângulos e os dados do Fan. O derivado é gerado na preparação explícita e salvo em `assets/vehicles/thunder_bug.glb`, com bytes e SHA-256 no manifesto; dev/build apenas validam e servem/emitem esse payload na URL `/models/vehicles/thunder_bug.glb`. Falha da preparação não entrega o original acima do limite. Redução de transferência não reduz, por si só, a memória das imagens decodificadas.

### Atributos atuais

| Veículo | Velocidade | Aceleração | Controle | Resistência |
| --- | ---: | ---: | ---: | ---: |
| THUNDER BUG | 76 | 84 | 72 | 55 |
| CAMARO | 62 | 76 | 84 | 35 |
| ARMORED CAR | 58 | 52 | 56 | 100 |
| RACE CAR 2 (bloqueado) | 94 | 92 | 82 | 70 |
| WIDOWMAKER | 88 | 78 | 65 | 90 |

Ratings na escala 0–100, não km/h. Resistência determina capacidade de vida em bolinhas; não aplica redução dupla de dano. Nitro, dano e modificadores do piloto estão detalhados em [VEHICLE_COMBAT.md](VEHICLE_COMBAT.md).

**Procedência:** consulte a [tabela resumida no README](../README.md#créditos-dos-cinco-veículos-atuais), [CREDITS.md](../CREDITS.md) e [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). O Thunder tem título de origem **race car**, autor **Chenchanchong** e fonte `97768c0e69744cd5922ddc5a9fd59266`, registrados nos metadados e na página de origem conforme os créditos. Os **cinco modelos** têm licença declarada **CC BY 4.0, não CC0**, sem endosso ou comprovação independente de todos os direitos. O publicador do Race Car usado pelo Race Car 2 informa não ser dono da malha, e o arquivo chamado Camaro é identificado como veículo extraído de Transformers Universe. As atribuições CC BY declaradas pelos uploaders não resolvem direitos sobre malhas, marcas ou designs dos titulares originais; otimização e extração de rodas tampouco os resolvem. Essas ressalvas ficam registradas para a decisão do proprietário.

O rodapé compartilhado dos menus aponta para `./credits.html`, em nova aba e sem recarregar o jogo. `scripts/publicCreditsPlugin.js` gera a página a partir de `THIRD_PARTY_NOTICES.md`, com escape do conteúdo Markdown, e mantém `THIRD_PARTY_NOTICES.txt` integral. Ambos incluem autores, fontes, licenças e adaptações dos cinco modelos, áudio original **Neon Ignition / RaceEngineAudio** e avisos MIT de **Phaser 3, Three.js e eventemitter3**. Não alteram a licença das criações próprias do projeto.

## Verificação direcionada

### Registro da etapa anterior da loja

Casos novos em `vehicle-shop.unit.js`, `championship-writer.unit.js`, `vehicle-models.unit.js`, `vehicle-assets-plugin.unit.js` e `vehicle-shop.spec.js`. O spec de navegador usa carreiras isoladas, inclusive para qualificação/oitava corrida, sem tocar no save do proprietário. Capturas reais ficam em `previews-ui/`.

O teste de duas abas verifica a proteção no menu da segunda aba: não é necessário carregar dois ambientes 3D para testar uma regra de gravação do serviço. A transferência real do braço leva cerca de sete segundos e tem espera explícita adequada. Testes antigos diretamente afetados tiveram fixtures/expectativas ajustadas, mas não foram todos executados nesta etapa.

### Critérios da integração atual

- Manter preços, três opções iniciais/cinco na loja, bloqueio do Race Car 2, propriedade sem cobrança duplicada, prêmio único e persistência segura em caso de falha/conflito.
- Conferir carregamento por subconjunto, alias para `race_car.glb`, cinco assets emitidos pela allowlist e ausência de acesso público genérico aos originais.
- Conferir o pacote `assets/vehicles/`/manifesto, bytes/SHA-256, limites estritos de tamanho, falhas de integridade e dev/build sem referências privadas ou otimização automática.
- Conferir créditos HTML com escape, TXT integral, atribuições atuais e link em nova aba sem recarregar o jogo.
- Conferir pixels/UVs usados/triângulos/Fan e original intacto na otimização Thunder; revisar rodas e possíveis costuras do Widowmaker em movimento.
- Conferir a integração de escala, HUD de vida, dano/respawn, câmeras e motores conforme [VEHICLE_COMBAT.md](VEHICLE_COMBAT.md).

O relatório da **entrega anterior** de condução/combate, incluindo compra do Thunder, build, **107 casos unitários e 6 de navegador** e suas capturas, está em [VEHICLE_COMBAT_VERIFICATION.md](VEHICLE_COMBAT_VERIFICATION.md). Ele não substitui a verificação própria de pacote/créditos/publicação, registrada em [RELEASE_VERIFICATION.md](RELEASE_VERIFICATION.md), com 14 casos unitários e 4 de navegador aprovados. Consultar [TESTING.md](TESTING.md) para seleção incremental. Não há afirmação de 60 FPS, fluidez em GPU física ou distinção percebida dos timbres.

## Histórico técnico preservado

Na primeira etapa da loja, Race Car ocupava `rift-blaze`, os três ratings legados foram mantidos e quatro binários somavam aproximadamente 28,46 MB. Race Car 2 compartilhava o Race Car; a separação/animação das rodas agregadas ainda não existia. O experimento Sci - Fi Buggy e seu candidato de 27.208.448 bytes, acima de 25 MiB, pertencem à etapa anterior descrita em [RIFT_BLAZE_OPTIMIZATION.md](RIFT_BLAZE_OPTIMIZATION.md). Esses números e restrições históricas não descrevem o derivado Thunder atual.

Referência dos perfis anteriores, na ordem velocidade/aceleração/controle/resistência: RIFT BLAZE (depois Race Car) **80/75/55/55**; VOLT VECTOR (depois Camaro) **80/75/90/55**; IRON BASTION (depois Armored Car) **60/55/50/95**. Os valores vigentes são os da tabela de atributos atuais acima.
