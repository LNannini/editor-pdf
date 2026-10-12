import type * as mupdf from "mupdf";
import { inserirImagemNoConteudo } from "./assinatura-imagem";
import { abrirDocumento, infoDocumento, salvarDocumento } from "./documento";
import {
  cortarMargens,
  excluirPaginas,
  girarPaginas,
  inserirImagemComoPagina,
  inserirPaginaEmBranco,
  inserirPdf,
  reordenarPaginas,
} from "./paginas";
import type { ErroSerializado, Pedido } from "./protocolo";
import { extrairPaginas, juntarArquivos, separarEmArquivos } from "./separar";
import { buscarNaPagina, selecionarTexto } from "./texto";
import { ErroDocumento, ErroSenha, type Bytes } from "./tipos";
import { copiarArea, renderizarPagina } from "./visual";

interface Saida {
  valor: unknown;
  transferir: Transferable[];
}

const simples = (valor: unknown): Saida => ({ valor, transferir: [] });
const bytes = (b: Bytes): Saida => ({ valor: b, transferir: [b.buffer] });

/** Guarda os documentos abertos e executa cada pedido. Roda dentro do worker; nos testes, roda direto no Node. */
export class ServicoMotor {
  private readonly docs = new Map<string, mupdf.PDFDocument>();
  private proximo = 1;

  tratar(pedido: Pedido): Saida {
    switch (pedido.tipo) {
      case "abrir": {
        const doc = abrirDocumento(pedido.bytes, pedido.senha);
        const id = `doc${this.proximo++}`;
        this.docs.set(id, doc);
        return simples({ doc: id, info: infoDocumento(doc) });
      }
      case "fechar":
        this.doc(pedido.doc).destroy();
        this.docs.delete(pedido.doc);
        return simples(null);
      case "info":
        return simples(infoDocumento(this.doc(pedido.doc)));
      case "renderizar": {
        const imagem = renderizarPagina(this.doc(pedido.doc), pedido.pagina, pedido.escala);
        return { valor: imagem, transferir: [imagem.rgba.buffer] };
      }
      case "selecionar":
        return simples(selecionarTexto(this.doc(pedido.doc), pedido.pagina, pedido.de, pedido.ate));
      case "buscar":
        return simples(buscarNaPagina(this.doc(pedido.doc), pedido.pagina, pedido.termo));
      case "copiarArea":
        return bytes(copiarArea(this.doc(pedido.doc), pedido.pagina, pedido.retangulo));
      case "excluir":
        return this.alterar(pedido.doc, (d) => excluirPaginas(d, pedido.paginas));
      case "girar":
        return this.alterar(pedido.doc, (d) => girarPaginas(d, pedido.paginas, pedido.graus));
      case "reordenar":
        return this.alterar(pedido.doc, (d) => reordenarPaginas(d, pedido.ordem));
      case "inserirBranco":
        return this.alterar(pedido.doc, (d) => inserirPaginaEmBranco(d, pedido.posicao));
      case "inserirPdf":
        return this.alterar(pedido.doc, (d) => inserirPdf(d, pedido.posicao, pedido.bytes, pedido.senha));
      case "inserirImagem":
        return this.alterar(pedido.doc, (d) => inserirImagemComoPagina(d, pedido.posicao, pedido.bytes));
      case "cortar":
        return this.alterar(pedido.doc, (d) => cortarMargens(d, pedido.paginas, pedido.retangulo));
      case "assinarImagem":
        return this.alterar(pedido.doc, (d) => inserirImagemNoConteudo(d, pedido.pagina, pedido.imagem, pedido.retangulo));
      case "desfazer":
        return this.alterar(pedido.doc, (d) => {
          if (d.canUndo()) d.undo();
        });
      case "refazer":
        return this.alterar(pedido.doc, (d) => {
          if (d.canRedo()) d.redo();
        });
      case "extrair":
        return bytes(extrairPaginas(this.doc(pedido.doc), pedido.paginas));
      case "separar": {
        const partes = separarEmArquivos(this.doc(pedido.doc), pedido.grupos);
        return { valor: partes, transferir: partes.map((p) => p.bytes.buffer) };
      }
      case "juntar":
        return bytes(juntarArquivos(pedido.arquivos));
      case "salvar":
        return bytes(salvarDocumento(this.doc(pedido.doc)));
      default: {
        const nunca: never = pedido;
        throw new Error(`Pedido desconhecido: ${JSON.stringify(nunca)}`);
      }
    }
  }

  private doc(id: string): mupdf.PDFDocument {
    const doc = this.docs.get(id);
    if (!doc) throw new ErroDocumento("Este documento não está aberto.");
    return doc;
  }

  private alterar(id: string, alteracao: (doc: mupdf.PDFDocument) => void): Saida {
    const doc = this.doc(id);
    alteracao(doc);
    return simples(infoDocumento(doc));
  }
}

export function serializarErro(erro: unknown): ErroSerializado {
  if (erro instanceof ErroSenha) {
    return erro.arquivo === undefined
      ? { tipo: "senha", tentativaErrada: erro.tentativaErrada }
      : { tipo: "senha", tentativaErrada: erro.tentativaErrada, arquivo: erro.arquivo };
  }
  if (erro instanceof ErroDocumento) return { tipo: "documento", mensagem: erro.message };
  return { tipo: "interno", mensagem: erro instanceof Error ? erro.message : String(erro) };
}
