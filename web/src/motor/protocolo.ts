import type { Grupo } from "./grupos";
import type { Bytes, ImagemRgba, InfoDocumento, Ponto, Quad, Retangulo } from "./tipos";

export type Pedido =
  | { tipo: "abrir"; bytes: Uint8Array; senha?: string }
  | { tipo: "fechar"; doc: string }
  | { tipo: "info"; doc: string }
  | { tipo: "renderizar"; doc: string; pagina: number; escala: number }
  | { tipo: "selecionar"; doc: string; pagina: number; de: Ponto; ate: Ponto }
  | { tipo: "buscar"; doc: string; pagina: number; termo: string }
  | { tipo: "copiarArea"; doc: string; pagina: number; retangulo: Retangulo }
  | { tipo: "excluir"; doc: string; paginas: number[] }
  | { tipo: "girar"; doc: string; paginas: number[]; graus: 90 | -90 | 180 }
  | { tipo: "reordenar"; doc: string; ordem: number[] }
  | { tipo: "inserirBranco"; doc: string; posicao: number }
  | { tipo: "inserirPdf"; doc: string; posicao: number; bytes: Uint8Array; senha?: string }
  | { tipo: "inserirImagem"; doc: string; posicao: number; bytes: Uint8Array }
  | { tipo: "cortar"; doc: string; paginas: number[]; retangulo: Retangulo }
  | { tipo: "assinarImagem"; doc: string; pagina: number; imagem: Uint8Array; retangulo: Retangulo }
  | { tipo: "desfazer"; doc: string }
  | { tipo: "refazer"; doc: string }
  | { tipo: "extrair"; doc: string; paginas: number[] }
  | { tipo: "separar"; doc: string; grupos: Grupo[] }
  | { tipo: "juntar"; arquivos: Array<{ bytes: Uint8Array; senha?: string }> }
  | { tipo: "salvar"; doc: string };

export interface Resultados {
  abrir: { doc: string; info: InfoDocumento };
  fechar: null;
  info: InfoDocumento;
  renderizar: ImagemRgba;
  selecionar: { quads: Quad[]; texto: string };
  buscar: Quad[][];
  copiarArea: Bytes;
  excluir: InfoDocumento;
  girar: InfoDocumento;
  reordenar: InfoDocumento;
  inserirBranco: InfoDocumento;
  inserirPdf: InfoDocumento;
  inserirImagem: InfoDocumento;
  cortar: InfoDocumento;
  assinarImagem: InfoDocumento;
  desfazer: InfoDocumento;
  refazer: InfoDocumento;
  extrair: Bytes;
  separar: Array<{ rotulo: string; bytes: Bytes }>;
  juntar: Bytes;
  salvar: Bytes;
}

export interface Envelope {
  id: number;
  pedido: Pedido;
}

export type ErroSerializado =
  | { tipo: "senha"; tentativaErrada: boolean; arquivo?: number }
  | { tipo: "documento"; mensagem: string }
  | { tipo: "interno"; mensagem: string };

export type Resposta = { id: number; ok: true; valor: unknown } | { id: number; ok: false; erro: ErroSerializado };
