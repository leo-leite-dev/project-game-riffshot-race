# MP3s, mixagem e referência de ritmo

> Os resultados de reprodução em dev/build descritos no histórico abaixo são da
> etapa anterior à reorganização. Na distribuição atual, MP3s pendentes de licença
> ficam privados e a produção usa os efeitos procedurais existentes.

## Áudios solicitados

| Evento | Original privado em `referencias-locais/audio/` | URL apenas no servidor dev |
| --- | --- | --- |
| Canhão do rival | `canhão_disparo_windowmaker.mp3` | `/__local-audio/canhao_disparo_windowmaker.mp3` |
| Acerto de projétil | `impacto_disparo.mp3` | `/__local-audio/impacto_disparo.mp3` |
| Derrapagem | `pneu_derrapando.mp3` | `/__local-audio/pneu_derrapando.mp3` |

Originais preservados sem alteração. O alias ASCII do canhão existe apenas no dev.
O plugin de áudio serve os arquivos somente em desenvolvimento; o build não emite
nenhum desses MP3. Em produção, os efeitos procedurais são usados como fallback até
que a licença dos arquivos seja confirmada.

`RaceEffectsAudio` inicia uma preparação assíncrona por corrida, reutiliza buffers
decodificados e cancela o carregamento ao sair. Falhas deixam fallback procedural
e diagnóstico explícito, sem bloquear gameplay ou repetir downloads por frame.
O MP3 de impacto corresponde ao tiro; colisões e explosão continuam sintéticas.
MP3s de impacto e derrapagem atendem jogador, bots e rival. Mute, foco, limites de
vozes e descarte foram preservados. A autoria/licença dos arquivos fornecidos ainda
precisa ser confirmada pelo proprietário; os créditos não os chamam de originais.

### Motores baixos

A causa era a atenuação inicial de NPCs em **0,28**, reduzida novamente pela distância:
em 28 unidades, restavam apenas 0,14 em relação ao jogador com telemetria igual.
Ajuste: **0,72**, com distância de meia intensidade em 42 unidades. Em 25 unidades,
um motor de adversário fica aproximadamente em 0,532 do nível equivalente do jogador
(antes: 0,156). São fatores de ganho, não uma medição de volume percebido.
Veículos distantes continuam mais baixos; o jogador permanece prioritário.

## Tempos de quatro voltas

Os registros foram interpretados como minutos:segundos:centésimos. Metas pedidas:

| Pista | Rival | Cada bot |
| --- | --- | --- |
| Neon Furnace | 73,01–73,10 s | 73,04–73,10 s |
| Voltage Run | 72,01–72,10 s | 72,04–72,10 s |

O timestep físico é 1/60 s (aproximadamente 0,01667 s); um horário exibido arredondado
não comprova estar dentro da faixa real. O teste não falsifica tempo, gates ou resultado.

### Medição estável mantida

Oito cenários, seeds 11/29/47/83 nas duas pistas, Difícil, quatro voltas, jogador
observador concluído e três NPCs ativos. Contatos/dano habilitados; canhão desativado
pelo guard de encerramento do jogador. Não representa uma corrida com humano/tiros.

| Pista | Rival | Camaro | Armored |
| --- | --- | --- | --- |
| Neon Furnace | 72,867–72,983 s | 75,600–77,283 s | 82,083–82,967 s |
| Voltage Run | 73,100–73,167 s | 74,667–75,683 s | 80,800–81,617 s |

**Nenhuma das 24 chegadas ficou na respectiva faixa exata.** Todos completaram os
16 gates, sem destruições ou travamentos; maior parada contínua de 0,083 s.

Duas tentativas de melhorar trajetória/frenagem foram medidas e rejeitadas. A melhor
chegada do Armored na primeira pista dessas tentativas foi 80,783 s, ainda longe do
pedido. Os ajustes experimentais foram desfeitos; nenhum atributo de veículo mudou.

No melhor percurso estável do Armored da primeira pista, a distância foi 2.182,493
unidades e o teto físico de drift foi 29,256. Até percorrer a mesma distância inteira
nesse teto, ignorando aceleração e curvas, exigiria 74,600 s. Isso **não prova** que
uma trajetória legal diferente seja impossível: comprova apenas que acelerar melhor
no mesmo percurso não basta. Nova decisão de balanceamento dos carros fica pendente.

## Verificação desta alteração

- 23 casos unitários de amostras MP3 e regressões diretamente afetadas de áudio.
- 2 casos de mixagem dos motores, incluindo presença de bot/rival próximo e distância.
- 1 caso de emissão byte a byte dos três arquivos, com tamanhos e hashes.
- 3 casos de medição de ritmo: aprovação significa integridade da medição, **não meta atingida**.
- 2 casos de navegador: MP3s reais carregados/decodificados; conteúdo idêntico nos servidores
  dev e preview do build; sinal Web Audio dos efeitos, uso dos MP3s para todos os NPCs,
  mute e descarte. O segundo caso validou disparo/acerto autônomos com os MP3s
  carregados e os avisos dos três arquivos no HTML de créditos do build.
  Sem usar o save do proprietário.

Comandos principais executados:

```powershell
node --import tsx --test --test-timeout=15000 --test-name-pattern="samples MP3|interrompe nós|mute inicial|estados fora|eventos readonly|quatro buffers|colisão procedural|destroy idempotente" tests/race-effects-audio.unit.ts
node --import tsx --test --test-timeout=15000 --test-name-pattern="^mixagem:" tests/audio.unit.ts
node --import tsx --test --test-timeout=15000 tests/race-audio-assets.unit.ts
node --import tsx --test --test-timeout=15000 --test-name-pattern="^ritmo" tests/bot-pace-targets.unit.ts
npx.cmd --no-install playwright test tests/race-effects-audio.spec.ts --project=desktop --retries=0 --max-failures=1 --timeout=120000
npx.cmd --no-install playwright test tests/rival-cannon.spec.ts --project=desktop --grep "canhão no loop real:" --retries=0 --max-failures=1 --timeout=120000
npm.cmd run typecheck
```

Build aprovado pelo servidor Playwright, com aviso conhecido de chunk grande.
Não executadas suítes completas, validação em GPU/aparelhos físicos ou escuta humana
dos MP3s na mixagem final. Sem commit, push ou deploy desta etapa.
