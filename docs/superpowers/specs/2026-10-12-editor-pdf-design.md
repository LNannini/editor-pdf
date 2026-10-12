# Editor de PDF pessoal: desenho

Data: 12 de outubro de 2026.
Situação: aprovado na conversa, parte por parte, e a versão escrita aprovada pelo Lucas em 12/10/2026, com as propostas da tabela de pendências aceitas.

## Objetivo

Editor de PDF para uso pessoal, no PC com Windows e no celular Android. No PC, atende o trabalho diário com PDF: ler, anotar, organizar páginas, corrigir conteúdo e assinar. No Android, serve para ler, selecionar texto, digitalizar documentos com a câmera e organizar páginas.

O REA, que motivou a conversa, não entra no projeto. O PDF é padrão aberto (ISO 32000), e tudo o que o editor precisa saber sobre o formato está na especificação.

## O que o editor faz

| Função | PC | Android | Etapa |
|---|---|---|---|
| Ler: rolagem contínua, zoom, miniaturas, marcadores, busca | sim | sim | 1 |
| Vários PDFs abertos em abas | sim | não, um por vez | 1 |
| Selecionar e copiar texto | sim | sim | 1 |
| Copiar uma área da página como imagem | sim | sim | 1 |
| Adicionar páginas: em branco, de outro PDF ou de uma foto | sim | sim | 1 |
| Juntar arquivos | sim | sim | 1 |
| Separar por intervalo, a cada N páginas ou por marcadores | sim | sim | 1 |
| Tirar, girar e reordenar páginas | sim | sim | 1 |
| Cortar margens | sim | sim | 1 |
| Assinatura por imagem | sim | não | 1 |
| Digitalizar com a câmera: recorte e endireitamento automáticos, limpeza, compressão | não | sim | 2 |
| OCR, para selecionar texto em documento digitalizado | sim | sim | 2 |
| Salvar compactado | sim | sim | 2 |
| Anotações: seta, caixa de texto, grifo, sublinhado, retângulo, círculo, caneta livre | sim | não | 3 |
| Apagar área, removendo o conteúdo do arquivo | sim | sim | 4 |
| Pôr e tirar imagem | sim | sim | 4 |
| Corrigir texto | sim | sim | 4 |
| Assinatura com certificado A3 | sim | não | 4 |

Ficam de fora, por não terem sido pedidos: nota de comentário, preenchimento de formulário, comparação de documentos, medições, conversão para PDF/A e carimbo de tempo na assinatura. A impressão ainda não foi discutida e está nas pendências, no fim deste documento.

## Arquitetura

O editor é um programa web em TypeScript, construído com Vite, com a interface em Preact. O Preact foi escolhido por ser pequeno e usar o mesmo modelo de componentes do React, o que facilita a manutenção.

Todo o trabalho com PDF passa pelo MuPDF.js (pacote npm `mupdf`, versão 1.28.1 nesta data, licença AGPL-3.0), que roda num Web Worker para a tela não travar enquanto ele desenha páginas de um processo grande. O mesmo motor mostra e grava, então o que aparece na tela é o que vai para o arquivo. A interface conversa com o motor só por mensagens de tipo definido e nunca mexe no PDF diretamente.

No PC, um lançador em Python 3.13 cuida do que o navegador não alcança. Ele serve o editor em 127.0.0.1, abre uma janela do Edge sem barra de endereço (`msedge --app=...`), lê e grava arquivos no disco, guarda backups e rascunhos, faz a assinatura com o certificado A3 e registra o editor no "Abrir com" do Explorer. O servidor HTTP é o da biblioteca padrão do Python, sem dependência extra. Se o lançador for chamado com o editor já aberto, ele entrega o arquivo à instância que está rodando, que abre uma aba nova, e encerra.

O registro no "Abrir com" e o atalho na área de trabalho são feitos por um script de instalação que grava só em `HKEY_CURRENT_USER`, sem pedir administrador, e um script de desinstalação desfaz tudo. O leitor de PDF padrão do Windows não muda.

No Android, o mesmo programa fica publicado num endereço HTTPS e é instalado pelo Chrome como app (PWA). O service worker guarda o programa, o MuPDF.js, o OpenCV.js e os dados de OCR em português, e depois do primeiro acesso tudo funciona sem internet. O PDF chega pelo botão Compartilhar de outros apps (Web Share Target) ou pelo seletor de arquivos. Salvar gera um arquivo novo em Downloads ou devolve o PDF pelo Compartilhar.

