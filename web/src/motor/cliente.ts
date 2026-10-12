import type { Envelope, ErroSerializado, Pedido, Resposta, Resultados } from "./protocolo";
import { ErroDocumento, ErroSenha } from "./tipos";

/** O que o Motor precisa de um Worker. Nos testes, um objeto falso cumpre o mesmo papel. */
export interface CanalWorker {
  onmessage: ((evento: MessageEvent<Resposta>) => void) | null;
  onerror: ((evento: { message?: string }) => void) | null;
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
  private quebrado: Error | null = null;

  constructor(canal: CanalWorker) {
    this.canal = canal;
    canal.onmessage = ({ data }) => {
      const pendente = this.pendentes.get(data.id);
      if (!pendente) return;
      this.pendentes.delete(data.id);
      if (data.ok) pendente.resolver(data.valor);
      else pendente.rejeitar(desserializarErro(data.erro));
    };
    // Se o worker não carregar (por exemplo, o .wasm faltou), nenhuma resposta virá: falha tudo com a causa.
    canal.onerror = (evento) => {
      this.quebrado = new Error(`O motor de PDF parou: ${evento.message ?? "erro desconhecido"}.`);
      for (const pendente of this.pendentes.values()) pendente.rejeitar(this.quebrado);
      this.pendentes.clear();
    };
  }

  static criar(): Motor {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    return new Motor(worker as unknown as CanalWorker);
  }

  pedir<P extends Pedido>(pedido: P, transferir: Transferable[] = []): Promise<Resultados[P["tipo"]]> {
    if (this.quebrado) return Promise.reject(this.quebrado);
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
