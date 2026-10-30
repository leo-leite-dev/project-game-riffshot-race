# Rival, pilotagem e canhão Forja

## Decisão e escopo

Implementação aprovada pelo proprietário: melhorar pilotagem sem privilégios físicos,
dar identidade própria ao rival e adicionar seu canhão com projéteis não teleguiados.
Cada acerto válido retira **20 HP = uma bolinha**, sem a redução de dano de colisão
do piloto. Com menos de 20 HP restantes, a vida termina em zero.

Não há arma ou novo controle para o jogador nesta etapa. Adquirir um Widowmaker
não habilita o canhão. Não foram alterados o schema do save, compras ou premiações.

## Pilotagem

- `BotController` lê movimento real e deslizamento, não somente a direção da carroceria.
- Curvatura local é preparada uma vez em uma tabela de percurso; frenagem considera
  curvas futuras, reação, aderência e vida atual do carro.
- A faixa do grid deixa de ser a trajetória permanente. Ultrapassagens avaliam corredores
  e a aproximação dos outros carros, com compromisso curto e desistência segura.
- O controlador escolhe comandos, sem alterar posição, forças, vida ou velocidade máxima.
- Ravik usa o ID `ravik-ferro`, Widowmaker e atributos próprios estáveis de 30 pontos
  (8 velocidade, 7 aceleração, 7 controle, 5 resistência, 3 agressividade).
  Seu perfil de decisão é mais preciso, independentemente do personagem escolhido.

### Perfis dos outros bots e meta 70/15/15

`botProfiles.ts` separa intenção de pilotagem de atributos físicos:

- `rival`: precisão e agressividade;
- `challenger` (Camaro): linha mais ousada e tentativas de ultrapassagem antecipadas;
- `opportunist` (Armored): margem de recuperação maior e ultrapassagens em trechos menos carregados.

Escolhas limitadas variam por uma seed derivada do ID da corrida. Reiniciar a mesma
prova mantém essa forma; iniciar outra pode variar as decisões. Nenhum peso de
vitória é consultado pelo controlador e nenhum resultado é sorteado ou sobrescrito.

**Meta aprovada: 70% rival / 15% Camaro / 15% Armored entre NPCs. Ainda não atingida.**
A medição estável mais recente usou 20 corridas únicas, dez por pista, no Difícil,
com seeds previamente fixados e jogador observador concluído (sem combate). O
resultado foi **20/0/0 vitórias**. Todos os 60 NPCs terminaram 16 gates em ordem,
sem destruições; o maior período parado foi 0,083 s. Um replay confirmou determinismo.

Duas candidatas com mais variação de pilotagem também mantiveram o rival vencedor.
A mais agressiva causou 21 destruições no Camaro e foi rejeitada, em vez de piorar
os adversários para aparentar uma calibração. Foi restaurada a versão estável.
São necessárias novas decisões de balanceamento; os percentuais não estão
comprovados contra humanos nem com o canhão ativo.

## Sons da corrida

`RaceEffectsAudio.ts` utiliza o contexto Web Audio compartilhado do Phaser. Na
distribuição pública, disparo, impacto e derrapagem usam os efeitos procedurais
originais. Os três MP3s fornecidos pelo proprietário ficam em
`referencias-locais/audio/` e só são usados no servidor dev, pois sua autoria/licença
ainda não foi confirmada; o plugin não os emite no build. Explosões e colisões
continuam sintetizadas.

Em dev, os MP3s são carregados/decodificados uma vez por instância e reutilizados.
Se estiverem ausentes, o carregamento falha de forma isolada e a síntese continua
sem bloquear a corrida. As fontes dos MP3s não são declaradas como criação do projeto.
Limites: oito efeitos curtos simultâneos e quatro vozes de derrapagem. Bots distantes
são atenuados. O áudio lê eventos antes de a apresentação drená-los, sem roubar
clarões/impactos visuais. Impacto de projétil não toca duas vezes como colisão.

Mute, perda de foco, página oculta e contexto suspenso interrompem as fontes;
eventos atrasados são descartados, não reproduzidos em bloco ao retornar.
Na saída, os recursos/listeners são liberados sem fechar o contexto do jogo.

Histórico da primeira adição de sons sintéticos: 30 testes unitários de áudio, seis casos de perfis e
regressões selecionadas de pilotagem; dois casos de navegador verificaram sinal
Web Audio real dos quatro timbres, mute/limpeza e eventos de tiro/acerto no loop
da cena. O teste de sinal isola o barramento dos efeitos para música/motores não
produzirem uma aprovação falsa. Isso não substitui escuta em aparelhos físicos.
Os resultados da substituição por MP3 e da nova medição de tempos ficam em
[AUDIO_AND_PACE.md](AUDIO_AND_PACE.md).

### Referências medidas

Benchmark determinístico de três voltas solo, mesmo Widowmaker e física, comparado
ao controlador legado congelado **somente no teste**:

