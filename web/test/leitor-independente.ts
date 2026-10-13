import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Abre o PDF com o PDF.js, um leitor independente do MuPDF, e devolve o número de páginas e o texto de cada uma. */
export async function lerComPdfJs(bytes: Uint8Array, senha?: string): Promise<{ paginas: number; textos: string[] }> {
  const tarefa = getDocument({ data: bytes.slice(), password: senha, verbosity: VerbosityLevel.ERRORS });
  const pdf = await tarefa.promise;
  const textos: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const conteudo = await (await pdf.getPage(i)).getTextContent();
    textos.push(conteudo.items.map((item) => ("str" in item ? item.str : "")).join("").trim());
  }
  const paginas = pdf.numPages;
  await tarefa.destroy();
  return { paginas, textos };
}
