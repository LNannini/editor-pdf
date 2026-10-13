import * as mupdf from "mupdf";
import { abrirDocumento } from "./documento";
import { ErroDocumento, type Retangulo } from "./tipos";

const A4_CURTO = 595;
const A4_LONGO = 842;
const numero = (v: number) => String(Number(v.toFixed(4)));

/** Executa uma alteração como um passo do desfazer. Se der erro no meio, o MuPDF descarta o passo inteiro. */
export function operacao<T>(doc: mupdf.PDFDocument, nome: string, alterar: () => T): T {
  doc.beginOperation(nome);
  try {
    const resultado = alterar();
    doc.endOperation();
    return resultado;
  } catch (erro) {
    doc.abandonOperation();
    throw erro;
  }
}

function conferirPaginas(doc: mupdf.PDFDocument, paginas: number[]): number[] {
  const total = doc.countPages();
  const unicas = [...new Set(paginas)];
  if (unicas.length === 0) throw new ErroDocumento("Nenhuma página selecionada.");
  for (const p of unicas) {
    if (!Number.isInteger(p) || p < 0 || p >= total) throw new ErroDocumento(`A página ${p + 1} não existe neste documento.`);
  }
  return unicas;
}

/** Converte a posição de inserção (0 a total) no índice que o MuPDF espera; -1 significa "no fim". */
function conferirPosicao(doc: mupdf.PDFDocument, posicao: number): number {
  const total = doc.countPages();
  if (!Number.isInteger(posicao) || posicao < 0 || posicao > total) throw new ErroDocumento("Posição inválida para inserir.");
  return posicao === total ? -1 : posicao;
}

export function excluirPaginas(doc: mupdf.PDFDocument, paginas: number[]): void {
  const unicas = conferirPaginas(doc, paginas);
  if (unicas.length >= doc.countPages()) {
    throw new ErroDocumento("Não dá para excluir todas as páginas. O PDF precisa ficar com pelo menos uma.");
  }
  operacao(doc, "Excluir páginas", () => {
    for (const p of unicas.sort((a, b) => b - a)) doc.deletePage(p);
  });
}

export function girarPaginas(doc: mupdf.PDFDocument, paginas: number[], graus: 90 | -90 | 180): void {
  const unicas = conferirPaginas(doc, paginas);
  operacao(doc, "Girar páginas", () => {
    for (const p of unicas) {
      const objeto = doc.findPage(p);
      const atual = objeto.getInheritable("Rotate");
      const valor = atual.isNumber() ? atual.asNumber() : 0;
      objeto.put("Rotate", (((valor + graus) % 360) + 360) % 360);
    }
  });
}

export function reordenarPaginas(doc: mupdf.PDFDocument, novaOrdem: number[]): void {
  const total = doc.countPages();
  const conferida = [...novaOrdem].sort((a, b) => a - b);
  if (novaOrdem.length !== total || conferida.some((v, i) => v !== i)) {
    throw new ErroDocumento("A nova ordem precisa ter cada página exatamente uma vez.");
  }
  operacao(doc, "Reordenar páginas", () => doc.rearrangePages(novaOrdem));
}

/** Insere uma página vazia do tamanho da página anterior (ou da primeira, se a inserção for no início). */
export function inserirPaginaEmBranco(doc: mupdf.PDFDocument, posicao: number): void {
  const destino = conferirPosicao(doc, posicao);
  const vizinha = doc.loadPage(posicao > 0 ? posicao - 1 : 0);
  const [x0, y0, x1, y1] = vizinha.getBounds();
  vizinha.destroy();
  operacao(doc, "Inserir página em branco", () => {
    doc.insertPage(destino, doc.addPage([0, 0, x1 - x0, y1 - y0], 0, {}, ""));
  });
}

/** Insere todas as páginas de outro PDF a partir da posição indicada. Devolve quantas páginas entraram. */
export function inserirPdf(doc: mupdf.PDFDocument, posicao: number, bytes: Uint8Array, senha?: string): number {
  const destino = conferirPosicao(doc, posicao);
  const outro = abrirDocumento(bytes, senha);
  try {
    const quantas = outro.countPages();
    const mapa = doc.newGraftMap();
    operacao(doc, "Inserir PDF", () => {
      for (let i = 0; i < quantas; i++) mapa.graftPage(destino === -1 ? -1 : destino + i, outro, i);
    });
    mapa.destroy();
    return quantas;
  } finally {
    outro.destroy();
  }
}

/** Cria uma página com a imagem, no tamanho de uma folha A4 (em pé ou deitada, conforme a foto), mantendo a proporção. */
export function inserirImagemComoPagina(doc: mupdf.PDFDocument, posicao: number, bytes: Uint8Array): void {
  const destino = conferirPosicao(doc, posicao);
  let imagem: mupdf.Image;
  try {
    imagem = new mupdf.Image(bytes);
  } catch {
    throw new ErroDocumento("A imagem não pôde ser lida. Use um arquivo JPG ou PNG.");
  }
  const largura = imagem.getWidth();
  const altura = imagem.getHeight();
  const escala =
    altura >= largura
      ? Math.min(A4_CURTO / largura, A4_LONGO / altura)
      : Math.min(A4_LONGO / largura, A4_CURTO / altura);
  const w = largura * escala;
  const h = altura * escala;
  operacao(doc, "Inserir imagem como página", () => {
    const ref = doc.addImage(imagem);
    const pagina = doc.addPage([0, 0, w, h], 0, { XObject: { Im0: ref } }, `q ${numero(w)} 0 0 ${numero(h)} 0 0 cm /Im0 Do Q`);
    doc.insertPage(destino, pagina);
  });
}

/**
 * Recorta a área visível das páginas (CropBox). O retângulo vem nas coordenadas da tela e é limitado ao
 * tamanho de cada página. O conteúdo de fora continua dentro do arquivo, só fica escondido.
 */
export function cortarMargens(doc: mupdf.PDFDocument, paginas: number[], retangulo: Retangulo): void {
  const unicas = conferirPaginas(doc, paginas);
  const [x0, y0, x1, y1] = retangulo;
  if (x1 - x0 < 10 || y1 - y0 < 10) throw new ErroDocumento("A área de corte é pequena demais.");
  operacao(doc, "Cortar margens", () => {
    for (const p of unicas) {
      const pagina = doc.loadPage(p);
      try {
        const [bx0, by0, bx1, by1] = pagina.getBounds();
        const limitado: Retangulo = [Math.max(bx0, x0), Math.max(by0, y0), Math.min(bx1, x1), Math.min(by1, y1)];
        if (limitado[2] - limitado[0] < 10 || limitado[3] - limitado[1] < 10) {
          throw new ErroDocumento(`A área de corte fica fora da página ${p + 1}.`);
        }
        pagina.setPageBox("CropBox", limitado);
      } finally {
        pagina.destroy();
      }
    }
  });
}
