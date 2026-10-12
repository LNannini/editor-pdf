import { describe, expect, it } from "vitest";
import { interpretarIntervalos } from "../src/motor/intervalos";
import { ErroDocumento } from "../src/motor/tipos";

describe("interpretarIntervalos", () => {
  it("lê intervalos e páginas soltas, um grupo por item", () => {
    expect(interpretarIntervalos("1-3, 5, 7-8", 10)).toEqual([[0, 1, 2], [4], [6, 7]]);
  });

  it("tolera espaços e aceita ponto e vírgula como separador", () => {
    expect(interpretarIntervalos(" 1 - 2 ; 4 ", 5)).toEqual([[0, 1], [3]]);
  });

  it("entende '8-' como da página 8 até o fim", () => {
    expect(interpretarIntervalos("8-", 10)).toEqual([[7, 8, 9]]);
  });

  it("recusa página fora do documento, intervalo invertido, texto vazio e lixo", () => {
    expect(() => interpretarIntervalos("1-11", 10)).toThrow(ErroDocumento);
    expect(() => interpretarIntervalos("0", 10)).toThrow(ErroDocumento);
    expect(() => interpretarIntervalos("5-2", 10)).toThrow(ErroDocumento);
    expect(() => interpretarIntervalos("  ", 10)).toThrow(ErroDocumento);
    expect(() => interpretarIntervalos("a-b", 10)).toThrow(ErroDocumento);
  });
});
