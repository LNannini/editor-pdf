import { describe, expect, it } from "vitest";
import { PlataformaPc } from "../src/plataforma/pc";
import { ErroArquivoEmUso } from "../src/plataforma/tipos";

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
}

function fetchFalso(respostas: Record<string, Response | (() => Response)>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, metodo: init.method ?? "GET", cabecalhos: (init.headers ?? {}) as Record<string, string> });
    const chave = `${init.method ?? "GET"} ${url}`;
    const resposta = respostas[chave];
    if (!resposta) return new Response("sem rota", { status: 404 });
    return typeof resposta === "function" ? resposta() : resposta;
  }) as typeof fetch;
  return { buscar, chamadas };
}

const json = (valor: unknown) => new Response(JSON.stringify(valor), { headers: { "Content-Type": "application/json" } });

describe("PlataformaPc", () => {
  it("manda o segredo em toda chamada", async () => {
    const { buscar, chamadas } = fetchFalso({ "GET /api/pendentes": json([]), "GET /api/recentes": json([]) });
    const p = new PlataformaPc("s3gr3do", buscar);
    await p.pendentes();
    await p.recentes();
    expect(chamadas).toHaveLength(2);
    expect(chamadas.every((c) => c.cabecalhos["X-Editor-Segredo"] === "s3gr3do")).toBe(true);
  });

  it("manterVivo segura a conexão e só termina quando o lançador a fecha", async () => {
    let fechar: () => void = () => undefined;
    const corpo = new ReadableStream<Uint8Array>({
      start(controle) {
        controle.enqueue(new Uint8Array([46]));
        fechar = () => controle.close();
      },
    });
    const { buscar, chamadas } = fetchFalso({ "GET /api/vivo": new Response(corpo) });
    let terminou = false;
    const vivo = new PlataformaPc("s", buscar).manterVivo().then(() => (terminou = true));
    await new Promise((r) => setTimeout(r, 50));
    expect(terminou).toBe(false);
    expect(chamadas[0].cabecalhos["X-Editor-Segredo"]).toBe("s");
    fechar();
    await vivo;
    expect(terminou).toBe(true);
  });

  it("lê bytes de um arquivo pelo id, codificando o id", async () => {
    const { buscar, chamadas } = fetchFalso({ "GET /api/arquivo/a%2Fb": new Response(new Uint8Array([37, 80])) });
    expect(Array.from(await new PlataformaPc("s", buscar).ler("a/b"))).toEqual([37, 80]);
    expect(chamadas[0].url).toBe("/api/arquivo/a%2Fb");
  });

  it("transforma o 409 do lançador em ErroArquivoEmUso com a mensagem dele", async () => {
    const { buscar } = fetchFalso({
      "PUT /api/arquivo/x": () => new Response(JSON.stringify({ erro: "Petição.pdf está aberto" }), { status: 409 }),
    });
    const promessa = new PlataformaPc("s", buscar).salvar("x", new Uint8Array([1]));
    await expect(promessa).rejects.toBeInstanceOf(ErroArquivoEmUso);
    await expect(new PlataformaPc("s", buscar).salvar("x", new Uint8Array([1]))).rejects.toThrow("Petição.pdf está aberto");
  });

  it("salvar como manda o nome sugerido codificado e entende o cancelamento", async () => {
    const { buscar, chamadas } = fetchFalso({ "POST /api/salvar-como": new Response(null, { status: 204 }) });
    expect(await new PlataformaPc("s", buscar).salvarComo("Petição (cópia)", new Uint8Array([1]))).toBeNull();
    expect(chamadas[0].cabecalhos["X-Nome-Sugerido"]).toBe(encodeURIComponent("Petição (cópia)"));
  });

  it("imagem de assinatura ausente vira null", async () => {
    const { buscar } = fetchFalso({});
    expect(await new PlataformaPc("s", buscar).imagemAssinatura()).toBeNull();
  });

  it("outros erros do lançador viram Error com a rota", async () => {
    const { buscar } = fetchFalso({});
    await expect(new PlataformaPc("s", buscar).recentes()).rejects.toThrow("/api/recentes");
  });
});
