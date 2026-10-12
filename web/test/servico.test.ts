import { describe, expect, it } from "vitest";
import type { Resultados } from "../src/motor/protocolo";
import { ServicoMotor, serializarErro } from "../src/motor/servico";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

function abrir(servico: ServicoMotor, paginas = 3) {
  return servico.tratar({ tipo: "abrir", bytes: fabricarPdf({ paginas }) }).valor as Resultados["abrir"];
}

describe("ServicoMotor", () => {
  it("abre, informa e fecha documentos por id", () => {
    const servico = new ServicoMotor();
    const { doc, info } = abrir(servico);
    expect(info.paginas).toBe(3);
    expect((servico.tratar({ tipo: "info", doc }).valor as Resultados["info"]).paginas).toBe(3);
    servico.tratar({ tipo: "fechar", doc });
    expect(() => servico.tratar({ tipo: "info", doc })).toThrow(ErroDocumento);
  });

  it("marca para transferência os pixels desenhados", () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico);
    const { valor, transferir } = servico.tratar({ tipo: "renderizar", doc, pagina: 0, escala: 0.25 });
    expect(transferir).toEqual([(valor as Resultados["renderizar"]).rgba.buffer]);
  });

  it("alterações devolvem a informação atualizada, e desfazer volta atrás", () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico);
    const depois = servico.tratar({ tipo: "excluir", doc, paginas: [0] }).valor as Resultados["excluir"];
    expect(depois.paginas).toBe(2);
    expect(depois.podeDesfazer).toBe(true);
    const desfeito = servico.tratar({ tipo: "desfazer", doc }).valor as Resultados["desfazer"];
    expect(desfeito.paginas).toBe(3);
    expect(desfeito.podeRefazer).toBe(true);
  });

  it("separa em vários arquivos e transfere todos", async () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico, 4);
    const { valor, transferir } = servico.tratar({
      tipo: "separar",
      doc,
      grupos: [
        { rotulo: "a", paginas: [0, 1] },
        { rotulo: "b", paginas: [2, 3] },
      ],
    });
    const partes = valor as Resultados["separar"];
    expect(transferir).toHaveLength(2);
    expect((await lerComPdfJs(partes[1].bytes)).textos).toEqual(["Pagina 3", "Pagina 4"]);
  });

  it("salva bytes que o PDF.js lê", async () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico, 2);
    servico.tratar({ tipo: "girar", doc, paginas: [0], graus: 90 });
    const salvo = servico.tratar({ tipo: "salvar", doc }).valor as Resultados["salvar"];
    expect((await lerComPdfJs(salvo)).paginas).toBe(2);
  });
});

describe("serializarErro", () => {
  it("preserva o tipo de erro para atravessar o worker", () => {
    expect(serializarErro(new ErroSenha(true, 2))).toEqual({ tipo: "senha", tentativaErrada: true, arquivo: 2 });
    expect(serializarErro(new ErroDocumento("ruim"))).toEqual({ tipo: "documento", mensagem: "ruim" });
    expect(serializarErro(new Error("x"))).toEqual({ tipo: "interno", mensagem: "x" });
    expect(serializarErro("texto")).toEqual({ tipo: "interno", mensagem: "texto" });
  });
});
