import { describe, expect, it } from "vitest";
import { gruposACada, gruposDeIntervalos, gruposPorMarcadores, type Grupo } from "../src/motor/grupos";
import { ErroDocumento, type Marcador } from "../src/motor/tipos";

const m = (titulo: string, pagina: number | null, filhos: Marcador[] = []): Marcador => ({ titulo, pagina, filhos });

/** Cada página do documento aparece em exatamente um grupo, em ordem. */
function cobreTudo(grupos: Grupo[], total: number): void {
  expect(grupos.flatMap((g) => g.paginas)).toEqual(Array.from({ length: total }, (_, i) => i));
}

describe("gruposACada", () => {
  it("separa de N em N e rotula com números da tela", () => {
    const grupos = gruposACada(7, 3);
    expect(grupos.map((g) => g.rotulo)).toEqual(["páginas 1-3", "páginas 4-6", "página 7"]);
    cobreTudo(grupos, 7);
  });

  it("recusa N inválido", () => {
    expect(() => gruposACada(7, 0)).toThrow(ErroDocumento);
  });
});

describe("gruposDeIntervalos", () => {
  it("rotula intervalos contínuos e soltos", () => {
    expect(gruposDeIntervalos([[0, 1, 2], [4], [6, 9]]).map((g) => g.rotulo)).toEqual([
      "páginas 1-3",
      "página 5",
      "páginas 7, 10",
    ]);
  });
});

describe("gruposPorMarcadores", () => {
  it("um arquivo por marcador, do início dele até antes do próximo", () => {
    const grupos = gruposPorMarcadores([m("Peticao", 0), m("Procuracao", 2), m("Documentos", 3)], 5);
    expect(grupos).toEqual([
      { rotulo: "Peticao", paginas: [0, 1] },
      { rotulo: "Procuracao", paginas: [2] },
      { rotulo: "Documentos", paginas: [3, 4] },
    ]);
  });

  it("cria o grupo Início quando o primeiro marcador não está na página 1", () => {
    const grupos = gruposPorMarcadores([m("Contestacao", 3)], 6);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Início", "Contestacao"]);
    cobreTudo(grupos, 6);
  });

  it("ordena marcadores fora de ordem e fica com o primeiro de cada página", () => {
    const grupos = gruposPorMarcadores([m("C", 4), m("A", 0), m("B", 2), m("B repetido", 2)], 6);
    expect(grupos.map((g) => g.rotulo)).toEqual(["A", "B", "C"]);
    cobreTudo(grupos, 6);
  });

  it("ignora marcador sem destino ou fora do documento e usa só o primeiro nível", () => {
    const grupos = gruposPorMarcadores(
      [m("Volume 1", 0, [m("Doc interno", 1)]), m("Sem destino", null), m("Fora", 99), m("Volume 2", 3)],
      5,
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["Volume 1", "Volume 2"]);
    cobreTudo(grupos, 5);
  });

  it("usa o número da página como nome quando o marcador não tem título", () => {
    expect(gruposPorMarcadores([m("  ", 0)], 2)[0].rotulo).toBe("Página 1");
  });

  it("recusa PDF sem marcadores com destino", () => {
    expect(() => gruposPorMarcadores([m("Sem destino", null)], 3)).toThrow(ErroDocumento);
  });
});
