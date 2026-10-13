import type { Bytes } from "../motor/tipos";
import { ErroArquivoEmUso, type ArquivoAberto, type Capacidades, type Plataforma, type Rascunho } from "./tipos";

interface OpcoesChamada {
  corpo?: Bytes;
  cabecalhos?: Record<string, string>;
  aceitar404?: boolean;
}

/** Plataforma do PC: tudo passa pelo lançador Python em 127.0.0.1, autenticado pelo segredo da sessão. */
export class PlataformaPc implements Plataforma {
  readonly capacidades: Capacidades = { abas: true, camera: false, assinaturaA3: true, salvarNoLugar: true };
  private readonly segredo: string;
  private readonly buscar: typeof fetch;

  constructor(segredo: string, buscar: typeof fetch = fetch.bind(globalThis)) {
    this.segredo = segredo;
    this.buscar = buscar;
  }

  /** Lê o segredo que o lançador embutiu na página ao servi-la. */
  static daPagina(): PlataformaPc {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="editor-segredo"]');
    if (!meta?.content) throw new Error("Esta página precisa ser aberta pelo lançador do editor.");
    return new PlataformaPc(meta.content);
  }

  private async chamar(metodo: string, caminho: string, opcoes: OpcoesChamada = {}): Promise<Response | null> {
    const resposta = await this.buscar(caminho, {
      method: metodo,
      body: opcoes.corpo,
      headers: { "X-Editor-Segredo": this.segredo, ...opcoes.cabecalhos },
    });
    if (resposta.status === 404 && opcoes.aceitar404) return null;
    if (resposta.status === 409) throw new ErroArquivoEmUso(((await resposta.json()) as { erro: string }).erro);
    if (!resposta.ok) {
      // Quando o lançador explica o erro numa frase, é ela que aparece na tela.
      const frase = await resposta
        .json()
        .then((corpo: { erro?: unknown }) => (typeof corpo.erro === "string" ? corpo.erro : undefined))
        .catch(() => undefined);
      throw new Error(frase ?? `O lançador respondeu ${resposta.status} em ${caminho}.`);
    }
    return resposta;
  }

  private async json<T>(metodo: string, caminho: string, opcoes: OpcoesChamada = {}): Promise<T> {
    return (await (await this.chamar(metodo, caminho, opcoes))!.json()) as T;
  }

  private async bytes(caminho: string, aceitar404 = false): Promise<Bytes | null> {
    const resposta = await this.chamar("GET", caminho, { aceitar404 });
    return resposta ? new Uint8Array(await resposta.arrayBuffer()) : null;
  }

  pendentes(): Promise<ArquivoAberto[]> {
    return this.json("GET", "/api/pendentes");
  }

  escolherArquivos(): Promise<ArquivoAberto[]> {
    return this.json("POST", "/api/dialogo/abrir");
  }

  async ler(id: string): Promise<Bytes> {
    return (await this.bytes(`/api/arquivo/${encodeURIComponent(id)}`))!;
  }

  async salvar(id: string, bytes: Bytes): Promise<void> {
    await this.chamar("PUT", `/api/arquivo/${encodeURIComponent(id)}`, { corpo: bytes });
  }

  async salvarComo(nomeSugerido: string, bytes: Bytes): Promise<ArquivoAberto | null> {
    const resposta = await this.chamar("POST", "/api/salvar-como", {
      corpo: bytes,
      cabecalhos: { "X-Nome-Sugerido": encodeURIComponent(nomeSugerido) },
    });
    return resposta!.status === 204 ? null : ((await resposta!.json()) as ArquivoAberto);
  }

  async escolherPasta(): Promise<string | null> {
    const resposta = await this.chamar("POST", "/api/dialogo/pasta");
    return resposta!.status === 204 ? null : ((await resposta!.json()) as { id: string }).id;
  }

  async salvarNaPasta(pasta: string, nome: string, bytes: Bytes): Promise<string> {
    const caminho = `/api/pasta/${encodeURIComponent(pasta)}/${encodeURIComponent(nome)}`;
    return (await this.json<{ nome: string }>("PUT", caminho, { corpo: bytes })).nome;
  }

  async imprimir(bytes: Bytes): Promise<void> {
    await this.chamar("POST", "/api/imprimir", { corpo: bytes });
  }

  recentes(): Promise<ArquivoAberto[]> {
    return this.json("GET", "/api/recentes");
  }

  async guardarRascunho(chave: string, nome: string, bytes: Bytes): Promise<void> {
    await this.chamar("PUT", `/api/rascunho/${encodeURIComponent(chave)}`, {
      corpo: bytes,
      cabecalhos: { "X-Nome-Arquivo": encodeURIComponent(nome) },
    });
  }

  rascunhos(): Promise<Rascunho[]> {
    return this.json("GET", "/api/rascunhos");
  }

  async lerRascunho(chave: string): Promise<Bytes> {
    return (await this.bytes(`/api/rascunho/${encodeURIComponent(chave)}`))!;
  }

  async apagarRascunho(chave: string): Promise<void> {
    await this.chamar("DELETE", `/api/rascunho/${encodeURIComponent(chave)}`);
  }

  imagemAssinatura(): Promise<Bytes | null> {
    return this.bytes("/api/assinatura-imagem", true);
  }

  async guardarImagemAssinatura(png: Bytes): Promise<void> {
    await this.chamar("PUT", "/api/assinatura-imagem", { corpo: png });
  }

  /** A janela do PC é do lançador; o título da página não aparece nela, então o lançador recebe e aplica. */
  async definirTitulo(titulo: string): Promise<void> {
    await this.chamar("POST", "/api/titulo", { corpo: new TextEncoder().encode(titulo) });
  }
}
