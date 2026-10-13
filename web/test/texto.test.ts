import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { abrirDocumento } from "../src/motor/documento";
import { buscarNaPagina, selecionarTexto } from "../src/motor/texto";
import { fabricarPdf } from "./fabrica";

/** PDF de uma página com "Pagina 1 e PAGINA e Petição", em WinAnsi (ç = octal 347, ã = octal 343). */
function pdfComAcentos(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const barra = String.fromCharCode(92);
  const conteudo = `BT /F1 24 Tf 72 720 Td (Pagina 1 e PAGINA e Peti${barra}347${barra}343o) Tj ET`;
  const fonte = { F1: { Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" } };
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: fonte }, conteudo));
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}

describe("selecionarTexto", () => {
  it("devolve o texto e os retângulos do trecho arrastado", () => {
    const sel = selecionarTexto(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, [60, 100], [400, 140]);
    expect(sel.texto).toBe("Pagina 1");
    expect(sel.quads).toHaveLength(1);
    expect(sel.quads[0][0]).toBeCloseTo(72, 0);
  });

  it("seleção em área vazia não devolve nada", () => {
    expect(selecionarTexto(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, [300, 400], [350, 450])).toEqual({ quads: [], texto: "" });
  });
});

describe("buscarNaPagina", () => {
  it("ignora maiúsculas e acentos", () => {
    const doc = abrirDocumento(pdfComAcentos());
    expect(buscarNaPagina(doc, 0, "pagina")).toHaveLength(2);
    expect(buscarNaPagina(doc, 0, "peticao")).toHaveLength(1);
    expect(buscarNaPagina(doc, 0, "PETIÇÃO")).toHaveLength(1);
  });

  it("termo vazio não busca", () => {
    expect(buscarNaPagina(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, "   ")).toEqual([]);
  });
});
