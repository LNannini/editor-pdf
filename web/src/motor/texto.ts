import type * as mupdf from "mupdf";
import { ErroDocumento, type Ponto, type Quad } from "./tipos";

/** Sem estas opções o MuPDF diferencia maiúsculas e acentos, e "peticao" não acharia "Petição". */
const OPCOES_BUSCA = "ignore-case,ignore-diacritics";

function conferirPagina(doc: mupdf.PDFDocument, pagina: number): void {
  if (!Number.isInteger(pagina) || pagina < 0 || pagina >= doc.countPages()) {
    throw new ErroDocumento(`A página ${pagina + 1} não existe neste documento.`);
  }
}

/** Texto e retângulos do trecho entre dois pontos da tela, como numa seleção com o mouse. */
export function selecionarTexto(doc: mupdf.PDFDocument, pagina: number, de: Ponto, ate: Ponto): { quads: Quad[]; texto: string } {
  conferirPagina(doc, pagina);
  const pg = doc.loadPage(pagina);
  let estrutura: mupdf.StructuredText | undefined;
  try {
    estrutura = pg.toStructuredText("preserve-whitespace");
    return { quads: estrutura.highlight(de, ate, 1000), texto: estrutura.copy(de, ate) };
  } finally {
    estrutura?.destroy();
    pg.destroy();
  }
}

/** Ocorrências do termo na página. Cada ocorrência é uma lista de quads, porque um termo pode quebrar de linha. */
export function buscarNaPagina(doc: mupdf.PDFDocument, pagina: number, termo: string): Quad[][] {
  conferirPagina(doc, pagina);
  if (termo.trim() === "") return [];
  const pg = doc.loadPage(pagina);
  try {
    return pg.search(termo, OPCOES_BUSCA);
  } finally {
    pg.destroy();
  }
}
