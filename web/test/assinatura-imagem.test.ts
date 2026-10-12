import { describe, expect, it } from "vitest";
import { inserirImagemNoConteudo } from "../src/motor/assinatura-imagem";
import { abrirDocumento, salvarDocumento } from "../src/motor/documento";
import { ErroDocumento } from "../src/motor/tipos";
import { fabricarPdf, pixel, pngMetadeTransparente, pngPreto, textoDaPagina } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

describe("inserirImagemNoConteudo", () => {
  it("põe a imagem no retângulo da tela, mantém o texto e desfaz", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(pixel(doc, 0, 300, 400)).toBeGreaterThan(200);
    expect(textoDaPagina(doc, 0)).toBe("Pagina 1");
    doc.undo();
    expect(pixel(doc, 0, 150, 125)).toBeGreaterThan(200);
  });

  it("acerta o lugar em página girada 90 graus", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 90 }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(pixel(doc, 0, 105, 300)).toBeGreaterThan(200);
  });

  it("respeita a transparência e a orientação em página girada 270 graus", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 270 }));
    inserirImagemNoConteudo(doc, 0, pngMetadeTransparente(), [100, 100, 300, 200]);
    expect(pixel(doc, 0, 120, 150)).toBeLessThan(50);
    expect(pixel(doc, 0, 280, 150)).toBeGreaterThan(200);
  });

  it("funciona com recursos herdados do nó pai sem apagar o texto", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2, recursosHerdados: true }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(textoDaPagina(doc, 0)).toBe("Pagina 1");
    expect(textoDaPagina(doc, 1)).toBe("Pagina 2");
    expect(doc.findPage(1).get("Resources").isNull()).toBe(true);
  });

  it("funciona com conteúdo dividido em vários fluxos", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, conteudoEmArray: true }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(textoDaPagina(doc, 0)).toBe("Pagina 1");
  });

  it("aceita duas assinaturas na mesma página e o PDF.js lê o resultado", async () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    inserirImagemNoConteudo(doc, 0, pngPreto(), [300, 300, 350, 350]);
    const reaberto = abrirDocumento(salvarDocumento(doc));
    expect(pixel(reaberto, 0, 150, 125)).toBeLessThan(50);
    expect(pixel(reaberto, 0, 325, 325)).toBeLessThan(50);
    expect((await lerComPdfJs(salvarDocumento(doc))).textos).toEqual(["Pagina 1"]);
  });

  it("recusa imagem ilegível ou retângulo fora da página sem criar passo de desfazer", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    expect(() => inserirImagemNoConteudo(doc, 0, new Uint8Array([1, 2, 3]), [100, 100, 200, 150])).toThrow(ErroDocumento);
    expect(() => inserirImagemNoConteudo(doc, 0, pngPreto(), [500, 800, 700, 900])).toThrow(ErroDocumento);
    expect(doc.canUndo()).toBe(false);
  });
});
