import { describe, expect, it } from "vitest";
import { Motor, type CanalWorker } from "../src/motor/cliente";
import type { Resposta } from "../src/motor/protocolo";
import { ServicoMotor, serializarErro } from "../src/motor/servico";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";

/** Canal que imita o worker: responde de forma assíncrona, rodando o ServicoMotor no mesmo thread. */
function canalFalso(): CanalWorker {
  const servico = new ServicoMotor();
  const canal: CanalWorker = {
    onmessage: null,
    onerror: null,
    postMessage({ id, pedido }) {
      queueMicrotask(() => {
        let resposta: Resposta;
        try {
          resposta = { id, ok: true, valor: servico.tratar(pedido).valor };
        } catch (erro) {
          resposta = { id, ok: false, erro: serializarErro(erro) };
        }
        canal.onmessage?.({ data: resposta } as MessageEvent<Resposta>);
      });
    },
  };
  return canal;
}

describe("Motor", () => {
  it("faz a ida e volta com o tipo certo de resultado", async () => {
    const motor = new Motor(canalFalso());
    const { doc, info } = await motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ paginas: 2 }) });
    expect(info.paginas).toBe(2);
    const imagem = await motor.pedir({ tipo: "renderizar", doc, pagina: 0, escala: 0.25 });
    expect(imagem.rgba.length).toBe(imagem.largura * imagem.altura * 4);
  });

  it("entrega cada resposta a quem pediu, mesmo com pedidos simultâneos", async () => {
    const motor = new Motor(canalFalso());
    const [a, b] = await Promise.all([
      motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ paginas: 1 }) }),
      motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ paginas: 4 }) }),
    ]);
    expect([a.info.paginas, b.info.paginas]).toEqual([1, 4]);
  });

  it("se o worker quebrar, os pedidos pendentes e os seguintes falham com a causa, em vez de esperar para sempre", async () => {
    const canal: CanalWorker = { onmessage: null, onerror: null, postMessage() {} };
    const motor = new Motor(canal);
    const pendente = motor.pedir({ tipo: "info", doc: "x" });
    canal.onerror?.({ message: "o arquivo .wasm não carregou" });
    await expect(pendente).rejects.toThrow("o arquivo .wasm não carregou");
    await expect(motor.pedir({ tipo: "info", doc: "y" })).rejects.toThrow("o arquivo .wasm não carregou");
  });

  it("reconstrói os erros do motor", async () => {
    const motor = new Motor(canalFalso());
    await expect(motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ senhaAbertura: "x" }) })).rejects.toBeInstanceOf(ErroSenha);
    await expect(motor.pedir({ tipo: "info", doc: "nao-existe" })).rejects.toBeInstanceOf(ErroDocumento);
  });
});
