# RIFFSHOT RADIO

## O que o jogo faz

RIFFSHOT RADIO usa a API pública e gratuita **Radio Browser**, sem chave de API
ou conta. A lista é pesquisada por gênero (Hard Rock, Classic Rock, Heavy Metal,
Rock e 80s Rock). O cliente descobre mirrors pela lista oficial
`https://all.api.radio-browser.info/json/servers`, embaralha os hosts HTTPS e
tenta até três servidores por pedido. Um mirror oficial é usado somente como
fallback caso a lista de descoberta não responda; a busca normal usa os servidores
descobertos e embaralhados, não um host único fixo.

A pesquisa usa `GET /json/stations/search` com `tag`, `hidebroken=true`,
`is_https=true`, ordenação por popularidade e limite pequeno. O jogo também filtra
estações com `lastcheckok`, streams HTTPS, HLS não suportado e codecs que o
navegador informa saber reproduzir. A URL `url_resolved` da API é preferida para
playlists e redirects já resolvidos. O click counter oficial `/json/url/{stationuuid}`
é chamado quando o usuário inicia a transmissão.

## Player e áudio do jogo

`RiffshotRadio` é criado uma vez junto ao jogo, fora do ciclo de vida das cenas.
Ele mantém um único `HTMLAudioElement`; trocar de cena não reinicia a rádio. O
player não inicia sozinho: o navegador começa a tocar somente quando o usuário
pressiona Reproduzir. Ao restaurar a preferência de rádio depois de reabrir o jogo,
o player fica pausado e exige nova interação.

Fonte musical e efeitos são canais separados. Ativar RIFFSHOT RADIO silencia a
trilha procedural do jogo, não os motores, tiros, explosões, derrapagens ou colisões.
Os volumes da trilha, da rádio e dos efeitos têm controles próprios. A preferência
de fonte, gênero, última `stationuuid`, volumes e intenção de reprodução fica numa
chave própria de `localStorage`, independente do campeonato e dos saves.

Na Estação de Equipe, Configurações permite buscar e selecionar emissoras. Durante
a corrida há um controle compacto com estação, status, anterior/próxima e
reproduzir/pausar; ele pode ser minimizado. Metadados de música atual não são
inventados: HTMLAudioElement não expõe de forma interoperável os headers ICY de
todas as emissoras, e a API Radio Browser não promete uma faixa atual em tempo real.

## Limitações e direitos

- Radio Browser cataloga streams, não licencia o conteúdo musical transmitido.
  Cada emissora controla seus direitos, regiões e condições de incorporação. A
  possibilidade de distribuição comercial de determinada estação pode precisar
  de confirmação antes da publicação.
- O app toca o URL HTTPS diretamente no navegador; não baixa, grava, armazena nem
  retransmite áudio. Não usa proxy de terceiros nem contorna CORS, bloqueios
  geográficos ou restrições da emissora.
- CORS, codec, geobloqueio, URL expirado ou indisponibilidade podem impedir uma
  estação de tocar mesmo que ela apareça no catálogo. O player mostra o erro e
  permite outra estação; isso nunca bloqueia corrida ou navegação.
- Streams HLS e HTTP são filtrados nesta versão. Os formatos restantes ainda
  dependem do suporte efetivo do navegador e do servidor da estação.
- A documentação da Radio Browser pede um User-Agent identificável, mas browsers
  proíbem scripts de página de definir esse header reservado. O navegador envia
  seu próprio User-Agent; não há backend nem proxy criado para contornar isso.
- A Radio Browser é gratuita, sem chave, mas sem garantia de disponibilidade. A
  descoberta e a rotação de mirrors reduzem dependência de um host, não eliminam
  indisponibilidade da rede ou de estações individuais.

## Fontes oficiais

- API: <https://api.radio-browser.info/>
- Referência: <https://docs.radio-browser.info/>
- Descoberta oficial de servidores: <https://all.api.radio-browser.info/json/servers>
- Exemplo de descoberta para browser: <https://api.radio-browser.info/examples/serverlist-browser.js>

## Smoke de reprodução local

Em 30/10/2026, um teste em Chromium local descobriu e reproduziu diretamente o
stream HTTPS **# 100 GREATEST HEAVY METAL** (MP3, 192 kbps, host
`cast1.torontocast.com`). Isso confirma o player neste navegador e nessa conexão,
não garante disponibilidade futura, em outras regiões/dispositivos ou autorização
comercial sobre a programação da emissora.
