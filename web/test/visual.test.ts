import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { abrirDocumento } from "../src/motor/documento";
import { ErroDocumento } from "../src/motor/tipos";
import { copiarArea, renderizarPagina } from "../src/motor/visual";
import { fabricarPdf } from "./fabrica";

function escuros(png: Uint8Array): number {
  const pix = new mupdf.Image(png).toPixmap();
  const px = pix.getPixels();
  const n = pix.getNumberOfComponents();
  let conta = 0;
  for (let y = 0; y < pix.getHeight(); y++) {
    for (let x = 0; x < pix.getWidth(); x++) if (px[y * pix.getStride() + x * n] < 100) conta++;
  }
  return conta;
}

describe("renderizarPagina", () => {
  it("devolve RGBA opaco do tamanho da página na escala pedida", () => {
    const img = renderizarPagina(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, 0.5);
    expect(Math.abs(img.largura - 297.5)).toBeLessThanOrEqual(1);
    expect(Math.abs(img.altura - 421)).toBeLessThanOrEqual(1);
    expect(img.rgba.length).toBe(img.largura * img.altura * 4);
    expect(img.rgba[0]).toBe(255);
    expect(img.rgba[3]).toBe(255);
    expect(img.rgba.buffer.byteLength).toBe(img.rgba.length);
  });

  it("desenha o texto: há pixels escuros na linha do texto", () => {
    const img = renderizarPagina(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, 1);
    let achou = false;
    for (let x = 72; x < 160 && !achou; x++) achou = img.rgba[(115 * img.largura + x) * 4] < 100;
    expect(achou).toBe(true);
  });

  it("recusa página inexistente", () => {
    expect(() => renderizarPagina(abrirDocumento(fabricarPdf({ paginas: 1 })), 3, 1)).toThrow(ErroDocumento);
  });
});

describe("copiarArea", () => {
  it("gera PNG da área em resolução dobrada, com o texto", () => {
    const png = copiarArea(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, [60, 90, 200, 135]);
    expect(Array.from(png.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(new mupdf.Image(png).getWidth()).toBe(280);
    expect(escuros(png)).toBeGreaterThan(0);
  });

  it("área sem conteúdo sai toda branca", () => {
    expect(escuros(copiarArea(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, [300, 400, 400, 500]))).toBe(0);
  });
});
