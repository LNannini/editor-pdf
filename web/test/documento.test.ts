import { describe, expect, it } from "vitest";
import { abrirDocumento, infoDocumento, salvarDocumento } from "../src/motor/documento";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

describe("abrirDocumento e infoDocumento", () => {
  it("abre um PDF e informa páginas e tamanhos", () => {
    const info = infoDocumento(abrirDocumento(fabricarPdf({ paginas: 3 })));
    expect(info.paginas).toBe(3);
    expect(info.tamanhos[0]).toEqual({ largura: 595, altura: 842 });
    expect(info.reparado).toBe(false);
    expect(info.restrito).toBe(false);
    expect(info.assinadoDigitalmente).toBe(false);
    expect(info.podeDesfazer).toBe(false);
    expect(info.podeRefazer).toBe(false);
  });

  it("informa largura e altura com a rotação já aplicada", () => {
    const info = infoDocumento(abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 90 })));
    expect(info.tamanhos[0]).toEqual({ largura: 842, altura: 595 });
  });

  it("recusa bytes que não são PDF", () => {
    expect(() => abrirDocumento(new TextEncoder().encode("isto nao e um pdf"))).toThrow(ErroDocumento);
  });

  it("pede senha e distingue senha errada", () => {
    const bytes = fabricarPdf({ senhaAbertura: "abc" });
    expect(() => abrirDocumento(bytes)).toThrow(ErroSenha);
    try {
      abrirDocumento(bytes, "errada");
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroSenha);
      expect((erro as ErroSenha).tentativaErrada).toBe(true);
    }
    expect(infoDocumento(abrirDocumento(bytes, "abc")).paginas).toBe(3);
  });

  it("marca como restrito o PDF que o autor travou para edição", () => {
    expect(infoDocumento(abrirDocumento(fabricarPdf({ restringirEdicao: true }))).restrito).toBe(true);
  });

  it("abre PDF danificado e avisa que reparou", () => {
    const bytes = fabricarPdf({ paginas: 3 });
    const cortado = bytes.slice(0, Math.floor(bytes.length * 0.9));
    expect(infoDocumento(abrirDocumento(cortado)).reparado).toBe(true);
  });

  it("lê os marcadores com a página de destino", () => {
    const bytes = fabricarPdf({
      paginas: 5,
      marcadores: [
        { titulo: "Peticao inicial", pagina: 0 },
        { titulo: "Procuracao", pagina: 2 },
      ],
    });
    expect(infoDocumento(abrirDocumento(bytes)).marcadores).toEqual([
      { titulo: "Peticao inicial", pagina: 0, filhos: [] },
      { titulo: "Procuracao", pagina: 2, filhos: [] },
    ]);
  });

  it("detecta assinatura digital pelo SigFlags", () => {
    expect(infoDocumento(abrirDocumento(fabricarPdf({ assinado: true }))).assinadoDigitalmente).toBe(true);
  });
});

describe("salvarDocumento", () => {
  it("gera um PDF que o PDF.js também lê", async () => {
    const salvo = salvarDocumento(abrirDocumento(fabricarPdf({ paginas: 2 })));
    expect(await lerComPdfJs(salvo)).toEqual({ paginas: 2, textos: ["Pagina 1", "Pagina 2"] });
  });

  it("devolve bytes com memória própria, fora do WebAssembly", () => {
    const salvo = salvarDocumento(abrirDocumento(fabricarPdf({ paginas: 1 })));
    expect(salvo.byteOffset).toBe(0);
    expect(salvo.buffer.byteLength).toBe(salvo.length);
  });

  it("salva de forma incremental quando o PDF tem assinatura digital", async () => {
    const original = fabricarPdf({ assinado: true });
    const doc = abrirDocumento(original);
    doc.beginOperation("girar");
    doc.findPage(0).put("Rotate", 90);
    doc.endOperation();
    const salvo = salvarDocumento(doc);
    expect(salvo.length).toBeGreaterThan(original.length);
    expect(Buffer.from(salvo.subarray(0, original.length)).equals(Buffer.from(original))).toBe(true);
    expect((await lerComPdfJs(salvo)).paginas).toBe(3);
  });
});
