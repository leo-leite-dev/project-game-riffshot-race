# Preparação do Rift Blaze oficial — resultado parcial

## Estado

O modelo foi aprovado visualmente pelo proprietário. A promoção do carregamento padrão **ainda não foi feita**, porque o primeiro candidato sem perdas ultrapassa o limite por arquivo do Cloudflare Pages. A integração experimental existente e seus saves permanecem funcionando; o original não foi movido ou alterado.

## Arquivos e resultados

| Arquivo | Bytes | MiB aproximados |
| --- | ---: | ---: |
| Original privado `referencias-locais/Vehicles/sci_-_fi_buggy.glb` | 29.082.948 | 27,74 |
| Candidato privado `referencias-locais/legacy-assets/vehicles/rift-blaze/rift-blaze.glb` | 27.208.448 | 25,95 |
| Limite de um asset no Cloudflare Pages | 26.214.400 | 25,00 |

Redução: **1.874.500 bytes (~6,45%)**. O candidato ainda excede o limite em **994.048 bytes**. Não foi adicionado à lista de emissão do Vite e **não aparece em `dist`**. A presença em `public/` permite inspeção local, mas não autoriza publicação; `copyPublicDir: false` continua protegendo o build.

Fonte do limite: https://developers.cloudflare.com/pages/platform/limits/#file-size . Nenhuma conta, serviço pago, R2 ou deploy foi criado.

### Otimizações efetivamente aplicadas

- Recompressão PNG sem perdas, sem reduzir resolução ou modificar pixels, perfis ou chunks auxiliares; economia de 198.139 bytes. Foram comparadas também alternativas de filtros de scanline, sem melhoria adicional.
- Índices de 32 para 16 bits em 42 accessors, com limites compatíveis.
- Remoção de 38 atributos UV sem referência em nenhum mapa do respectivo material, incluindo overrides de `KHR_texture_transform`.
- União de 1.746 vértices **com todos os atributos retidos exatamente iguais**. Costuras de UV e normais diferentes não foram unidas.
- Remoção de padding/visões/accessors não mais usados durante a reconstrução do binário e JSON compacto.
- Mantidos os **161.868 triângulos**, ordem das superfícies, todos os materiais, texturas, transformações e hierarquia. A serialização JSON normaliza `-0` para `0`, sem mudança da matriz resultante.
- Autoria, fonte e licença preservadas nos metadados; adicionado aviso das modificações.

Relatório reprodutível: `referencias-locais/legacy-assets/vehicles/rift-blaze/optimization.json`, incluindo hashes do original e do candidato. Comando: `node scripts/optimizeRiftBlaze.ts`. O comando lê somente o original indicado e escreve o candidato/relatório, não o original. A preparação não deve ser automatizada no build público, pois o original é privado.

### Verificações

`node --import tsx --test tests/rift-optimization.unit.ts` verifica:

1. Identidade de autoria/fonte/licença, tamanho e hash do candidato.
2. Para cada índice de cada triângulo, correspondência byte a byte dos atributos retidos após remapeamento; materiais/nós/texturas preservados.
3. Pixels idênticos nas PNGs 8-bit suportadas pelo refiltro; scanlines idênticas nas demais PNGs; JPEG original inalterada.

As comparações com o original são puladas quando a referência privada não existe, por exemplo num clone público. A verificação do candidato e metadados não depende do original. Esta equivalência de dados **não substitui comparação visual no navegador**, ainda pendente para o candidato.

## Opções investigadas e proposta para aprovação

- **WebP sem perdas:** próximo passo recomendado. Converter PNGs usando ferramenta gratuita de preparação (por exemplo `sharp`, apenas em desenvolvimento), manter dimensões/pixels e usar `EXT_texture_webp`, já reconhecida pelo GLTFLoader. Comparar pixels e capturas antes de oficializar. Não exige serviço externo, mas altera o formato de textura distribuído e precisa validar navegadores-alvo. Ainda não aplicado nem instalado.
- **Meshopt/Draco:** podem diminuir bytes de geometria, mas exigem encoder e configuração de decoder, além de conferir pivôs/atributos e eventual quantização. Não adicionados sem aprovação.
- **KTX2/Basis:** podem reduzir memória de GPU e tráfego, mas exigem encoder/transcoder e avaliação visual/compatibilidade. Não aplicados.
- **Redução de resolução/LOD:** não aplicada. Aumentaria o risco de alterar o acabamento aprovado; requer comparação e aprovação específica.
- **Draw calls:** nenhuma fusão de partes mecanicamente independentes foi feita. O template existente já compartilha geometrias/texturas entre instâncias; novas fusões precisam preservar materiais e animação.
- **Assíncrono:** carregamento e cache do adaptador experimental já existem e serão reaproveitados, não duplicados, após resolver o tamanho.

Não usar compressão HTTP como justificativa para ultrapassar o limite do asset armazenado. Não mover a distribuição para serviços que introduzam custos obrigatórios.

## Créditos públicos preparados

`CREDITS.md` e `THIRD_PARTY_NOTICES.md` registram TiyaMakes, fonte, CC BY 4.0, modificações e ausência de endosso/garantia de direitos de terceiros. O link “Créditos e licenças” no jogo abre os avisos da versão pública. Isso prepara atribuição, não comprova publicação ou substituição do modelo padrão.
