import * as mupdf from "mupdf";
import type { Bytes } from "../src/motor/tipos.ts";

export interface OpcoesFabrica {
  paginas?: number;
  prefixo?: string;
  rotacao?: 0 | 90 | 180 | 270;
  marcadores?: Array<{ titulo: string; pagina: number }>;
  recursosHerdados?: boolean;
  conteudoEmArray?: boolean;
  assinado?: boolean;
  senhaAbertura?: string;
  restringirEdicao?: boolean;
}

const fonte = { F1: { Type: "Font", Subtype: "Type1", BaseFont: "Helvetica" } };

/** Gera um PDF de teste em que cada página tem só o texto "<prefixo> <n>", com n a partir de 1. */
export function fabricarPdf(op: OpcoesFabrica = {}): Bytes {
  const { paginas = 3, prefixo = "Pagina", rotacao = 0 } = op;
  const doc = new mupdf.PDFDocument();
  for (let i = 0; i < paginas; i++) {
    const recursos = op.recursosHerdados ? {} : { Font: fonte };
    doc.insertPage(-1, doc.addPage([0, 0, 595, 842], rotacao, recursos, `BT /F1 24 Tf 72 720 Td (${prefixo} ${i + 1}) Tj ET`));
    const pagina = doc.findPage(i);
    if (op.recursosHerdados) pagina.delete("Resources");
    if (op.conteudoEmArray) {
      pagina.put("Contents", [
        doc.addStream("BT /F1 24 Tf 72 720 Td", {}),
        doc.addStream(`(${prefixo} ${i + 1}) Tj ET`, {}),
      ]);
    }
  }
  if (op.recursosHerdados) doc.getTrailer().get("Root", "Pages").put("Resources", { Font: fonte });
  if (op.marcadores?.length) {
    const iterador = doc.outlineIterator();
    for (const m of op.marcadores) {
      const uri = doc.formatLinkURI({ type: "Fit", chapter: 0, page: m.pagina, x: 0, y: 0, width: 0, height: 0, zoom: 0 });
      iterador.insert({ title: m.titulo, uri, open: true });
    }
  }
  if (op.assinado) doc.getTrailer().get("Root").put("AcroForm", { SigFlags: 3, Fields: [] });
  let opcoes = "garbage,compress";
  if (op.senhaAbertura) opcoes += `,encrypt=aes-256,user-password=${op.senhaAbertura},owner-password=dono`;
  else if (op.restringirEdicao) opcoes += ",encrypt=aes-128,owner-password=dono,permissions=4";
  const buffer = doc.saveToBuffer(opcoes);
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

export function textoDaPagina(doc: mupdf.PDFDocument, i: number): string {
  const texto = doc.loadPage(i).toStructuredText("preserve-whitespace");
  const valor = texto.asText().trim();
  texto.destroy();
  return valor;
}

export function textos(doc: mupdf.PDFDocument): string[] {
  return Array.from({ length: doc.countPages() }, (_, i) => textoDaPagina(doc, i));
}

/** Canal vermelho do pixel (x, y) da página desenhada em escala 1. 0 é preto, 255 é branco. */
export function pixel(doc: mupdf.PDFDocument, pagina: number, x: number, y: number): number {
  const pix = doc.loadPage(pagina).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
  const valor = pix.getPixels()[y * pix.getStride() + x * pix.getNumberOfComponents()];
  pix.destroy();
  return valor;
}

export function pngPreto(largura = 20, altura = 20): Uint8Array {
  const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, largura, altura], false);
  p.clear(0);
  return p.asPNG();
}

/**
 * PNG 20 x 20 com a metade esquerda preta e opaca e a metade direita transparente.
 * Atenção: clear() sem valor zera também o alfa; clear(0) pintaria tudo de preto opaco.
 */
export function pngMetadeTransparente(): Uint8Array {
  const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 20, 20], true);
  p.clear();
  const px = p.getPixels();
  const passo = p.getStride();
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 10; x++) {
      const i = y * passo + x * 4;
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = 255;
    }
  }
  return p.asPNG();
}

export function jpegCinza(largura: number, altura: number): Uint8Array {
  const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, largura, altura], false);
  p.clear(128);
  return p.asJPEG(80);
}
