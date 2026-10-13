import type { Bytes } from "../motor/tipos";

export interface ArquivoAberto {
  id: string;
  nome: string;
  pasta: string;
}

export interface Rascunho {
  chave: string;
  nome: string;
  modificado: string;
}

export interface Capacidades {
  abas: boolean;
  camera: boolean;
  assinaturaA3: boolean;
  salvarNoLugar: boolean;
}

/** O que muda entre PC e Android fica aqui. O resto do editor só conversa com esta interface. */
export interface Plataforma {
  readonly capacidades: Capacidades;
  pendentes(): Promise<ArquivoAberto[]>;
  escolherArquivos(): Promise<ArquivoAberto[]>;
  ler(id: string): Promise<Bytes>;
  salvar(id: string, bytes: Bytes): Promise<void>;
  salvarComo(nomeSugerido: string, bytes: Bytes): Promise<ArquivoAberto | null>;
  escolherPasta(): Promise<string | null>;
  salvarNaPasta(pasta: string, nome: string, bytes: Bytes): Promise<string>;
  imprimir(bytes: Bytes): Promise<void>;
  recentes(): Promise<ArquivoAberto[]>;
  guardarRascunho(chave: string, nome: string, bytes: Bytes): Promise<void>;
  rascunhos(): Promise<Rascunho[]>;
  lerRascunho(chave: string): Promise<Bytes>;
  apagarRascunho(chave: string): Promise<void>;
  imagemAssinatura(): Promise<Bytes | null>;
  guardarImagemAssinatura(png: Bytes): Promise<void>;
  /** Põe o título na janela do programa (no PC, a janela do lançador; no Android, a aba). */
  definirTitulo(titulo: string): Promise<void>;
}

export class ErroArquivoEmUso extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroArquivoEmUso";
  }
}
