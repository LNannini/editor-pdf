import * as mupdf from "mupdf";
import { operacao } from "./paginas";
import { ErroDocumento, type Retangulo } from "./tipos";

/**
 * Grava uma imagem (a assinatura) no conteúdo da página, dentro do retângulo dado em coordenadas da tela.
 * Funciona com página girada, recursos herdados do nó pai e conteúdo dividido em vários fluxos.
 */
export function inserirImagemNoConteudo(
  doc: mupdf.PDFDocument,
  pagina: number,
  bytesImagem: Uint8Array,
  retangulo: Retangulo,
): void {
  if (!Number.isInteger(pagina) || pagina < 0 || pagina >= doc.countPages()) {
    throw new ErroDocumento(`A página ${pagina + 1} não existe neste documento.`);
  }
  // Só os limites e a transformação da página interessam aqui; a página carregada é liberada logo em seguida.
  const pg = doc.loadPage(pagina);
  let limites: mupdf.Rect;
  let transformacao: mupdf.Matrix;
  try {
    limites = pg.getBounds();
    transformacao = pg.getTransform();
  } finally {
    pg.destroy();
  }
  const [x0, y0, x1, y1] = retangulo;
  const [bx0, by0, bx1, by1] = limites;
  if (x1 - x0 < 5 || y1 - y0 < 5 || x0 < bx0 || y0 < by0 || x1 > bx1 || y1 > by1) {
    throw new ErroDocumento("A assinatura precisa ficar inteira dentro da página.");
  }
  let imagem: mupdf.Image;
  try {
    imagem = new mupdf.Image(bytesImagem);
  } catch {
    throw new ErroDocumento("A imagem da assinatura não pôde ser lida. Use PNG ou JPG.");
  }
  operacao(doc, "Inserir assinatura", () => {
    const objeto = doc.findPage(pagina);
    const ref = doc.addImage(imagem);
    // Recursos próprios desta página: se vinham herdados do nó pai ou eram compartilhados, as outras páginas não mudam.
    const origem = objeto.getInheritable("Resources");
    const recursos = doc.newDictionary();
    if (origem.isDictionary()) origem.forEach((valor, chave) => recursos.put(chave, valor));
    const xobjOrigem = recursos.get("XObject");
    const xobj = doc.newDictionary();
    if (xobjOrigem.isDictionary()) xobjOrigem.forEach((valor, chave) => xobj.put(chave, valor));
    let n = 1;
    while (!xobj.get(`EdAss${n}`).isNull()) n++;
    const nome = `EdAss${n}`;
    xobj.put(nome, ref);
    recursos.put("XObject", xobj);
    objeto.put("Resources", recursos);
    // Leva o quadrado unitário da imagem ao retângulo da tela e daí ao espaço do PDF, que tem o eixo y para cima.
    const matriz = mupdf.Matrix.concat([x1 - x0, 0, 0, -(y1 - y0), x0, y1], mupdf.Matrix.invert(transformacao));
    const cm = matriz.map((v) => String(Number(v.toFixed(4)))).join(" ");
    // O conteúdo original fica entre q e Q para que um estado gráfico deixado aberto por ele não desloque a assinatura.
    const antes = doc.addStream("q\n", {});
    const depois = doc.addStream(`\nQ\nq ${cm} cm /${nome} Do Q\n`, {});
    const atual = objeto.get("Contents");
    const lista = doc.newArray();
    lista.push(antes);
    if (atual.isArray()) atual.forEach((v) => lista.push(v));
    else if (!atual.isNull()) lista.push(atual);
    lista.push(depois);
    objeto.put("Contents", lista);
  });
}
