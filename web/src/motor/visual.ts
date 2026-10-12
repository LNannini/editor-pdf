import * as mupdf from "mupdf";
import { ErroDocumento, type Bytes, type ImagemRgba, type Retangulo } from "./tipos";

function conferirPagina(doc: mupdf.PDFDocument, pagina: number): void {
  if (!Number.isInteger(pagina) || pagina < 0 || pagina >= doc.countPages()) {
    throw new ErroDocumento(`A página ${pagina + 1} não existe neste documento.`);
  }
}

/** Desenha a página na escala pedida (1 equivale a 72 pontos por polegada) e devolve pixels RGBA prontos para um ImageData. */
export function renderizarPagina(doc: mupdf.PDFDocument, pagina: number, escala: number): ImagemRgba {
  conferirPagina(doc, pagina);
  const pix = doc.loadPage(pagina).toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true);
  try {
    const largura = pix.getWidth();
    const altura = pix.getHeight();
    const passo = pix.getStride();
    const n = pix.getNumberOfComponents();
    const origem = pix.getPixels();
    const rgba = new Uint8ClampedArray(largura * altura * 4);
    for (let y = 0; y < altura; y++) {
      let o = y * passo;
      let d = y * largura * 4;
      for (let x = 0; x < largura; x++, o += n, d += 4) {
        rgba[d] = origem[o];
        rgba[d + 1] = origem[o + 1];
        rgba[d + 2] = origem[o + 2];
        rgba[d + 3] = 255;
      }
    }
    return { largura, altura, rgba };
  } finally {
    pix.destroy();
  }
}

/** Copia uma área da página como PNG, em resolução dobrada por padrão, para ficar nítida quando colada. */
export function copiarArea(doc: mupdf.PDFDocument, pagina: number, retangulo: Retangulo, escala = 2): Bytes {
  conferirPagina(doc, pagina);
  const [x0, y0, x1, y1] = retangulo;
  if (x1 - x0 < 1 || y1 - y0 < 1) throw new ErroDocumento("Selecione uma área maior.");
  const caixa: Retangulo = [Math.floor(x0 * escala), Math.floor(y0 * escala), Math.ceil(x1 * escala), Math.ceil(y1 * escala)];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, caixa, false);
  pix.clear(255);
  const dispositivo = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  try {
    doc.loadPage(pagina).run(dispositivo, mupdf.Matrix.scale(escala, escala));
    dispositivo.close();
    return new Uint8Array(pix.asPNG());
  } finally {
    dispositivo.destroy();
    pix.destroy();
  }
}
