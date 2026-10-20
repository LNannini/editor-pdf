import type * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { inserirImagemNoConteudo } from "../src/motor/assinatura-imagem";
import { abrirDocumento } from "../src/motor/documento";
import { cortarMargens, girarPaginas, inserirImagemComoPagina } from "../src/motor/paginas";
import { buscarNaPagina, selecionarTexto } from "../src/motor/texto";
import { copiarArea, renderizarPagina } from "../src/motor/visual";
import { fabricarPdf, pngPreto } from "./fabrica";

/** Anota cada página que o motor carrega deste documento, para conferir depois se ela foi liberada. */
function vigiarPaginas(doc: mupdf.PDFDocument): mupdf.PDFPage[] {
  const carregadas: mupdf.PDFPage[] = [];
  const original = doc.loadPage.bind(doc);
  doc.loadPage = (indice: number) => {
    const pagina = original(indice);
    carregadas.push(pagina);
    return pagina;
  };
  return carregadas;
}

/** Anota cada imagem que o motor grava neste documento, para conferir depois se ela foi liberada. */
function vigiarImagens(doc: mupdf.PDFDocument): mupdf.Image[] {
  const gravadas: mupdf.Image[] = [];
  const original = doc.addImage.bind(doc);
  doc.addImage = (imagem: mupdf.Image) => {
    gravadas.push(imagem);
    return original(imagem);
  };
  return gravadas;
}

/** Userdata.destroy() zera o ponteiro; objeto com ponteiro diferente de zero continua preso na memória do WebAssembly. */
const presas = (objetos: Array<mupdf.PDFPage | mupdf.Image>) => objetos.filter((o) => o.pointer !== 0).length;

describe("o motor libera as páginas que carrega", () => {
  it("ao desenhar e ao copiar área", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const carregadas = vigiarPaginas(doc);
    renderizarPagina(doc, 0, 0.25);
    copiarArea(doc, 0, [60, 90, 200, 135]);
    expect(carregadas.length).toBe(2);
    expect(presas(carregadas)).toBe(0);
  });

  it("ao selecionar e buscar texto", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const carregadas = vigiarPaginas(doc);
    selecionarTexto(doc, 0, [60, 100], [400, 140]);
    buscarNaPagina(doc, 0, "Pagina");
    expect(carregadas.length).toBe(2);
    expect(presas(carregadas)).toBe(0);
  });

  it("ao gravar a assinatura por imagem", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const carregadas = vigiarPaginas(doc);
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(presas(carregadas)).toBe(0);
  });

  it("também quando o corte falha no meio", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    girarPaginas(doc, [1], 90); // a segunda página fica deitada, com 595 de altura
    const carregadas = vigiarPaginas(doc);
    // a faixa de 830 a 842 cabe na primeira página e fica fora da segunda
    expect(() => cortarMargens(doc, [0, 1], [0, 830, 595, 842])).toThrow();
    expect(carregadas.length).toBe(2);
    expect(presas(carregadas)).toBe(0);
  });
});

describe("o motor libera as imagens que lê", () => {
  it("ao inserir foto como página", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const gravadas = vigiarImagens(doc);
    inserirImagemComoPagina(doc, 1, pngPreto());
    expect(gravadas.length).toBe(1);
    expect(presas(gravadas)).toBe(0);
  });

  it("também quando a inserção falha no meio", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const gravadas = vigiarImagens(doc);
    // a falha vem depois de addImage, com a imagem já criada e gravada no documento
    doc.insertPage = () => {
      throw new Error("falha simulada");
    };
    expect(() => inserirImagemComoPagina(doc, 1, pngPreto())).toThrow("falha simulada");
    expect(gravadas.length).toBe(1);
    expect(presas(gravadas)).toBe(0);
  });
});
