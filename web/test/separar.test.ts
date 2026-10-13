import { describe, expect, it } from "vitest";
import { abrirDocumento, infoDocumento } from "../src/motor/documento";
import { gruposPorMarcadores } from "../src/motor/grupos";
import { extrairPaginas, juntarArquivos, separarEmArquivos } from "../src/motor/separar";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

describe("extrairPaginas", () => {
  it("copia as páginas na ordem pedida sem mexer na origem", async () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    expect(await lerComPdfJs(extrairPaginas(doc, [2, 0]))).toEqual({ paginas: 2, textos: ["Pagina 3", "Pagina 1"] });
    expect(doc.countPages()).toBe(3);
    expect(doc.canUndo()).toBe(false);
  });

  it("recusa lista vazia ou página inexistente", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(() => extrairPaginas(doc, [])).toThrow(ErroDocumento);
    expect(() => extrairPaginas(doc, [2])).toThrow(ErroDocumento);
  });
});

describe("separarEmArquivos", () => {
  it("gera um PDF por marcador dos autos", async () => {
    const doc = abrirDocumento(
      fabricarPdf({ paginas: 4, marcadores: [{ titulo: "Peticao", pagina: 0 }, { titulo: "Procuracao", pagina: 3 }] }),
    );
    const partes = separarEmArquivos(doc, gruposPorMarcadores(infoDocumento(doc).marcadores, 4));
    expect(partes.map((p) => p.rotulo)).toEqual(["Peticao", "Procuracao"]);
    expect((await lerComPdfJs(partes[0].bytes)).textos).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
    expect((await lerComPdfJs(partes[1].bytes)).textos).toEqual(["Pagina 4"]);
  });
});

describe("juntarArquivos", () => {
  it("junta na ordem da lista", async () => {
    const junto = juntarArquivos([
      { bytes: fabricarPdf({ paginas: 2, prefixo: "A" }) },
      { bytes: fabricarPdf({ paginas: 1, prefixo: "B" }) },
    ]);
    expect((await lerComPdfJs(junto)).textos).toEqual(["A 1", "A 2", "B 1"]);
  });

  it("diz qual arquivo da lista pede senha", () => {
    try {
      juntarArquivos([{ bytes: fabricarPdf({ paginas: 1 }) }, { bytes: fabricarPdf({ paginas: 1, senhaAbertura: "x" }) }]);
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroSenha);
      expect((erro as ErroSenha).arquivo).toBe(1);
    }
  });

  it("aceita a senha de cada arquivo", async () => {
    const junto = juntarArquivos([
      { bytes: fabricarPdf({ paginas: 1, prefixo: "A" }) },
      { bytes: fabricarPdf({ paginas: 1, prefixo: "B", senhaAbertura: "x" }), senha: "x" },
    ]);
    expect((await lerComPdfJs(junto)).textos).toEqual(["A 1", "B 1"]);
  });

  it("diz qual arquivo da lista não é PDF", () => {
    expect(() => juntarArquivos([{ bytes: fabricarPdf({ paginas: 1 }) }, { bytes: new TextEncoder().encode("lixo") }])).toThrow(
      "Arquivo 2 da lista",
    );
  });

  it("pede pelo menos dois arquivos", () => {
    expect(() => juntarArquivos([{ bytes: fabricarPdf({ paginas: 1 }) }])).toThrow(ErroDocumento);
  });
});
