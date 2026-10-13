# Editor de PDF pessoal: desenho

Data: 12 de outubro de 2026, revista em 13 de outubro de 2026.
Situação: a primeira versão foi aprovada pelo Lucas em 12/10/2026. Em 13/10/2026 ele mudou o rumo: no PC passa a usar o PdfCraft, e este projeto fica só com o app do Android, aproveitando partes do PdfCraft. Esta revisão registra o rumo novo.

## Objetivo

App de PDF para o celular Android do Lucas, sem propaganda e sem marca d'água: ler, selecionar texto, digitalizar documentos com a câmera e organizar páginas.

No PC ele usa o PdfCraft (https://github.com/storytold/pdfcraft), versão 0.7.1, que ele mesmo instala. É um editor aberto, escrito do zero em Rust pela equipe ArtCraft a partir da norma do PDF, sob licença MIT ou Apache-2.0, e cobre anotações, organização de páginas, assinatura por imagem e impressão. Não existe versão dele para Android, e a digitalização dele trabalha sobre uma foto que já está numa página do PDF. Essa lacuna é o que este projeto preenche.

O REA, que motivou a conversa, não entra no projeto.

## O que o app faz

| Função | Etapa |
|---|---|
| Digitalizar com a câmera: detecção da folha, endireitamento, limpeza e compressão | 2 |
| OCR em português, para selecionar texto em documento digitalizado | 2 |
| Salvar compactado | 2 |
| Ler: rolagem contínua, zoom, miniaturas, marcadores, busca | 3 |
| Selecionar e copiar texto | 3 |
| Copiar uma área da página como imagem | 3 |
| Adicionar páginas: em branco, de outro PDF ou de uma foto | 3 |
| Juntar arquivos | 3 |
| Separar por intervalo, a cada N páginas, por marcadores ou só a página atual | 3 |
| Tirar, girar e reordenar páginas | 3 |
| Cortar margens | 3 |
| Apagar área, removendo o conteúdo do arquivo | 4 |
| Pôr e tirar imagem | 4 |
| Corrigir texto | 4 |

O app trabalha com um PDF aberto por vez. Assinatura (por imagem ou com certificado A3) e anotações ficam de fora: o Lucas faz isso no PC, com o PdfCraft.

## Arquitetura

O app é um programa web em TypeScript, construído com Vite e com a interface em Preact. Fica publicado num endereço HTTPS e é instalado pelo Chrome do Android como app (PWA). O service worker guarda o programa, o MuPDF.js e os dados de OCR em português, de modo que, depois do primeiro acesso, tudo funciona sem internet. O PDF chega pelo botão Compartilhar de outros apps (Web Share Target) ou pelo seletor de arquivos. Salvar gera um arquivo novo em Downloads ou devolve o PDF pelo Compartilhar.

Todo o trabalho com PDF passa pelo MuPDF.js (pacote npm `mupdf`, versão 1.28.1, licença AGPL-3.0), num Web Worker, para a tela não travar enquanto ele desenha páginas de um processo grande. O mesmo motor mostra e grava, então o que aparece na tela é o que vai para o arquivo, e a interface só conversa com ele por mensagens de tipo definido. Esse motor já existe: foi feito na etapa 1 (PR #1) e é aproveitado inteiro.

A etapa 1 também construiu um lançador em Python para o PC, com janela própria em WebView2. Com o PdfCraft no PC, ele deixou de ter uso. Fica no repositório, sem desenvolvimento, até o Lucas decidir se sai.

### Unidades

| Unidade | O que faz | Depende de |
|---|---|---|
| `motor` | Abre, desenha, extrai texto, altera e serializa PDFs. Roda no worker | MuPDF.js |
| `interface` | Telas do celular: início, leitor, grade de páginas, digitalizador e diálogos | `motor` (mensagens), `plataforma` |
| `digitalizador` | Detecção da folha, endireitamento, limpeza, compressão e montagem das páginas | código próprio, reescrito a partir do PdfCraft; `motor` |
| `ocr` | Reconhece o texto de uma imagem e devolve as palavras com posição. Quem grava a camada invisível no PDF é o `motor` | Tesseract.js com dados `por` |
| `plataforma` | Abrir, salvar, rascunhos, recentes e compartilhar | APIs do navegador e IndexedDB |

A interface `Plataforma` foi definida na etapa 1, junto com a implementação do PC. A do Android é nova e segue o mesmo contrato.

### Pastas

```
editor-pdf/
  web/src/motor/
  web/src/interface/
  web/src/digitalizador/
  web/src/ocr/
  web/src/plataforma/
  lancador/            (da etapa 1, sem uso)
  docs/
  testes-reais/        (ignorada pelo git)
```

## O que vem do PdfCraft

Quatro arquivos do PdfCraft foram lidos na íntegra em 13/10/2026. Eles são reescritos em TypeScript dentro do `digitalizador`, e os testes deles, feitos com fotos sintéticas, são portados como gabarito para conferir a versão nova.

| Arquivo no PdfCraft | Último commit | Vira |
|---|---|---|
| `crates/engine/src/camera_edges.rs` | `1970935587d9`, 12/10/2026 | detecção da folha |
| `crates/geom/src/perspective.rs` | `b1e958cf63a3`, 11/10/2026 | homografia e ordem dos cantos |
| `crates/engine/src/camera.rs`, função `warp` | `8f8e0236aaef`, 11/10/2026 | endireitamento |
| `crates/engine/src/camera_clean.rs` | `8f8e0236aaef`, 11/10/2026 | limpeza e aparências |

Compilar o Rust para WebAssembly traria uma segunda linguagem e outro conjunto de ferramentas para manter. As quatro peças somam cerca de 800 linhas de lógica e não dependem de nenhuma biblioteca, só de aritmética, por isso a reescrita sai mais simples. Com elas, o OpenCV.js que a versão anterior desta spec previa sai do projeto, e o celular deixa de baixar alguns megabytes.

O OCR do PdfCraft fica de fora. Os modelos dele leem só inglês sem acentos: o alfabeto tem 96 símbolos, nenhum acentuado, como está em `crates/ocr/src/lib.rs` (commit `5cce1b247fa9`). Um documento em português sairia com as palavras erradas. O app usa o Tesseract.js, que tem modelo próprio para português. Também não se aproveita o renderizador nem o motor de PDF do PdfCraft, papel que o MuPDF.js já cumpre aqui.

Cada arquivo reescrito traz no topo a origem e o aviso da licença MIT do PdfCraft ("Copyright (c) 2026 ArtCraft Team and the PdfCraft contributors"). O texto completo da licença fica em `web/src/digitalizador/AVISO-PDFCRAFT.txt`.

## Interface

A tela inicial tem o botão "Digitalizar" em destaque, "Abrir PDF" e a lista de recentes. O leitor ocupa a tela toda, com uma barra inferior: Páginas, Texto, Buscar e Salvar. O texto se seleciona com toque longo, e aparece a opção de copiar.

"Páginas" abre a grade de miniaturas em tela cheia, com seleção de várias páginas e as operações de página. Cortar margens funciona arrastando um retângulo numa página e escolhendo se o corte vale para ela, para todas, para as pares ou para as ímpares. A tela do corte avisa que ele só esconde o conteúdo de fora (altera a CropBox) e que, para remover um dado sigiloso, a ferramenta certa é apagar área.

## Abrir, editar e salvar

Toda alteração acontece no documento em memória. Desfazer e refazer usam o journal do MuPDF, que a etapa 1 já usa. Como o celular não tem teclado, cada operação mostra um aviso com o botão Desfazer.

A cada minuto o app guarda um rascunho no IndexedDB. Ao abrir de novo depois de um travamento, oferece recuperar.

Salvar gera "nome (editado).pdf" em Downloads ou devolve o PDF pelo Compartilhar. O Android não deixa um app web gravar por cima do arquivo recebido, e o original fica como estava. "Salvar compactado" remove objetos que sobraram de edições anteriores e recomprime as imagens com a mesma compressão do digitalizador.

## Digitalizador

O processo de cada página:

1. A foto é tirada pelo app de câmera do próprio Android, chamado pelo editor, o que aproveita o foco automático e a qualidade da câmera nativa.
2. Numa cópia reduzida a 400 pixels no lado maior, o detector procura as bordas da folha: desfoque, gradientes de Sobel, transformada de Hough em que cada borda vota só perto da própria direção, e escolha do maior quadrilátero convexo com os quatro lados apoiados em bordas. Se nenhum convence, os cantos começam nos extremos da foto.
3. O Lucas confere e ajusta os quatro cantos com o dedo.
4. A homografia leva o quadrilátero a um retângulo do tamanho dos lados maiores, na resolução cheia da foto, com interpolação bilinear e limite de 40 megapixels. Depois a página é reduzida ao equivalente a 200 dpi, valor a ajustar no protótipo.
5. Limpeza, com quatro aparências e um nível de 0 a 100. Original deixa a foto como foi tirada. Colorida estima a iluminação do papel em blocos (o percentil 90 de cada canal), divide a foto por ela, estica o contraste e, do nível 60 em diante, apaga pontos isolados; tinta colorida, como um carimbo azul, continua colorida. Cinza faz o mesmo e passa para tons de cinza. Preto e branco iguala a iluminação e aplica um limiar único, que o nível desloca.
6. Compressão: JPEG para colorida e cinza, PNG para preto e branco, porque o JPEG borraria cinza em volta de cada letra. A qualidade do JPEG e o tamanho alvo por página são medidos no protótipo, partindo da qualidade 90 que o PdfCraft usa.
7. As páginas viram um PDF. Se o Lucas pedir OCR, ele roda em segundo plano, e o `motor` grava a camada de texto invisível sobre cada página.

## Erros

Nenhum erro pode fazer o Lucas perder trabalho. O original nunca é alterado, e o rascunho automático cobre o que ainda não foi salvo.

| Situação | O que o app faz |
|---|---|
| PDF com senha para abrir | Pede a senha. Sem ela, não abre |
| PDF com restrição de edição | Abre e avisa que o autor marcou o arquivo como não editável. O Lucas decide se edita |
| PDF danificado | O MuPDF tenta reparar ao abrir. Se reparou, avisa |
| Câmera sem permissão | Explica como liberar nas configurações do Android |
| Folha não detectada na foto | Começa com os cantos nos extremos para ajuste manual |
| OCR demorando | Roda em segundo plano, com progresso e opção de cancelar. O PDF fica usável sem ele |
| Processo grande demais para a memória do celular | Desenha página por página. Se faltar memória, avisa e sugere abrir no PC, com o PdfCraft |
| Letra ausente na fonte do PDF ao corrigir texto | Usa fonte parecida e avisa |

## Testes

Os testes automáticos rodam a cada mudança, com o Vitest.

Cada operação do `motor` é testada gerando um PDF, aplicando a operação e lendo o arquivo de volta, e todo arquivo produzido também é aberto pelo PDF.js, um segundo leitor independente, para pegar arquivo que só o MuPDF aceitaria. Assim já é na etapa 1.

O digitalizador herda os testes do PdfCraft, com fotos sintéticas: folha inclinada sobre mesa lisa, folha com texto, mesa com veio de madeira e sombra, cartão em perspectiva forte, folha girada 30 graus, folha saindo da foto, foto sem documento, sombra de mão com luz amarelada, carimbo azul e pontos isolados. Depois vêm fotos reais tiradas pelo Lucas no celular dele (mesa clara, mesa escura, folha torta, sombra forte), e o teste confere a posição dos cantos dentro de uma tolerância, o tamanho do arquivo abaixo do alvo e as palavras lidas pelo OCR.

Cada etapa termina com um roteiro curto que só o Lucas pode executar no celular: instalar o app, digitalizar um documento real e abrir um PDF recebido pelo WhatsApp.

## Etapas e critério de pronto

| Etapa | Conteúdo | Pronta quando |
|---|---|---|
| 1 | Motor de PDF (e o lançador do PC, hoje sem uso) | Feita no PR #1, que aguarda o merge |
| 2 | Digitalizador, OCR em português, salvar compactado e o app mínimo publicado: início, câmera, ajuste dos cantos, salvar e compartilhar | Testes passando e o Lucas digitalizou documentos reais dele no celular |
| 3 | Leitor e operações de página, recebendo PDF pelo Compartilhar | Testes passando e o Lucas usou no dia a dia sem problema que impeça o uso |
| 4 | Apagar área, imagens, correção de texto | Idem |

A digitalização vem antes do leitor porque é o motivo principal do app no celular. A etapa seguinte só começa depois que a anterior foi usada no dia a dia.

## Pontos a verificar antes de cada etapa

Estes pontos dependem de comportamento que ainda não foi conferido e são testados num protótipo curto antes da etapa correspondente.

| Etapa | Ponto |
|---|---|
| 2 | Chamar o app de câmera do Android pelo navegador e receber a foto em resolução cheia |
| 2 | Velocidade do digitalizador em TypeScript e do Tesseract.js no celular do Lucas |
| 2 | MuPDF.js: gravar a camada de texto invisível com as letras acentuadas do português |
| 2 | GitHub Pages servindo o app com service worker e o `.wasm` do MuPDF |
| 3 | Web Share Target recebendo arquivo PDF no Chrome do Android |
| 3 | Desempenho do MuPDF.js com processos de centenas de páginas no celular do Lucas |
| 4 | MuPDF.js: modos de remoção de conteúdo, inserção de texto com a fonte embutida e verificação de letras ausentes |

## Segurança e privacidade

Os PDFs e as fotos nunca saem do aparelho. O endereço HTTPS hospeda só o código do programa. Os PDFs reais usados em teste ficam em `testes-reais/`, que o git ignora, e os commits usam o e-mail noreply do GitHub.

## Licenças

O MuPDF.js é AGPL-3.0, e o app, por usá-lo, segue a mesma licença. Como o programa fica acessível pela internet, a AGPL pede que o código-fonte esteja disponível para quem o usa, o que o repositório público resolve. As demais partes têm licenças permissivas compatíveis com a AGPL: Preact (MIT), Tesseract.js (Apache-2.0) e o código reescrito do PdfCraft (MIT, com o aviso de autoria mantido).

## Decisões registradas

| Ponto | Decisão |
|---|---|
| PC | O Lucas usa o PdfCraft. Anotações, assinatura por imagem, assinatura A3 e impressão ficam com ele |
| Onde publicar o app | GitHub Pages, com o repositório público na conta LNannini, no plano gratuito |
| Nome do programa | Provisório: "Editor PDF" |
| Anotações e assinatura no Android | Fora |
| Lançador do PC feito na etapa 1 | Fica no repositório, sem uso. A remoção é decisão do Lucas |