| Pista | Dificuldade | Legado | Novo |
| --- | --- | ---: | ---: |
| Neon Furnace | Normal | 80,900 s | 63,050 s |
| Neon Furnace | Difícil | 59,183 s | 55,083 s |
| Voltage Run | Normal | 77,167 s | 62,533 s |
| Voltage Run | Difícil | 65,567 s | 55,183 s |

Em tráfego com Camaro e Armored, quatro voltas no Difícil, duas pistas e observador
Vera/Kira, Ravik venceu os **quatro cenários**, chegando 1,934–4,300 s antes do segundo.
O observador foi marcado como concluído para isolar NPCs; esse recorte não inclui
tiros nem comprova taxa de vitória contra humanos. As chegadas usam gates/tempos
físicos, não somente o progresso normalizado do HUD.

## Regras do canhão

- Exclusivo do NPC com perfil `rival`; não é habilitado por nome ou modelo.
- Cinco cargas iniciais. Cada volta legítima **do rival** repõe até cinco, sem acumular.
- Morte/respawn não recarregam e não reiniciam o intervalo entre disparos.
- Intervalos mínimos: Normal 2,4 s; Difícil 0,8 s. O rival não dispara sem oportunidade.
- A decisão verifica alinhamento, distância, altura, movimento previsto e pista livre.
  O jogador é priorizado entre alvos viáveis; outros bots também podem ser atingidos.
- Difícil aproveita janelas mais curtas e distantes; dano e munição são os mesmos.
- Direção e velocidade ficam fixas no disparo: 72 unidades/s, sem perseguir alvos.
- O primeiro acerto consome o projétil. Expira também em barreiras/terreno, em 1,25 s
  ou 90 unidades. Colisão por segmento considera movimento e altura do alvo.
- Proteção de respawn, destruição e chegada continuam impedindo dano.
- Um acerto dá tranco limitado e trepidação breve; não há teleporte nem stun prolongado.
  A chegada válida do jogador prevalece sobre projéteis naquele passo.

## Separação incremental

- `RivalCannon.ts`: regras e pool físico, independente de Phaser/Three.
- `RaceSimulation`: chama o canhão no passo fixo, aplica dano bruto e reaproveita
  destruição/respawn. Colisões preservam sua redução de dano anterior.
- `RivalCannonEffects.ts`: efeitos procedurais Forja, sem assets externos. Núcleo
  incandescente, casca/rastro laranja, clarão branco-dourado e faíscas de impacto.
- `RaceWorld`: somente leitura da física, interpolação dos projéteis, tremor visual
  e descarte. A boca foi conferida no modelo normalizado da corrida, sem editar GLB.

Limites: 12 projéteis físicos, fila de 64 eventos; apresentação com 12 projéteis,
12 clarões e 96 faíscas. Geometria/materiais são reutilizados, sem luzes com sombras
por tiro. Eventos vencidos não reaparecem; os recursos exclusivos são descartados.
Barreiras usam os dados da pista, não colisão detalhada com toda decoração visual.

## Verificação direcionada

Na etapa original do canhão foram aprovados **65 casos unitários distintos**: 18 de
pilotagem/ritmo, 19 de regras do canhão, 3 de integração de dano/recarga, 10 de
efeitos e 15 regressões selecionadas de física/dano/apresentação. Não são contadas
novamente as reexecuções após ajustes. Os **3 casos de navegador distintos**
cobriram os efeitos, a integração no loop real e a largada/rodas dos quatro carros.
As falhas encontradas durante o desenvolvimento (inclusive um bloqueio real de
ultrapassagem em baixa velocidade) foram diagnosticadas e corrigidas; não há
falha pendente nesses casos naquela etapa. São resultados históricos, não uma
reexecução integral após a adição dos perfis e sons. Isso não representa aprovação de toda a suíte.

Typecheck aprovado. Build aprovado pelos servidores da execução direcionada do
Playwright, mantendo o aviso de chunk maior que 500 kB. Sem repetição de build
após as edições exclusivamente documentais finais. Sem commit ou publicação.

Casos diretamente relacionados, sem suíte completa:

```powershell
node --import tsx --test --test-timeout=15000 tests/bot-controller.unit.ts
node --import tsx --test --test-timeout=15000 tests/rival-cannon.unit.ts
node --import tsx --test --test-timeout=15000 tests/rival-cannon-integration.unit.ts
node --import tsx --test --test-timeout=15000 tests/rival-cannon-effects.unit.ts
npx.cmd --no-install playwright test tests/rival-cannon.spec.ts --project=desktop --retries=0 --max-failures=1 --timeout=150000
```

Os casos de navegador incluem fixture visual controlada (avanço físico real para
capturar disparo, voo e impacto) e um caso separado no loop normal: largada,
disparo autônomo, perda de vida, HUD e apresentação. Não usam o save do proprietário.

Capturas reais em `previews-ui/`:
- `rival-canhao-inspecao.png`
- `rival-forja-disparo.png`
- `rival-forja-projetil.png`
- `rival-forja-impacto.png`

Capturas estáticas e Chromium com renderização por software não comprovam fluidez
em GPU física, experiência mobile, Safari/Firefox ou equilíbrio contra humanos.
