// Ponto de entrada do Web Worker do motor. Só faz a ponte entre mensagens e o ServicoMotor.
import type { Envelope, ErroSerializado, Resposta } from "./protocolo";

// O MuPDF.js procura o .wasm ao lado do próprio arquivo, mas depois do build do Vite esse caminho muda.
// O pacote só exporta o ponto de entrada principal, então o .wasm é apontado por caminho relativo, que o
// Vite reconhece e copia para o build. A configuração precisa existir antes de a biblioteca ser carregada.
const urlWasm = new URL("../../node_modules/mupdf/dist/mupdf-wasm.wasm", import.meta.url).href;
(globalThis as unknown as Record<string, unknown>)["$libmupdf_wasm_Module"] = { locateFile: () => urlWasm };

interface EscopoWorker {
  onmessage: ((evento: MessageEvent<Envelope>) => void) | null;
  postMessage(resposta: Resposta, transferir?: Transferable[]): void;
}

const escopo = self as unknown as EscopoWorker;
const pronto = import("./servico").then((m) => ({ servico: new m.ServicoMotor(), serializarErro: m.serializarErro }));

escopo.onmessage = async ({ data: { id, pedido } }) => {
  try {
    const { servico } = await pronto;
    const { valor, transferir } = servico.tratar(pedido);
    escopo.postMessage({ id, ok: true, valor }, transferir);
  } catch (erro) {
    // Se o próprio motor não carregou, não há serializarErro; a resposta ainda precisa sair, senão a página espera para sempre.
    let serializado: ErroSerializado;
    try {
      serializado = (await pronto).serializarErro(erro);
    } catch {
      serializado = { tipo: "interno", mensagem: `O motor de PDF não carregou: ${erro instanceof Error ? erro.message : String(erro)}` };
    }
    escopo.postMessage({ id, ok: false, erro: serializado });
  }
};
