/** Bytes com memória própria, que podem ser transferidos para outro thread. */
export type Bytes = Uint8Array<ArrayBuffer>;

/** Retângulo em pontos no espaço de exibição da página: origem no canto superior esquerdo, com rotação e corte já aplicados. */
export type Retangulo = [number, number, number, number];
export type Ponto = [number, number];
/** Cantos de um trecho de texto: superior esquerdo, superior direito, inferior esquerdo, inferior direito (x, y de cada). */
export type Quad = [number, number, number, number, number, number, number, number];

export interface Marcador {
  titulo: string;
  pagina: number | null;
  filhos: Marcador[];
}

export interface InfoDocumento {
  paginas: number;
  tamanhos: Array<{ largura: number; altura: number }>;
  marcadores: Marcador[];
  reparado: boolean;
  restrito: boolean;
  assinadoDigitalmente: boolean;
  podeDesfazer: boolean;
  podeRefazer: boolean;
}

export interface ImagemRgba {
  largura: number;
  altura: number;
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

export class ErroDocumento extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDocumento";
  }
}

export class ErroSenha extends Error {
  readonly tentativaErrada: boolean;
  readonly arquivo: number | undefined;

  constructor(tentativaErrada: boolean, arquivo?: number) {
    const qual = arquivo === undefined ? "este PDF" : `o arquivo ${arquivo + 1} da lista`;
    super(tentativaErrada ? `Senha incorreta para ${qual}.` : `É preciso digitar a senha para abrir ${qual}.`);
    this.name = "ErroSenha";
    this.tentativaErrada = tentativaErrada;
    this.arquivo = arquivo;
  }
}