### Unidades

| Unidade | O que faz | Depende de |
|---|---|---|
| `motor` | Abre, desenha, extrai texto, altera e serializa PDFs. Roda no worker | MuPDF.js |
| `interface` | Janela, abas, painel lateral, visualizador, ferramentas e diálogos | `motor` (mensagens), `plataforma` |
| `digitalizador` | Câmera, detecção da folha, endireitamento, limpeza, compressão e montagem das páginas | OpenCV.js, `motor` |
| `ocr` | Reconhece o texto de uma imagem e devolve as palavras com posição. Quem grava a camada invisível no PDF é o `motor` | Tesseract.js com dados `por` |
| `plataforma` | Abrir, salvar, rascunhos, recentes, compartilhar e cadastro da imagem de assinatura. Tem duas implementações, PC e Android | lançador (PC); APIs do navegador e IndexedDB (Android) |
| `lancador` | Servidor local, janela do Edge, disco, backup, rascunhos, assinatura A3, "Abrir com" | biblioteca padrão do Python, pyHanko, python-pkcs11, driver SafeSign (`aetpkss1.dll`) |

O resto do código não sabe em que plataforma está rodando. Ele consulta só uma lista de capacidades (abas, câmera, assinatura A3) que a `plataforma` informa.

Os rascunhos no PC ficam com o lançador, em disco, e não no IndexedDB do Edge. O lançador sobe em porta aleatória, e o IndexedDB é separado por endereço, o que faria os rascunhos sumirem a cada abertura.

### Pastas

```
editor-pdf/
  web/src/motor/
  web/src/interface/
  web/src/digitalizador/
  web/src/ocr/
  web/src/plataforma/
  lancador/
  docs/
  testes-reais/        (ignorada pelo git)
```

## Interface

No PC a janela segue a disposição comum dos editores de PDF para Windows, de forma enxuta. No alto fica uma barra única de ferramentas: abrir, salvar, desfazer e refazer; mão, seleção de texto e cópia de área; o grupo de anotações, que aparece na etapa 3; assinatura; e busca. Logo abaixo ficam as abas dos documentos. À esquerda, um painel com duas guias, miniaturas e marcadores. No centro, as páginas em rolagem contínua. No rodapé, página atual, total de páginas e zoom.

As operações de página ficam no botão direito da miniatura e num menu "Páginas". Arrastar a miniatura reordena. Cortar margens funciona arrastando um retângulo numa página e escolhendo se o corte vale para ela, para todas, para as pares ou para as ímpares. A tela do corte avisa que ele só esconde o conteúdo de fora (altera a CropBox) e que, para remover um dado sigiloso, a ferramenta certa é apagar área.

A assinatura por imagem tem cadastro único. O Lucas fotografa a assinatura no papel, o editor tira o fundo branco e guarda a imagem. Depois, um clique na página posiciona a assinatura, que pode ser movida e redimensionada enquanto o documento estiver aberto e entra no conteúdo da página ao salvar.

No Android, a tela inicial tem o botão "Digitalizar" em destaque, "Abrir PDF" e a lista de recentes. O leitor ocupa a tela toda, com uma barra inferior: Páginas, Texto, Buscar e Salvar. O texto é selecionado com toque longo, e aparece a opção de copiar. "Páginas" abre a grade de miniaturas em tela cheia, com seleção de várias páginas e as mesmas operações do PC.

## Abrir, editar e salvar

Toda alteração acontece no documento em memória, e o original só muda quando um salvamento termina. Ctrl+Z e Ctrl+Y desfazem e refazem passo a passo, usando o journal do MuPDF se o MuPDF.js o expuser, ou cópias do documento por passo, com limite de memória, se não expuser. No Android, que não tem teclado, cada operação mostra um aviso com o botão Desfazer.

A cada minuto o editor guarda um rascunho. Ao abrir de novo depois de um travamento, oferece recuperar.

No PC, Ctrl+S grava no próprio arquivo. O lançador escreve primeiro num arquivo temporário na mesma pasta e só depois troca um pelo outro, de modo que uma queda de energia deixa o original intacto ou o novo completo. Antes da troca, ele copia a versão anterior para `%LOCALAPPDATA%\EditorPDF\versoes`, onde ela fica por 30 dias.

