# Música da pista Neon Furnace

O proprietário informa que criou a faixa com auxílio de IA e autorizou seu uso
no jogo. Extraímos somente o áudio AAC do MP4 local e o recodificamos para MP3
estéreo a 44,1 kHz. O vídeo original foi preservado em
`referencias-locais/audio/music-fase-1.mp4`; nenhuma imagem/vídeo dele é incluída
na aplicação ou na distribuição.

O MP3 de runtime é `public/assets/audio/neon-furnace-theme.mp3` (aprox. 64,9 s,
1.479.228 bytes). O build Vite o inclui por uma entrada explícita; não copia o
MP4 nem toda a pasta de áudio.

No servidor `npm run dev`, os uploads locais ficam no **Modo Desenvolvedor**, atrás
da senha local já existente. Para cada pista é possível escolher MP3 separados para
música e narração de largada. Os arquivos ficam apenas no IndexedDB deste navegador,
não são enviados ao servidor e nunca são copiados para `dist/`. O MP3 padrão acima é
usado para Neon Furnace quando não há música local personalizada; pistas sem uma
faixa padrão mantêm a fonte musical selecionada até que o proprietário forneça um
override local.

## Comportamento

- A faixa de Neon Furnace começa no próprio gesto de confirmar a pista, antes da
  troca de cena, e toca em loop. A trilha procedural fica inaudível durante a
  faixa; motores e efeitos usam canais independentes.
- A narração local é agendada uma única vez para cerca de dois segundos após o
  jogador confirmar a pista. Ela não fica em loop nem reinicia; a simulação começa
  quando o áudio termina. Sem narração, com erro de reprodução ou timeout, a corrida
  começa sem ficar bloqueada. Não há contagem regressiva.
- Os quatro carros largam alinhados lado a lado na mesma linha longitudinal.
- **Voltage Run** não troca a música selecionada.
- Ao sair da corrida, seja para a Estação de Equipe ou Resultados, a faixa da pista
  para e a trilha procedural/seleção musical original volta segundo a preferência
  do jogador. A rádio, se estava ativa, é retomada após a faixa da pista.
- Se o MP3 não puder iniciar, a falha fica isolada e a música previamente
  selecionada volta a tocar; isso não interrompe a corrida.

## Conversão e verificações

O arquivo original de vídeo foi identificado como H.264 + AAC, 64,9 s, 51.316.511
bytes. O áudio extraído é MP3, estéreo, 44.100 Hz; o MP4 foi mantido fora de
`public/`.

Comando de extração usado:

```powershell
ffmpeg -i referencias-locais/audio/music-fase-1.mp4 -map 0:a:0 -vn -map_metadata -1 -codec:a libmp3lame -q:a 2 -ar 44100 -ac 2 public/assets/audio/neon-furnace-theme.mp3
```

A verificação Playwright da corrida confirma a troca só em Neon Furnace, faixa em
loop, silêncio da música procedural, efeitos/motores independentes e parada/restauração
ao sair. O servidor preview também confere emissão do MP3 e não emissão do MP4.
