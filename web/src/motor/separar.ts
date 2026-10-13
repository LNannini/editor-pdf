import * as mupdf from "mupdf";
import { abrirDocumento, salvarDocumento } from "./documento";
import type { Grupo } from "./grupos";
import { ErroDocumento, ErroSenha, type Bytes } from "./tipos";

/** Copia as páginas indicadas, na ordem dada, para um PDF novo. O documento de origem não muda. */
export function extrairPaginas(doc: mupdf.PDFDocument, paginas: number[]): Bytes {
  const total = doc.countPages();
  if (paginas.length === 0) throw new ErroDocumento("Nenhuma página selecionada.");
  for (const p of paginas) {
    if (!Number.isInteger(p) || p < 0 || p >= total) throw new ErroDocumento(`A página ${p + 1} não existe neste documento.`);
  }
  const novo = new mupdf.PDFDocument();
  try {
    const mapa = novo.newGraftMap();
    for (const p of paginas) mapa.graftPage(-1, doc, p);
    mapa.destroy();
    return salvarDocumento(novo);
  } finally {
    novo.destroy();
  }
}

export function separarEmArquivos(doc: mupdf.PDFDocument, grupos: Grupo[]): Array<{ rotulo: string; bytes: Bytes }> {
  if (grupos.length === 0) throw new ErroDocumento("Nada para separar.");
  return grupos.map((g) => ({ rotulo: g.rotulo, bytes: extrairPaginas(doc, g.paginas) }));
}

function abrirDaLista(arquivo: { bytes: Uint8Array; senha?: string }, indice: number): mupdf.PDFDocument {
  try {
    return abrirDocumento(arquivo.bytes, arquivo.senha);
  } catch (erro) {
    if (erro instanceof ErroSenha) throw new ErroSenha(erro.tentativaErrada, indice);
    if (erro instanceof ErroDocumento) throw new ErroDocumento(`Arquivo ${indice + 1} da lista: ${erro.message}`);
    throw erro;
  }
}

/** Junta vários PDFs, na ordem da lista, num PDF novo. */
export function juntarArquivos(arquivos: Array<{ bytes: Uint8Array; senha?: string }>): Bytes {
  if (arquivos.length < 2) throw new ErroDocumento("Escolha pelo menos dois arquivos para juntar.");
  const novo = new mupdf.PDFDocument();
  try {
    arquivos.forEach((arquivo, indice) => {
      const origem = abrirDaLista(arquivo, indice);
      const mapa = novo.newGraftMap();
      for (let i = 0; i < origem.countPages(); i++) mapa.graftPage(-1, origem, i);
      mapa.destroy();
      origem.destroy();
    });
    return salvarDocumento(novo);
  } finally {
    novo.destroy();
  }
}