No Android, salvar gera "nome (editado).pdf" em Downloads ou devolve o PDF pelo Compartilhar. O Android não deixa um app web gravar por cima do arquivo recebido, e o original fica como estava.

"Salvar compactado" remove objetos que sobraram de edições anteriores e recomprime as imagens, com a mesma compressão do digitalizador.

## Assinatura com certificado

A assinatura usa o pyHanko com o token A3 pelo driver SafeSign (`aetpkss1.dll`, já instalado no Windows), no formato PAdES. Antes de pedir o PIN, o lançador verifica se o token está conectado, se o certificado está dentro da validade e quantas tentativas de PIN restam. O PIN passa só pela memória do lançador durante a assinatura e não é gravado.

Assinar sempre gera um arquivo novo, "nome (assinado).pdf", e é o último passo. A assinatura pode ser visível, com nome e data num retângulo que o Lucas posiciona, ou invisível. Ao abrir um PDF assinado, uma faixa avisa que editar invalida a assinatura, e o editor pede confirmação antes de salvar alterações nele.

## Digitalizador

O processo de cada página:

1. A foto é tirada pelo app de câmera do próprio Android, chamado pelo editor, o que aproveita o foco automático e a qualidade da câmera nativa.
2. Numa cópia reduzida da foto, o OpenCV.js procura o maior contorno de quatro lados (escala de cinza, desfoque, detecção de bordas). Se não achar, os cantos começam nos extremos da foto.
3. O Lucas confere e ajusta os quatro cantos com o dedo.
4. A homografia leva o quadrilátero a um retângulo, na resolução cheia. O ponto de partida é o equivalente a 200 dpi, a ajustar no protótipo.
5. Limpeza, em três modos. Colorido normaliza o fundo. Cinza divide a imagem pelo fundo borrado para tirar sombra e reforça o contraste. Preto e branco usa limiar adaptativo.
6. Compressão: JPEG com qualidade ajustada para colorido e cinza, e imagem de 1 bit por pixel para preto e branco. O tamanho alvo por página é medido no protótipo.
7. As páginas viram um PDF. Se o Lucas pedir OCR, ele roda em segundo plano, e o `motor` grava a camada de texto invisível sobre cada página.

## Erros

Nenhum erro pode fazer o Lucas perder trabalho. O original só muda depois de um salvamento concluído, e o rascunho automático cobre o resto.

| Situação | O que o editor faz |
|---|---|
| PDF com senha para abrir | Pede a senha. Sem ela, não abre |
| PDF com restrição de edição | Abre e avisa que o autor marcou o arquivo como não editável. O Lucas decide se edita |
| PDF danificado | O MuPDF tenta reparar ao abrir. Se reparou, avisa e sugere "Salvar como" |
| Arquivo aberto em outro programa ao salvar | Avisa para fechar no outro programa ou salvar com outro nome |
| Letra ausente na fonte do PDF ao corrigir texto | Usa fonte parecida e avisa |
| Token desconectado ou certificado vencido | Avisa antes de pedir o PIN |
| PIN errado | Mostra quantas tentativas restam e pede confirmação antes da última |
| Câmera sem permissão | Explica como liberar nas configurações do Android |
| Folha não detectada na foto | Começa com os cantos nos extremos para ajuste manual |
| OCR demorando | Roda em segundo plano, com progresso e opção de cancelar. O PDF fica usável sem ele |
| Processo grande demais para a memória do celular | Desenha página por página. Se faltar memória, avisa e sugere abrir no PC |
| "Abrir com" com o editor já aberto | Abre o arquivo numa aba nova da janela existente |

## Testes

Os testes automáticos rodam a cada mudança: Vitest para o código web e pytest para o lançador.

Cada operação do `motor` é testada gerando um PDF, aplicando a operação e lendo o arquivo de volta. Juntar e separar conferem número e ordem das páginas; cortar confere a CropBox; anotação confere tipo, cor e ponta da seta; apagar área confere que o texto saiu do arquivo; corrigir texto confere que a palavra nova está lá e a antiga não. Todo arquivo produzido também é aberto pelo PDF.js, um segundo leitor independente, para pegar arquivo que só o MuPDF aceitaria.

O digitalizador é testado com um conjunto fixo de fotos de folhas (mesa clara, mesa escura, folha torta, sombra forte), parte delas tiradas pelo Lucas no celular dele. O teste confere a posição dos cantos dentro de uma tolerância, o tamanho do arquivo abaixo do alvo e as palavras lidas pelo OCR.

