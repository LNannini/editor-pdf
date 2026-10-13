import * as mupdf from "mupdf";
import { ErroDocumento, ErroSenha, type Bytes, type InfoDocumento, type Marcador } from "./tipos";

interface ItemSumario {
  title?: string;
  page?: number;
  down?: ItemSumario[];
}

/** Abre um PDF a partir dos bytes. O desfazer (journal do MuPDF) já sai ligado. */
export function abrirDocumento(bytes: Uint8Array, senha?: string): mupdf.PDFDocument {
  let doc: mupdf.Document;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch (erro) {
    throw new ErroDocumento(`Este arquivo não pôde ser aberto como PDF (${(erro as Error).message}).`);
  }
  const pdf = doc.asPDF();
  if (!pdf) throw new ErroDocumento("Este arquivo não é um PDF.");
  if (pdf.needsPassword()) {
    if (senha === undefined) throw new ErroSenha(false);
    if (pdf.authenticatePassword(senha) === 0) throw new ErroSenha(true);
  }
  if (pdf.countPages() === 0) throw new ErroDocumento("Este PDF não tem nenhuma página legível.");
  pdf.enableJournal();
  return pdf;
}

export function infoDocumento(doc: mupdf.PDFDocument): InfoDocumento {
  const paginas = doc.countPages();
  const tamanhos: InfoDocumento["tamanhos"] = [];
  for (let i = 0; i < paginas; i++) {
    const pagina = doc.loadPage(i);
    const [x0, y0, x1, y1] = pagina.getBounds();
    pagina.destroy();
    tamanhos.push({ largura: x1 - x0, altura: y1 - y0 });
  }
  return {
    paginas,
    tamanhos,
    marcadores: converterMarcadores(doc.loadOutline()),
    reparado: doc.wasRepaired(),
    restrito: !doc.hasPermission("edit") || !doc.hasPermission("assemble"),
    assinadoDigitalmente: temAssinaturaDigital(doc),
    podeDesfazer: doc.canUndo(),
    podeRefazer: doc.canRedo(),
  };
}

function converterMarcadores(itens: ItemSumario[] | null): Marcador[] {
  return (itens ?? []).map((item) => ({
    titulo: item.title ?? "",
    pagina: typeof item.page === "number" && item.page >= 0 ? item.page : null,
    filhos: converterMarcadores(item.down ?? null),
  }));
}

/** Um PDF com assinatura digital liga o bit 1 de /SigFlags no formulário do documento. */
export function temAssinaturaDigital(doc: mupdf.PDFDocument): boolean {
  const flags = doc.getTrailer().get("Root", "AcroForm", "SigFlags");
  return flags.isNumber() && (flags.asNumber() & 1) === 1;
}

/** Serializa o documento. Com assinatura digital, salva de forma incremental para preservar a versão assinada. */
export function salvarDocumento(doc: mupdf.PDFDocument): Bytes {
  const opcoes = temAssinaturaDigital(doc) && doc.canBeSavedIncrementally() ? "incremental" : "garbage,compress";
  const buffer = doc.saveToBuffer(opcoes);
  try {
    return new Uint8Array(buffer.asUint8Array());
  } finally {
    buffer.destroy();
  }
}
