import type * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { abrirDocumento, infoDocumento, salvarDocumento } from "../src/motor/documento";
import {
  cortarMargens,
  excluirPaginas,
  girarPaginas,
  inserirImagemComoPagina,
  inserirPaginaEmBranco,
  inserirPdf,
  operacao,
  reordenarPaginas,
} from "../src/motor/paginas";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf, jpegCinza, pixel, textos } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

const primeiroQuad = (doc: mupdf.PDFDocument, pagina: number, termo: string) =>
  doc.loadPage(pagina).search(termo, undefined)[0][0];

describe("operacao", () => {
  it("descarta o passo inteiro quando a alteração falha no meio", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    expect(() =>
      operacao(doc, "teste", () => {
        doc.deletePage(0);
        throw new Error("falhou");
      }),
    ).toThrow("falhou");
    expect(doc.countPages()).toBe(3);
    expect(doc.canUndo()).toBe(false);
  });
});

describe("excluirPaginas", () => {
  it("exclui, desfaz e refaz", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    excluirPaginas(doc, [1]);
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 3"]);
    doc.undo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
    doc.redo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 3"]);
  });

  it("exclui várias páginas, em qualquer ordem e com repetição, num passo só", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    excluirPaginas(doc, [0, 2, 0]);
    expect(textos(doc)).toEqual(["Pagina 2"]);
    doc.undo();
    expect(doc.countPages()).toBe(3);
  });

  it("não deixa excluir todas as páginas", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(() => excluirPaginas(doc, [0, 1])).toThrow(ErroDocumento);
    expect(doc.canUndo()).toBe(false);
  });

  it("recusa página que não existe", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(() => excluirPaginas(doc, [5])).toThrow(ErroDocumento);
  });
});

describe("girarPaginas", () => {
  it("gira só as páginas pedidas e troca largura com altura", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    girarPaginas(doc, [0], 90);
    expect(infoDocumento(doc).tamanhos).toEqual([
      { largura: 842, altura: 595 },
      { largura: 595, altura: 842 },
    ]);
  });

  it("soma à rotação que a página já tinha", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 270 }));
    girarPaginas(doc, [0], 90);
    expect(doc.findPage(0).get("Rotate").asNumber()).toBe(0);
    girarPaginas(doc, [0], -90);
    expect(doc.findPage(0).get("Rotate").asNumber()).toBe(270);
  });
});

describe("reordenarPaginas", () => {
  it("aplica a nova ordem e desfaz", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    reordenarPaginas(doc, [2, 0, 1]);
    expect(textos(doc)).toEqual(["Pagina 3", "Pagina 1", "Pagina 2"]);
    doc.undo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
  });

  it("recusa ordem que perde ou repete página", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    expect(() => reordenarPaginas(doc, [0, 0, 1])).toThrow(ErroDocumento);
    expect(() => reordenarPaginas(doc, [0, 1])).toThrow(ErroDocumento);
  });
});

describe("inserirPaginaEmBranco", () => {
  it("insere página vazia do tamanho da anterior", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2, rotacao: 90 }));
    inserirPaginaEmBranco(doc, 1);
    expect(textos(doc)).toEqual(["Pagina 1", "", "Pagina 2"]);
    expect(infoDocumento(doc).tamanhos[1]).toEqual({ largura: 842, altura: 595 });
  });

  it("insere no fim", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    inserirPaginaEmBranco(doc, 2);
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", ""]);
  });
});

describe("inserirPdf", () => {
  it("insere outro PDF no meio, e o PDF.js lê o resultado", async () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(inserirPdf(doc, 1, fabricarPdf({ paginas: 2, prefixo: "Outro" }))).toBe(2);
    const esperado = ["Pagina 1", "Outro 1", "Outro 2", "Pagina 2"];
    expect(textos(doc)).toEqual(esperado);
    expect((await lerComPdfJs(salvarDocumento(doc))).textos).toEqual(esperado);
    doc.undo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2"]);
  });

  it("insere no fim", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    inserirPdf(doc, 2, fabricarPdf({ paginas: 1, prefixo: "Outro" }));
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", "Outro 1"]);
  });

  it("pede a senha do PDF inserido sem alterar o documento", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    const protegido = fabricarPdf({ paginas: 1, senhaAbertura: "abc" });
    expect(() => inserirPdf(doc, 0, protegido)).toThrow(ErroSenha);
    expect(doc.countPages()).toBe(2);
    expect(doc.canUndo()).toBe(false);
    expect(inserirPdf(doc, 0, protegido, "abc")).toBe(1);
  });
});

describe("inserirImagemComoPagina", () => {
  it("cria página que cabe numa folha A4 em pé, mantendo a proporção", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemComoPagina(doc, 1, jpegCinza(300, 400));
    const { largura, altura } = infoDocumento(doc).tamanhos[1];
    expect(largura).toBeCloseTo(595, 0);
    expect(altura).toBeCloseTo(793.33, 0);
    expect(Math.abs(pixel(doc, 1, 300, 400) - 128)).toBeLessThan(10);
  });

  it("deita a folha quando a foto é horizontal", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemComoPagina(doc, 0, jpegCinza(400, 300));
    const { largura, altura } = infoDocumento(doc).tamanhos[0];
    expect(largura).toBeCloseTo(793.33, 0);
    expect(altura).toBeCloseTo(595, 0);
  });

  it("recusa arquivo que não é imagem sem criar passo de desfazer", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    expect(() => inserirImagemComoPagina(doc, 0, new Uint8Array([1, 2, 3, 4]))).toThrow(ErroDocumento);
    expect(doc.canUndo()).toBe(false);
  });
});

describe("cortarMargens", () => {
  it("recorta a área visível e o texto acompanha", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const antes = primeiroQuad(doc, 0, "Pagina");
    cortarMargens(doc, [0], [50, 50, 400, 500]);
    expect(infoDocumento(doc).tamanhos[0]).toEqual({ largura: 350, altura: 450 });
    const depois = primeiroQuad(doc, 0, "Pagina");
    expect(depois[0]).toBeCloseTo(antes[0] - 50, 1);
    expect(depois[1]).toBeCloseTo(antes[1] - 50, 1);
    doc.undo();
    expect(infoDocumento(doc).tamanhos[0]).toEqual({ largura: 595, altura: 842 });
  });

  it("usa as coordenadas da tela também em página girada", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 90 }));
    const antes = primeiroQuad(doc, 0, "Pagina");
    cortarMargens(doc, [0], [50, 50, 400, 300]);
    expect(infoDocumento(doc).tamanhos[0]).toEqual({ largura: 350, altura: 250 });
    const depois = primeiroQuad(doc, 0, "Pagina");
    expect(depois[0]).toBeCloseTo(antes[0] - 50, 1);
    expect(depois[1]).toBeCloseTo(antes[1] - 50, 1);
  });

  it("limita o retângulo ao tamanho de cada página", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    girarPaginas(doc, [1], 90);
    cortarMargens(doc, [0, 1], [0, 0, 700, 700]);
    expect(infoDocumento(doc).tamanhos).toEqual([
      { largura: 595, altura: 700 },
      { largura: 700, altura: 595 },
    ]);
  });

  it("recusa área pequena demais", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    expect(() => cortarMargens(doc, [0], [0, 0, 5, 5])).toThrow(ErroDocumento);
  });
});
