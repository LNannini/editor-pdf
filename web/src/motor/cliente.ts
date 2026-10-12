import type { Envelope, ErroSerializado, Pedido, Resposta, Resultados } from "./protocolo";
import { ErroDocumento, ErroSenha } from "./tipos";

/** O que o Motor precisa de um Worker. Nos testes, um objeto falso cumpre o mesmo papel. */
export interface CanalWorker {
  onmessage: ((evento: MessageEvent<Resposta>) => void) | null;
  postMessage(envelope: Envelope, transferir: Transferable[]): void;
}

interface Pendente {
  resolver: (valor: unknown) => void;
  rejeitar: (erro: Error) => void;
}

/** Lado da interface: manda pedidos ao worker e devolve promessas com o resultado já tipado. */
export class Motor {
  private readonly canal: CanalWorker;
  private readonly pendentes = new Map<number, Pendente>();
  private proximo = 1;

  constructor(canal: CanalWorker) {
    this.canal = canal;
    canal.onmessage = ({ data }) => {
      const pendente = this.pendentes.get(data.id);
      if (!pendente) return;
      this.pendentes.delete(data.id);
      if (data.ok) pendente.resolver(data.valor);
      else pendente.rejeitar(desserializarErro(data.erro));
    };
  }

  static criar(): Motor {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    return new Motor(worker as unknown as CanalWorker);
  }

  pedir<P extends Pedido>(pedido: P, transferir: Transferable[] = []): Promise<Resultados[P["tipo"]]> {
    const id = this.proximo++;
    return new Promise((resolver, rejeitar) => {
      this.pendentes.set(id, { resolver: resolver as (valor: unknown) => void, rejeitar });
      this.canal.postMessage({ id, pedido }, transferir);
    });
  }
}

export function desserializarErro(erro: ErroSerializado): Error {
  switch (erro.tipo) {
    case "senha":
      return new ErroSenha(erro.tentativaErrada, erro.arquivo);
    case "documento":
      return new ErroDocumento(erro.mensagem);
    case "interno":
      return new Error(erro.mensagem);
  }
}