A assinatura é testada com um certificado de teste gerado para isso, nunca com o do Lucas. O teste assina, valida e depois altera um byte do arquivo para confirmar que a validação acusa a mudança. O lançador tem testes para recusar pedido sem o segredo da sessão, para o salvamento atômico e para a criação do backup.

Cada etapa termina com um roteiro curto que só o Lucas pode executar. Na etapa 4 entram a assinatura com o token dele, com ele digitando o PIN, e a conferência do arquivo no validador do ITI. No Android, o roteiro inclui instalar o app, digitalizar um documento real e abrir um PDF recebido pelo WhatsApp.

## Etapas e critério de pronto

| Etapa | Conteúdo | Pronta quando |
|---|---|---|
| 1 | Leitor, cópia, operações de página, assinatura por imagem, lançador e publicação para o Android | Testes passando e o Lucas usou no dia a dia, no PC e no celular, sem problema que impeça o uso |
| 2 | Digitalizador, OCR, salvar compactado | Idem, com digitalização de documentos reais dele |
| 3 | Anotações | Idem, com as anotações abrindo corretamente em outros leitores, como o Acrobat Reader |
| 4 | Apagar área, imagens, correção de texto, assinatura A3 | Idem, com assinatura aprovada no validador do ITI |

A etapa seguinte só começa depois que a anterior foi usada no dia a dia.

## Pontos a verificar antes de cada etapa

Estes pontos dependem de comportamento de biblioteca que não foi conferido e são testados num protótipo curto antes da etapa correspondente.

| Etapa | Ponto |
|---|---|
| 1 | Desempenho do MuPDF.js com processos de centenas de páginas, no PC e no celular do Lucas |
| 1 | MuPDF.js: definir CropBox, copiar páginas entre documentos, journal para desfazer |
| 1 | Web Share Target recebendo arquivo PDF no Chrome do Android |
| 2 | Peso e velocidade do OpenCV.js e do Tesseract.js no celular do Lucas |
| 3 | MuPDF.js: anotação de linha com ponta de seta (`/LE`) e geração da aparência |
| 4 | MuPDF.js: modos de remoção de conteúdo, inserção de texto com a fonte embutida e verificação de letras ausentes |
| 4 | python-pkcs11 no Python 3.13 do Windows, acesso ao `aetpkss1.dll` e suporte do pyHanko ao identificador de política de assinatura da ICP-Brasil, conferido no validador do ITI |

## Segurança e privacidade

O lançador escuta só em 127.0.0.1 e confere o cabeçalho Host de cada pedido, o que bloqueia sites que tentem chegar nele por troca de DNS. A cada abertura ele gera um segredo novo, que vai embutido na página servida à janela do editor. Pedidos sem o segredo são recusados, e o servidor não envia cabeçalhos CORS, então nenhum outro site consegue ler a página para descobrir o segredo.

Os PDFs nunca saem do aparelho. O endereço HTTPS hospeda só o código do programa. Os PDFs reais usados em teste ficam em `testes-reais/`, que o git ignora, e os commits usam o e-mail noreply do GitHub.

## Licenças

O MuPDF.js é AGPL-3.0, e o editor, por usá-lo, segue a mesma licença. Como o programa fica acessível pela internet, a AGPL pede que o código-fonte esteja disponível para quem o usa, o que o repositório público resolve. As demais bibliotecas têm licenças permissivas: Preact (MIT), Tesseract.js (Apache-2.0), OpenCV (Apache-2.0), pyHanko (MIT) e python-pkcs11 (MIT).

## Decisões que estavam pendentes

O Lucas aceitou as propostas abaixo ao aprovar a spec. A hospedagem só é usada no fim da etapa 1, quando a versão do Android for publicada, e ainda pode mudar até lá.

| Ponto | Decisão |
|---|---|
| Onde publicar a versão do Android | GitHub Pages, com repositório público na conta LNannini, que está no plano gratuito. A alternativa com código privado é o Cloudflare Pages, que exige criar conta lá |
| Impressão no PC | Não foi discutida. Proposta: o botão Imprimir entrega o PDF ao leitor de PDF do Edge, que imprime |
| Nome do programa | Provisório: "Editor PDF" |
| Anotações no Android | Fora por enquanto. Se forem pedidas, o código é o mesmo e só muda a tela |
