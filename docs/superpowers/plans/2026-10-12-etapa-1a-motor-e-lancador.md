# Etapa 1A: motor de PDF e lançador do PC, plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir e testar o motor de PDF (todas as operações da etapa 1, rodando num Web Worker) e o lançador Python do PC, ligados por uma página de prova que abre, desenha, altera e salva um PDF de verdade numa janela do Edge.

**Architecture:** O motor é TypeScript sobre o MuPDF.js (WebAssembly), organizado em funções puras por assunto (`documento`, `paginas`, `separar`, `visual`, `texto`, `assinatura-imagem`), expostas por um `ServicoMotor` que roda dentro de um Web Worker e conversa com a interface por mensagens tipadas. O lançador é Python só com biblioteca padrão: serve o build em 127.0.0.1 com segredo de sessão, lê e grava arquivos no disco com troca atômica e backup, e abre a janela do Edge. A interface definitiva (Preact) fica para o plano 1B; aqui existe só uma página de prova.

**Tech Stack:** Node 26.8.1, npm 11.19, TypeScript 7.0.2, Vite 8.3.4, Vitest 5.0.4, mupdf 1.28.1, pdfjs-dist 6.4.299 (só nos testes), Python 3.13 com pytest 9.1.1 e tkinter 8.6.

**Spec:** `docs/superpowers/specs/2026-10-12-editor-pdf-design.md`

## Global Constraints

- Raiz do projeto: `C:\Users\lucas\Downloads\editor-pdf`. Código web em `web/`, lançador em `lancador/`.
- Versões exatas, sem `^`: mupdf 1.28.1, typescript 7.0.2, vite 8.3.4, vitest 5.0.4, pdfjs-dist 6.4.299, @types/node 26.6.5.
- O lançador usa só a biblioteca padrão do Python 3.13 (pytest apenas para testes). pyHanko e python-pkcs11 entram na etapa 4.
- Toda coordenada que entra ou sai do motor está em pontos, no espaço de exibição da página: origem no canto superior esquerdo, com rotação e CropBox já aplicados. É o espaço que o MuPDF devolve em `getBounds()` e aceita em `setPageBox`, `highlight`, `copy` e `search`.
- Toda alteração de documento passa por `operacao(doc, nome, fn)`, que abre e fecha um passo do journal (desfazer). Se `fn` lançar erro, o passo é abandonado e o documento volta ao estado anterior.
- Nunca copiar documento com `new mupdf.PDFDocument(outroDoc)`: isso devolve o mesmo documento, não uma cópia. Cópia é `salvarDocumento` seguido de `abrirDocumento`, ou páginas copiadas com `newGraftMap().graftPage`.
- Bytes que saem do MuPDF (`Buffer.asUint8Array()`, `Pixmap.getPixels()`) são janelas para a memória do WebAssembly e precisam ser copiados (`new Uint8Array(...)`) antes de sair da função. O tipo `Bytes = Uint8Array<ArrayBuffer>` marca os que já são cópia própria.
- Busca sempre com as opções `"ignore-case,ignore-diacritics"`.
- O servidor do lançador escuta só em `127.0.0.1`, recusa `Host` diferente de `127.0.0.1:<porta>` ou `localhost:<porta>`, exige o cabeçalho `X-Editor-Segredo` em toda rota `/api/`, não envia cabeçalhos CORS e responde `Cache-Control: no-store`.
- Nenhum PDF real entra no git. A pasta `testes-reais/` é ignorada.
- Texto visível ao usuário, mensagens de erro e comentários de código em português, sem travessão (o traço longo, U+2014) e sem hífen usado como pausa.
- Commits com autor noreply e coautoria, sempre neste formato:
  `git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "<assunto>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`

## Review Focus

1. Caminho com acento, espaço e parênteses (`Petição Inicial (cópia).pdf` dentro de `Área de trabalho`): abrir, salvar, fazer backup e devolver o nome à página sem corromper nada. Teste nas Tasks 6 e 7, que usam esse nome em todas as rotas.
2. Ctrl+S com o arquivo aberto em outro programa: o original fica intacto, não sobra `.tmp` nem backup órfão, e a página recebe 409 com mensagem clara. Teste na Task 7.
3. Página girada (Rotate 90 ou 270): corte, assinatura por imagem e tamanho informado usam as coordenadas da tela, sem trocar largura e altura por engano. Testes nas Tasks 1, 2 e 4.
4. Marcadores irregulares, comuns em autos (primeiro marcador depois da página 1, fora de ordem, repetidos na mesma página, sem destino, aninhados): separar por marcadores não perde nem duplica página. Teste na Task 3, que confere que os grupos cobrem cada página exatamente uma vez.
5. Página com recursos herdados do nó pai ou conteúdo dividido em vários fluxos, comum em PDF gerado por sistema: a assinatura por imagem entra sem apagar o texto e sem alterar outras páginas. Teste na Task 4.

---

### Task 1: Projeto web e abertura de documentos

**Files:**
- Create: `.gitignore`
- Create: `web/package.json`, `web/tsconfig.json`, `web/vite.config.ts`
- Create: `web/src/motor/tipos.ts`
- Create: `web/src/motor/documento.ts`
- Create: `web/test/fabrica.ts`
- Create: `web/test/leitor-independente.ts`
- Test: `web/test/documento.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `tipos.ts`: `type Bytes = Uint8Array<ArrayBuffer>`, `type Retangulo = [number, number, number, number]`, `type Ponto = [number, number]`, `type Quad` (8 números), `interface Marcador { titulo: string; pagina: number | null; filhos: Marcador[] }`, `interface InfoDocumento { paginas; tamanhos: {largura, altura}[]; marcadores; reparado; restrito; assinadoDigitalmente; podeDesfazer; podeRefazer }`, `interface ImagemRgba { largura; altura; rgba: Uint8ClampedArray<ArrayBuffer> }`, `class ErroDocumento extends Error`, `class ErroSenha extends Error { tentativaErrada: boolean; arquivo: number | undefined }`.
  - `documento.ts`: `abrirDocumento(bytes: Uint8Array, senha?: string): mupdf.PDFDocument`, `infoDocumento(doc): InfoDocumento`, `temAssinaturaDigital(doc): boolean`, `salvarDocumento(doc): Bytes`.
  - `test/fabrica.ts`: `fabricarPdf(op?: OpcoesFabrica): Bytes`, `textoDaPagina(doc, i): string`, `textos(doc): string[]`, `pixel(doc, pagina, x, y): number`, `pngPreto(l?, a?): Uint8Array`, `pngMetadeTransparente(): Uint8Array`, `jpegCinza(l, a): Uint8Array`.
  - `test/leitor-independente.ts`: `lerComPdfJs(bytes: Uint8Array, senha?: string): Promise<{ paginas: number; textos: string[] }>`.

- [ ] **Step 1: Criar `.gitignore` na raiz**

```gitignore
node_modules/
web/dist/
testes-reais/
__pycache__/
*.pyc
.pytest_cache/
```

- [ ] **Step 2: Criar `web/package.json`**

```json
{
  "name": "editor-pdf-web",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 3: Instalar as dependências com versão exata**

Run:
```bash
cd /c/Users/lucas/Downloads/editor-pdf/web && npm install --save-exact mupdf@1.28.1 && npm install --save-exact --save-dev typescript@7.0.2 vite@8.3.4 vitest@5.0.4 pdfjs-dist@6.4.299 @types/node@26.6.5
```
Expected: `package.json` com as seis dependências sem `^` e `package-lock.json` criado.

- [ ] **Step 4: Criar `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["node", "vite/client"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "test", "vite.config.ts"]
}
```

`erasableSyntaxOnly` proíbe parâmetros de construtor com `readonly`/`private`, enums e namespaces, para que o Node consiga rodar arquivos `.ts` direto (usado no gerador de amostra da Task 10).

- [ ] **Step 5: Criar `web/vite.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  build: { target: "esnext", outDir: "dist", emptyOutDir: true },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["mupdf"] },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
  },
});
```

- [ ] **Step 6: Criar `web/src/motor/tipos.ts`**

```ts
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
```

- [ ] **Step 7: Criar `web/test/fabrica.ts`**

```ts
import * as mupdf from "mupdf";
import type { Bytes } from "../src/motor/tipos.ts";

export interface OpcoesFabrica {
  paginas?: number;
  prefixo?: string;
  rotacao?: 0 | 90 | 180 | 270;
  marcadores?: Array<{ titulo: string; pagina: number }>;
  recursosHerdados?: boolean;
  conteudoEmArray?: boolean;
  assinado?: boolean;
  senhaAbertura?: string;
  restringirEdicao?: boolean;
}

const fonte = { F1: { Type: "Font", Subtype: "Type1", BaseFont: "Helvetica" } };

/** Gera um PDF de teste em que cada página tem só o texto "<prefixo> <n>", com n a partir de 1. */
export function fabricarPdf(op: OpcoesFabrica = {}): Bytes {
  const { paginas = 3, prefixo = "Pagina", rotacao = 0 } = op;
  const doc = new mupdf.PDFDocument();
  for (let i = 0; i < paginas; i++) {
    const recursos = op.recursosHerdados ? {} : { Font: fonte };
    doc.insertPage(-1, doc.addPage([0, 0, 595, 842], rotacao, recursos, `BT /F1 24 Tf 72 720 Td (${prefixo} ${i + 1}) Tj ET`));
    const pagina = doc.findPage(i);
    if (op.recursosHerdados) pagina.delete("Resources");
    if (op.conteudoEmArray) {
      pagina.put("Contents", [
        doc.addStream("BT /F1 24 Tf 72 720 Td", {}),
        doc.addStream(`(${prefixo} ${i + 1}) Tj ET`, {}),
      ]);
    }
  }
  if (op.recursosHerdados) doc.getTrailer().get("Root", "Pages").put("Resources", { Font: fonte });
  if (op.marcadores?.length) {
    const iterador = doc.outlineIterator();
    for (const m of op.marcadores) {
      const uri = doc.formatLinkURI({ type: "Fit", chapter: 0, page: m.pagina, x: 0, y: 0, width: 0, height: 0, zoom: 0 });
      iterador.insert({ title: m.titulo, uri, open: true });
    }
  }
  if (op.assinado) doc.getTrailer().get("Root").put("AcroForm", { SigFlags: 3, Fields: [] });
  let opcoes = "garbage,compress";
  if (op.senhaAbertura) opcoes += `,encrypt=aes-256,user-password=${op.senhaAbertura},owner-password=dono`;
  else if (op.restringirEdicao) opcoes += ",encrypt=aes-128,owner-password=dono,permissions=4";
  const buffer = doc.saveToBuffer(opcoes);
  const bytes = new Uint8Array(buffer.asUint8Array());
  buffer.destroy();
  doc.destroy();
  return bytes;
}

export function textoDaPagina(doc: mupdf.PDFDocument, i: number): string {
  const texto = doc.loadPage(i).toStructuredText("preserve-whitespace");
  const valor = texto.asText().trim();
  texto.destroy();
  return valor;
}

export function textos(doc: mupdf.PDFDocument): string[] {
  return Array.from({ length: doc.countPages() }, (_, i) => textoDaPagina(doc, i));
}

/** Canal vermelho do pixel (x, y) da página desenhada em escala 1. 0 é preto, 255 é branco. */
export function pixel(doc: mupdf.PDFDocument, pagina: number, x: number, y: number): number {
  const pix = doc.loadPage(pagina).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
  const valor = pix.getPixels()[y * pix.getStride() + x * pix.getNumberOfComponents()];
  pix.destroy();
  return valor;
}

export function pngPreto(largura = 20, altura = 20): Uint8Array {
  const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, largura, altura], false);
  p.clear(0);
  return p.asPNG();
}

/**
 * PNG 20 x 20 com a metade esquerda preta e opaca e a metade direita transparente.
 * Atenção: clear() sem valor zera também o alfa; clear(0) pintaria tudo de preto opaco.
 */
export function pngMetadeTransparente(): Uint8Array {
  const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 20, 20], true);
  p.clear();
  const px = p.getPixels();
  const passo = p.getStride();
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 10; x++) {
      const i = y * passo + x * 4;
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = 255;
    }
  }
  return p.asPNG();
}

export function jpegCinza(largura: number, altura: number): Uint8Array {
  const p = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, largura, altura], false);
  p.clear(128);
  return p.asJPEG(80);
}
```

- [ ] **Step 8: Criar `web/test/leitor-independente.ts`**

```ts
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
```

- [ ] **Step 9: Escrever o teste que falha, `web/test/documento.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { abrirDocumento, infoDocumento, salvarDocumento } from "../src/motor/documento";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

describe("abrirDocumento e infoDocumento", () => {
  it("abre um PDF e informa páginas e tamanhos", () => {
    const info = infoDocumento(abrirDocumento(fabricarPdf({ paginas: 3 })));
    expect(info.paginas).toBe(3);
    expect(info.tamanhos[0]).toEqual({ largura: 595, altura: 842 });
    expect(info.reparado).toBe(false);
    expect(info.restrito).toBe(false);
    expect(info.assinadoDigitalmente).toBe(false);
    expect(info.podeDesfazer).toBe(false);
    expect(info.podeRefazer).toBe(false);
  });

  it("informa largura e altura com a rotação já aplicada", () => {
    const info = infoDocumento(abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 90 })));
    expect(info.tamanhos[0]).toEqual({ largura: 842, altura: 595 });
  });

  it("recusa bytes que não são PDF", () => {
    expect(() => abrirDocumento(new TextEncoder().encode("isto nao e um pdf"))).toThrow(ErroDocumento);
  });

  it("pede senha e distingue senha errada", () => {
    const bytes = fabricarPdf({ senhaAbertura: "abc" });
    expect(() => abrirDocumento(bytes)).toThrow(ErroSenha);
    try {
      abrirDocumento(bytes, "errada");
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroSenha);
      expect((erro as ErroSenha).tentativaErrada).toBe(true);
    }
    expect(infoDocumento(abrirDocumento(bytes, "abc")).paginas).toBe(3);
  });

  it("marca como restrito o PDF que o autor travou para edição", () => {
    expect(infoDocumento(abrirDocumento(fabricarPdf({ restringirEdicao: true }))).restrito).toBe(true);
  });

  it("abre PDF danificado e avisa que reparou", () => {
    const bytes = fabricarPdf({ paginas: 3 });
    const cortado = bytes.slice(0, Math.floor(bytes.length * 0.9));
    expect(infoDocumento(abrirDocumento(cortado)).reparado).toBe(true);
  });

  it("lê os marcadores com a página de destino", () => {
    const bytes = fabricarPdf({
      paginas: 5,
      marcadores: [
        { titulo: "Peticao inicial", pagina: 0 },
        { titulo: "Procuracao", pagina: 2 },
      ],
    });
    expect(infoDocumento(abrirDocumento(bytes)).marcadores).toEqual([
      { titulo: "Peticao inicial", pagina: 0, filhos: [] },
      { titulo: "Procuracao", pagina: 2, filhos: [] },
    ]);
  });

  it("detecta assinatura digital pelo SigFlags", () => {
    expect(infoDocumento(abrirDocumento(fabricarPdf({ assinado: true }))).assinadoDigitalmente).toBe(true);
  });
});

describe("salvarDocumento", () => {
  it("gera um PDF que o PDF.js também lê", async () => {
    const salvo = salvarDocumento(abrirDocumento(fabricarPdf({ paginas: 2 })));
    expect(await lerComPdfJs(salvo)).toEqual({ paginas: 2, textos: ["Pagina 1", "Pagina 2"] });
  });

  it("devolve bytes com memória própria, fora do WebAssembly", () => {
    const salvo = salvarDocumento(abrirDocumento(fabricarPdf({ paginas: 1 })));
    expect(salvo.byteOffset).toBe(0);
    expect(salvo.buffer.byteLength).toBe(salvo.length);
  });

  it("salva de forma incremental quando o PDF tem assinatura digital", async () => {
    const original = fabricarPdf({ assinado: true });
    const doc = abrirDocumento(original);
    doc.beginOperation("girar");
    doc.findPage(0).put("Rotate", 90);
    doc.endOperation();
    const salvo = salvarDocumento(doc);
    expect(salvo.length).toBeGreaterThan(original.length);
    expect(Buffer.from(salvo.subarray(0, original.length)).equals(Buffer.from(original))).toBe(true);
    expect((await lerComPdfJs(salvo)).paginas).toBe(3);
  });
});
```

- [ ] **Step 10: Rodar o teste e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/documento.test.ts`
Expected: FAIL, com erro de importação porque `../src/motor/documento` não existe.

- [ ] **Step 11: Implementar `web/src/motor/documento.ts`**

```ts
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
```

- [ ] **Step 12: Rodar os testes e a checagem de tipos**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/documento.test.ts && npx tsc --noEmit`
Expected: 11 testes PASS e `tsc` sem erros.

- [ ] **Step 13: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add .gitignore web/package.json web/package-lock.json web/tsconfig.json web/vite.config.ts web/src/motor/tipos.ts web/src/motor/documento.ts web/test/fabrica.ts web/test/leitor-independente.ts web/test/documento.test.ts && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(motor): abrir, inspecionar e salvar PDF com MuPDF.js" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Operações de página com desfazer

**Files:**
- Create: `web/src/motor/paginas.ts`
- Test: `web/test/paginas.test.ts`

**Interfaces:**
- Consumes: `abrirDocumento`, `infoDocumento`, `salvarDocumento` (Task 1); `ErroDocumento`, `ErroSenha`, `Retangulo` (Task 1).
- Produces (`paginas.ts`):
  - `operacao<T>(doc: mupdf.PDFDocument, nome: string, alterar: () => T): T`
  - `excluirPaginas(doc, paginas: number[]): void`
  - `girarPaginas(doc, paginas: number[], graus: 90 | -90 | 180): void`
  - `reordenarPaginas(doc, novaOrdem: number[]): void`
  - `inserirPaginaEmBranco(doc, posicao: number): void`
  - `inserirPdf(doc, posicao: number, bytes: Uint8Array, senha?: string): number` (devolve quantas páginas entraram)
  - `inserirImagemComoPagina(doc, posicao: number, bytes: Uint8Array): void`
  - `cortarMargens(doc, paginas: number[], retangulo: Retangulo): void`

- [ ] **Step 1: Escrever o teste que falha, `web/test/paginas.test.ts`**

```ts
import type * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { abrirDocumento, infoDocumento, salvarDocumento } from "../src/motor/documento";
import {
  cortarMargens,
  excluirPaginas,
  girarPaginas,
  inserirImagemComoPagina,
  inserirPaginaEmBranco,
  inserirPdf,
  operacao,
  reordenarPaginas,
} from "../src/motor/paginas";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf, jpegCinza, pixel, textos } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

const primeiroQuad = (doc: mupdf.PDFDocument, pagina: number, termo: string) =>
  doc.loadPage(pagina).search(termo, undefined)[0][0];

describe("operacao", () => {
  it("descarta o passo inteiro quando a alteração falha no meio", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    expect(() =>
      operacao(doc, "teste", () => {
        doc.deletePage(0);
        throw new Error("falhou");
      }),
    ).toThrow("falhou");
    expect(doc.countPages()).toBe(3);
    expect(doc.canUndo()).toBe(false);
  });
});

describe("excluirPaginas", () => {
  it("exclui, desfaz e refaz", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    excluirPaginas(doc, [1]);
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 3"]);
    doc.undo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
    doc.redo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 3"]);
  });

  it("exclui várias páginas, em qualquer ordem e com repetição, num passo só", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    excluirPaginas(doc, [0, 2, 0]);
    expect(textos(doc)).toEqual(["Pagina 2"]);
    doc.undo();
    expect(doc.countPages()).toBe(3);
  });

  it("não deixa excluir todas as páginas", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(() => excluirPaginas(doc, [0, 1])).toThrow(ErroDocumento);
    expect(doc.canUndo()).toBe(false);
  });

  it("recusa página que não existe", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(() => excluirPaginas(doc, [5])).toThrow(ErroDocumento);
  });
});

describe("girarPaginas", () => {
  it("gira só as páginas pedidas e troca largura com altura", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    girarPaginas(doc, [0], 90);
    expect(infoDocumento(doc).tamanhos).toEqual([
      { largura: 842, altura: 595 },
      { largura: 595, altura: 842 },
    ]);
  });

  it("soma à rotação que a página já tinha", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 270 }));
    girarPaginas(doc, [0], 90);
    expect(doc.findPage(0).get("Rotate").asNumber()).toBe(0);
    girarPaginas(doc, [0], -90);
    expect(doc.findPage(0).get("Rotate").asNumber()).toBe(270);
  });
});

describe("reordenarPaginas", () => {
  it("aplica a nova ordem e desfaz", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    reordenarPaginas(doc, [2, 0, 1]);
    expect(textos(doc)).toEqual(["Pagina 3", "Pagina 1", "Pagina 2"]);
    doc.undo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
  });

  it("recusa ordem que perde ou repete página", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    expect(() => reordenarPaginas(doc, [0, 0, 1])).toThrow(ErroDocumento);
    expect(() => reordenarPaginas(doc, [0, 1])).toThrow(ErroDocumento);
  });
});

describe("inserirPaginaEmBranco", () => {
  it("insere página vazia do tamanho da anterior", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2, rotacao: 90 }));
    inserirPaginaEmBranco(doc, 1);
    expect(textos(doc)).toEqual(["Pagina 1", "", "Pagina 2"]);
    expect(infoDocumento(doc).tamanhos[1]).toEqual({ largura: 842, altura: 595 });
  });

  it("insere no fim", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    inserirPaginaEmBranco(doc, 2);
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", ""]);
  });
});

describe("inserirPdf", () => {
  it("insere outro PDF no meio, e o PDF.js lê o resultado", async () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(inserirPdf(doc, 1, fabricarPdf({ paginas: 2, prefixo: "Outro" }))).toBe(2);
    const esperado = ["Pagina 1", "Outro 1", "Outro 2", "Pagina 2"];
    expect(textos(doc)).toEqual(esperado);
    expect((await lerComPdfJs(salvarDocumento(doc))).textos).toEqual(esperado);
    doc.undo();
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2"]);
  });

  it("insere no fim", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    inserirPdf(doc, 2, fabricarPdf({ paginas: 1, prefixo: "Outro" }));
    expect(textos(doc)).toEqual(["Pagina 1", "Pagina 2", "Outro 1"]);
  });

  it("pede a senha do PDF inserido sem alterar o documento", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    const protegido = fabricarPdf({ paginas: 1, senhaAbertura: "abc" });
    expect(() => inserirPdf(doc, 0, protegido)).toThrow(ErroSenha);
    expect(doc.countPages()).toBe(2);
    expect(doc.canUndo()).toBe(false);
    expect(inserirPdf(doc, 0, protegido, "abc")).toBe(1);
  });
});

describe("inserirImagemComoPagina", () => {
  it("cria página que cabe numa folha A4 em pé, mantendo a proporção", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemComoPagina(doc, 1, jpegCinza(300, 400));
    const { largura, altura } = infoDocumento(doc).tamanhos[1];
    expect(largura).toBeCloseTo(595, 0);
    expect(altura).toBeCloseTo(793.33, 0);
    expect(Math.abs(pixel(doc, 1, 300, 400) - 128)).toBeLessThan(10);
  });

  it("deita a folha quando a foto é horizontal", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemComoPagina(doc, 0, jpegCinza(400, 300));
    const { largura, altura } = infoDocumento(doc).tamanhos[0];
    expect(largura).toBeCloseTo(793.33, 0);
    expect(altura).toBeCloseTo(595, 0);
  });

  it("recusa arquivo que não é imagem sem criar passo de desfazer", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    expect(() => inserirImagemComoPagina(doc, 0, new Uint8Array([1, 2, 3, 4]))).toThrow(ErroDocumento);
    expect(doc.canUndo()).toBe(false);
  });
});

describe("cortarMargens", () => {
  it("recorta a área visível e o texto acompanha", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    const antes = primeiroQuad(doc, 0, "Pagina");
    cortarMargens(doc, [0], [50, 50, 400, 500]);
    expect(infoDocumento(doc).tamanhos[0]).toEqual({ largura: 350, altura: 450 });
    const depois = primeiroQuad(doc, 0, "Pagina");
    expect(depois[0]).toBeCloseTo(antes[0] - 50, 1);
    expect(depois[1]).toBeCloseTo(antes[1] - 50, 1);
    doc.undo();
    expect(infoDocumento(doc).tamanhos[0]).toEqual({ largura: 595, altura: 842 });
  });

  it("usa as coordenadas da tela também em página girada", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 90 }));
    const antes = primeiroQuad(doc, 0, "Pagina");
    cortarMargens(doc, [0], [50, 50, 400, 300]);
    expect(infoDocumento(doc).tamanhos[0]).toEqual({ largura: 350, altura: 250 });
    const depois = primeiroQuad(doc, 0, "Pagina");
    expect(depois[0]).toBeCloseTo(antes[0] - 50, 1);
    expect(depois[1]).toBeCloseTo(antes[1] - 50, 1);
  });

  it("limita o retângulo ao tamanho de cada página", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    girarPaginas(doc, [1], 90);
    cortarMargens(doc, [0, 1], [0, 0, 700, 700]);
    expect(infoDocumento(doc).tamanhos).toEqual([
      { largura: 595, altura: 700 },
      { largura: 700, altura: 595 },
    ]);
  });

  it("recusa área pequena demais", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    expect(() => cortarMargens(doc, [0], [0, 0, 5, 5])).toThrow(ErroDocumento);
  });
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/paginas.test.ts`
Expected: FAIL, porque `../src/motor/paginas` não existe.

- [ ] **Step 3: Implementar `web/src/motor/paginas.ts`**

```ts
import * as mupdf from "mupdf";
import { abrirDocumento } from "./documento";
import { ErroDocumento, type Retangulo } from "./tipos";

const A4_CURTO = 595;
const A4_LONGO = 842;
const numero = (v: number) => String(Number(v.toFixed(4)));

/** Executa uma alteração como um passo do desfazer. Se der erro no meio, o MuPDF descarta o passo inteiro. */
export function operacao<T>(doc: mupdf.PDFDocument, nome: string, alterar: () => T): T {
  doc.beginOperation(nome);
  try {
    const resultado = alterar();
    doc.endOperation();
    return resultado;
  } catch (erro) {
    doc.abandonOperation();
    throw erro;
  }
}

function conferirPaginas(doc: mupdf.PDFDocument, paginas: number[]): number[] {
  const total = doc.countPages();
  const unicas = [...new Set(paginas)];
  if (unicas.length === 0) throw new ErroDocumento("Nenhuma página selecionada.");
  for (const p of unicas) {
    if (!Number.isInteger(p) || p < 0 || p >= total) throw new ErroDocumento(`A página ${p + 1} não existe neste documento.`);
  }
  return unicas;
}

/** Converte a posição de inserção (0 a total) no índice que o MuPDF espera; -1 significa "no fim". */
function conferirPosicao(doc: mupdf.PDFDocument, posicao: number): number {
  const total = doc.countPages();
  if (!Number.isInteger(posicao) || posicao < 0 || posicao > total) throw new ErroDocumento("Posição inválida para inserir.");
  return posicao === total ? -1 : posicao;
}

export function excluirPaginas(doc: mupdf.PDFDocument, paginas: number[]): void {
  const unicas = conferirPaginas(doc, paginas);
  if (unicas.length >= doc.countPages()) {
    throw new ErroDocumento("Não dá para excluir todas as páginas. O PDF precisa ficar com pelo menos uma.");
  }
  operacao(doc, "Excluir páginas", () => {
    for (const p of unicas.sort((a, b) => b - a)) doc.deletePage(p);
  });
}

export function girarPaginas(doc: mupdf.PDFDocument, paginas: number[], graus: 90 | -90 | 180): void {
  const unicas = conferirPaginas(doc, paginas);
  operacao(doc, "Girar páginas", () => {
    for (const p of unicas) {
      const objeto = doc.findPage(p);
      const atual = objeto.getInheritable("Rotate");
      const valor = atual.isNumber() ? atual.asNumber() : 0;
      objeto.put("Rotate", (((valor + graus) % 360) + 360) % 360);
    }
  });
}

export function reordenarPaginas(doc: mupdf.PDFDocument, novaOrdem: number[]): void {
  const total = doc.countPages();
  const conferida = [...novaOrdem].sort((a, b) => a - b);
  if (novaOrdem.length !== total || conferida.some((v, i) => v !== i)) {
    throw new ErroDocumento("A nova ordem precisa ter cada página exatamente uma vez.");
  }
  operacao(doc, "Reordenar páginas", () => doc.rearrangePages(novaOrdem));
}

/** Insere uma página vazia do tamanho da página anterior (ou da primeira, se a inserção for no início). */
export function inserirPaginaEmBranco(doc: mupdf.PDFDocument, posicao: number): void {
  const destino = conferirPosicao(doc, posicao);
  const vizinha = doc.loadPage(posicao > 0 ? posicao - 1 : 0);
  const [x0, y0, x1, y1] = vizinha.getBounds();
  vizinha.destroy();
  operacao(doc, "Inserir página em branco", () => {
    doc.insertPage(destino, doc.addPage([0, 0, x1 - x0, y1 - y0], 0, {}, ""));
  });
}

/** Insere todas as páginas de outro PDF a partir da posição indicada. Devolve quantas páginas entraram. */
export function inserirPdf(doc: mupdf.PDFDocument, posicao: number, bytes: Uint8Array, senha?: string): number {
  const destino = conferirPosicao(doc, posicao);
  const outro = abrirDocumento(bytes, senha);
  try {
    const quantas = outro.countPages();
    const mapa = doc.newGraftMap();
    operacao(doc, "Inserir PDF", () => {
      for (let i = 0; i < quantas; i++) mapa.graftPage(destino === -1 ? -1 : destino + i, outro, i);
    });
    mapa.destroy();
    return quantas;
  } finally {
    outro.destroy();
  }
}

/** Cria uma página com a imagem, no tamanho de uma folha A4 (em pé ou deitada, conforme a foto), mantendo a proporção. */
export function inserirImagemComoPagina(doc: mupdf.PDFDocument, posicao: number, bytes: Uint8Array): void {
  const destino = conferirPosicao(doc, posicao);
  let imagem: mupdf.Image;
  try {
    imagem = new mupdf.Image(bytes);
  } catch {
    throw new ErroDocumento("A imagem não pôde ser lida. Use um arquivo JPG ou PNG.");
  }
  const largura = imagem.getWidth();
  const altura = imagem.getHeight();
  const escala =
    altura >= largura
      ? Math.min(A4_CURTO / largura, A4_LONGO / altura)
      : Math.min(A4_LONGO / largura, A4_CURTO / altura);
  const w = largura * escala;
  const h = altura * escala;
  operacao(doc, "Inserir imagem como página", () => {
    const ref = doc.addImage(imagem);
    const pagina = doc.addPage([0, 0, w, h], 0, { XObject: { Im0: ref } }, `q ${numero(w)} 0 0 ${numero(h)} 0 0 cm /Im0 Do Q`);
    doc.insertPage(destino, pagina);
  });
}

/**
 * Recorta a área visível das páginas (CropBox). O retângulo vem nas coordenadas da tela e é limitado ao
 * tamanho de cada página. O conteúdo de fora continua dentro do arquivo, só fica escondido.
 */
export function cortarMargens(doc: mupdf.PDFDocument, paginas: number[], retangulo: Retangulo): void {
  const unicas = conferirPaginas(doc, paginas);
  const [x0, y0, x1, y1] = retangulo;
  if (x1 - x0 < 10 || y1 - y0 < 10) throw new ErroDocumento("A área de corte é pequena demais.");
  operacao(doc, "Cortar margens", () => {
    for (const p of unicas) {
      const pagina = doc.loadPage(p);
      const [bx0, by0, bx1, by1] = pagina.getBounds();
      const limitado: Retangulo = [Math.max(bx0, x0), Math.max(by0, y0), Math.min(bx1, x1), Math.min(by1, y1)];
      if (limitado[2] - limitado[0] < 10 || limitado[3] - limitado[1] < 10) {
        throw new ErroDocumento(`A área de corte fica fora da página ${p + 1}.`);
      }
      pagina.setPageBox("CropBox", limitado);
      pagina.destroy();
    }
  });
}
```

- [ ] **Step 4: Rodar os testes**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/paginas.test.ts && npx tsc --noEmit`
Expected: 21 testes PASS e `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add web/src/motor/paginas.ts web/test/paginas.test.ts && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(motor): operações de página com desfazer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Separar e juntar arquivos

**Files:**
- Create: `web/src/motor/intervalos.ts` (contribuição do Lucas, Step 3)
- Create: `web/src/motor/grupos.ts`
- Create: `web/src/motor/separar.ts`
- Test: `web/test/intervalos.test.ts`, `web/test/grupos.test.ts`, `web/test/separar.test.ts`

**Interfaces:**
- Consumes: `abrirDocumento`, `salvarDocumento` (Task 1); `ErroDocumento`, `ErroSenha`, `Marcador`, `Bytes` (Task 1).
- Produces:
  - `intervalos.ts`: `interpretarIntervalos(texto: string, total: number): number[][]` (entrada em números de página a partir de 1; saída em índices a partir de 0; um grupo por arquivo).
  - `grupos.ts` (sem MuPDF, pode ser importado pela interface): `interface Grupo { rotulo: string; paginas: number[] }`, `gruposACada(total, n): Grupo[]`, `gruposDeIntervalos(intervalos: number[][]): Grupo[]`, `gruposPorMarcadores(marcadores: Marcador[], total: number): Grupo[]`.
  - `separar.ts`: `extrairPaginas(doc, paginas: number[]): Bytes`, `separarEmArquivos(doc, grupos: Grupo[]): Array<{ rotulo: string; bytes: Bytes }>`, `juntarArquivos(arquivos: Array<{ bytes: Uint8Array; senha?: string }>): Bytes`.

- [ ] **Step 1: Escrever o teste de `interpretarIntervalos`, `web/test/intervalos.test.ts`**

```ts
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
```

- [ ] **Step 2: Criar o arquivo com a assinatura da função e o TODO**

`web/src/motor/intervalos.ts`:

```ts
import { ErroDocumento } from "./tipos";

/**
 * Lê o que o Lucas digita na caixa "Separar por intervalo" e devolve um grupo de páginas por arquivo.
 * Entrada em números de página como aparecem na tela (a partir de 1); saída em índices (a partir de 0).
 * Exemplo: "1-5, 8, 10-12" com total 20 vira [[0,1,2,3,4], [7], [9,10,11]].
 */
export function interpretarIntervalos(texto: string, total: number): number[][] {
  // TODO(Lucas): implementar. Os casos que o teste exige estão em web/test/intervalos.test.ts.
  throw new ErroDocumento(`Ainda não implementado (${texto}, ${total}).`);
}
```

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/intervalos.test.ts`
Expected: FAIL nos 4 testes com "Ainda não implementado".

- [ ] **Step 3: Pausa para a contribuição do Lucas (modo aprendizado)**

Quem executa este plano para aqui e pede ao Lucas que escreva o corpo de `interpretarIntervalos` (5 a 10 linhas). Explicar a ele o que já está decidido pelos testes (vírgula ou ponto e vírgula separam arquivos; "8-" vai até o fim; página 0, página além do total, "5-2" e texto vazio são erro) e as escolhas que continuam dele: se "1-3, 2-4" (páginas repetidas em dois arquivos) deve ser aceito, e como deve ser a mensagem de erro, que ele vai ler na tela. Se ele preferir não escrever, ou se o teste continuar falhando depois de uma tentativa e ele pedir, usar esta implementação de referência:

```ts
export function interpretarIntervalos(texto: string, total: number): number[][] {
  const partes = texto.split(/[,;]/).map((p) => p.trim()).filter((p) => p !== "");
  if (partes.length === 0) throw new ErroDocumento("Digite as páginas, por exemplo: 1-5, 8, 10-12.");
  return partes.map((parte) => {
    const achado = /^(\d+)\s*(?:-\s*(\d*))?$/.exec(parte);
    if (!achado) throw new ErroDocumento(`Não entendi "${parte}". Use números e hífen, como 1-5.`);
    const inicio = Number(achado[1]);
    const fim = achado[2] === undefined ? inicio : achado[2] === "" ? total : Number(achado[2]);
    if (inicio < 1 || fim > total) throw new ErroDocumento(`"${parte}" sai do documento, que tem ${total} páginas.`);
    if (fim < inicio) throw new ErroDocumento(`Em "${parte}" o fim vem antes do começo.`);
    return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio - 1 + i);
  });
}
```

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/intervalos.test.ts`
Expected: 4 testes PASS.

- [ ] **Step 4: Escrever o teste de `grupos`, `web/test/grupos.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { gruposACada, gruposDeIntervalos, gruposPorMarcadores, type Grupo } from "../src/motor/grupos";
import { ErroDocumento, type Marcador } from "../src/motor/tipos";

const m = (titulo: string, pagina: number | null, filhos: Marcador[] = []): Marcador => ({ titulo, pagina, filhos });

/** Cada página do documento aparece em exatamente um grupo, em ordem. */
function cobreTudo(grupos: Grupo[], total: number): void {
  expect(grupos.flatMap((g) => g.paginas)).toEqual(Array.from({ length: total }, (_, i) => i));
}

describe("gruposACada", () => {
  it("separa de N em N e rotula com números da tela", () => {
    const grupos = gruposACada(7, 3);
    expect(grupos.map((g) => g.rotulo)).toEqual(["páginas 1-3", "páginas 4-6", "página 7"]);
    cobreTudo(grupos, 7);
  });

  it("recusa N inválido", () => {
    expect(() => gruposACada(7, 0)).toThrow(ErroDocumento);
  });
});

describe("gruposDeIntervalos", () => {
  it("rotula intervalos contínuos e soltos", () => {
    expect(gruposDeIntervalos([[0, 1, 2], [4], [6, 9]]).map((g) => g.rotulo)).toEqual([
      "páginas 1-3",
      "página 5",
      "páginas 7, 10",
    ]);
  });
});

describe("gruposPorMarcadores", () => {
  it("um arquivo por marcador, do início dele até antes do próximo", () => {
    const grupos = gruposPorMarcadores([m("Peticao", 0), m("Procuracao", 2), m("Documentos", 3)], 5);
    expect(grupos).toEqual([
      { rotulo: "Peticao", paginas: [0, 1] },
      { rotulo: "Procuracao", paginas: [2] },
      { rotulo: "Documentos", paginas: [3, 4] },
    ]);
  });

  it("cria o grupo Início quando o primeiro marcador não está na página 1", () => {
    const grupos = gruposPorMarcadores([m("Contestacao", 3)], 6);
    expect(grupos.map((g) => g.rotulo)).toEqual(["Início", "Contestacao"]);
    cobreTudo(grupos, 6);
  });

  it("ordena marcadores fora de ordem e fica com o primeiro de cada página", () => {
    const grupos = gruposPorMarcadores([m("C", 4), m("A", 0), m("B", 2), m("B repetido", 2)], 6);
    expect(grupos.map((g) => g.rotulo)).toEqual(["A", "B", "C"]);
    cobreTudo(grupos, 6);
  });

  it("ignora marcador sem destino ou fora do documento e usa só o primeiro nível", () => {
    const grupos = gruposPorMarcadores(
      [m("Volume 1", 0, [m("Doc interno", 1)]), m("Sem destino", null), m("Fora", 99), m("Volume 2", 3)],
      5,
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["Volume 1", "Volume 2"]);
    cobreTudo(grupos, 5);
  });

  it("usa o número da página como nome quando o marcador não tem título", () => {
    expect(gruposPorMarcadores([m("  ", 0)], 2)[0].rotulo).toBe("Página 1");
  });

  it("recusa PDF sem marcadores com destino", () => {
    expect(() => gruposPorMarcadores([m("Sem destino", null)], 3)).toThrow(ErroDocumento);
  });
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/grupos.test.ts`
Expected: FAIL, porque `../src/motor/grupos` não existe.

- [ ] **Step 6: Implementar `web/src/motor/grupos.ts`**

```ts
import { ErroDocumento, type Marcador } from "./tipos";

/** Um arquivo a ser gerado: as páginas (índices a partir de 0) e um rótulo legível para compor o nome. */
export interface Grupo {
  rotulo: string;
  paginas: number[];
}

function rotular(paginas: number[]): string {
  if (paginas.length === 1) return `página ${paginas[0] + 1}`;
  const continuo = paginas.every((p, i) => i === 0 || p === paginas[i - 1] + 1);
  if (continuo) return `páginas ${paginas[0] + 1}-${paginas[paginas.length - 1] + 1}`;
  return `páginas ${paginas.map((p) => p + 1).join(", ")}`;
}

export function gruposACada(total: number, n: number): Grupo[] {
  if (!Number.isInteger(n) || n < 1) throw new ErroDocumento("Informe de quantas em quantas páginas separar.");
  const grupos: Grupo[] = [];
  for (let inicio = 0; inicio < total; inicio += n) {
    const paginas = Array.from({ length: Math.min(n, total - inicio) }, (_, i) => inicio + i);
    grupos.push({ rotulo: rotular(paginas), paginas });
  }
  return grupos;
}

export function gruposDeIntervalos(intervalos: number[][]): Grupo[] {
  return intervalos.map((paginas) => ({ rotulo: rotular(paginas), paginas }));
}

/**
 * Um grupo por marcador de primeiro nível, da página dele até a anterior ao próximo marcador.
 * Páginas antes do primeiro marcador viram o grupo "Início", para que nenhuma página se perca.
 */
export function gruposPorMarcadores(marcadores: Marcador[], total: number): Grupo[] {
  const pontos = marcadores
    .flatMap((m) =>
      m.pagina !== null && m.pagina >= 0 && m.pagina < total
        ? [{ titulo: m.titulo.trim() || `Página ${m.pagina + 1}`, pagina: m.pagina }]
        : [],
    )
    .sort((a, b) => a.pagina - b.pagina)
    .filter((m, i, lista) => i === 0 || m.pagina !== lista[i - 1].pagina);
  if (pontos.length === 0) throw new ErroDocumento("Este PDF não tem marcadores que apontem para uma página.");
  if (pontos[0].pagina > 0) pontos.unshift({ titulo: "Início", pagina: 0 });
  return pontos.map((ponto, i) => {
    const fim = i + 1 < pontos.length ? pontos[i + 1].pagina : total;
    return { rotulo: ponto.titulo, paginas: Array.from({ length: fim - ponto.pagina }, (_, k) => ponto.pagina + k) };
  });
}
```

- [ ] **Step 7: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/grupos.test.ts`
Expected: 9 testes PASS.

- [ ] **Step 8: Escrever o teste de `separar`, `web/test/separar.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { abrirDocumento, infoDocumento } from "../src/motor/documento";
import { gruposPorMarcadores } from "../src/motor/grupos";
import { extrairPaginas, juntarArquivos, separarEmArquivos } from "../src/motor/separar";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

describe("extrairPaginas", () => {
  it("copia as páginas na ordem pedida sem mexer na origem", async () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 3 }));
    expect(await lerComPdfJs(extrairPaginas(doc, [2, 0]))).toEqual({ paginas: 2, textos: ["Pagina 3", "Pagina 1"] });
    expect(doc.countPages()).toBe(3);
    expect(doc.canUndo()).toBe(false);
  });

  it("recusa lista vazia ou página inexistente", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2 }));
    expect(() => extrairPaginas(doc, [])).toThrow(ErroDocumento);
    expect(() => extrairPaginas(doc, [2])).toThrow(ErroDocumento);
  });
});

describe("separarEmArquivos", () => {
  it("gera um PDF por marcador dos autos", async () => {
    const doc = abrirDocumento(
      fabricarPdf({ paginas: 4, marcadores: [{ titulo: "Peticao", pagina: 0 }, { titulo: "Procuracao", pagina: 3 }] }),
    );
    const partes = separarEmArquivos(doc, gruposPorMarcadores(infoDocumento(doc).marcadores, 4));
    expect(partes.map((p) => p.rotulo)).toEqual(["Peticao", "Procuracao"]);
    expect((await lerComPdfJs(partes[0].bytes)).textos).toEqual(["Pagina 1", "Pagina 2", "Pagina 3"]);
    expect((await lerComPdfJs(partes[1].bytes)).textos).toEqual(["Pagina 4"]);
  });
});

describe("juntarArquivos", () => {
  it("junta na ordem da lista", async () => {
    const junto = juntarArquivos([
      { bytes: fabricarPdf({ paginas: 2, prefixo: "A" }) },
      { bytes: fabricarPdf({ paginas: 1, prefixo: "B" }) },
    ]);
    expect((await lerComPdfJs(junto)).textos).toEqual(["A 1", "A 2", "B 1"]);
  });

  it("diz qual arquivo da lista pede senha", () => {
    try {
      juntarArquivos([{ bytes: fabricarPdf({ paginas: 1 }) }, { bytes: fabricarPdf({ paginas: 1, senhaAbertura: "x" }) }]);
      expect.unreachable();
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroSenha);
      expect((erro as ErroSenha).arquivo).toBe(1);
    }
  });

  it("aceita a senha de cada arquivo", async () => {
    const junto = juntarArquivos([
      { bytes: fabricarPdf({ paginas: 1, prefixo: "A" }) },
      { bytes: fabricarPdf({ paginas: 1, prefixo: "B", senhaAbertura: "x" }), senha: "x" },
    ]);
    expect((await lerComPdfJs(junto)).textos).toEqual(["A 1", "B 1"]);
  });

  it("diz qual arquivo da lista não é PDF", () => {
    expect(() => juntarArquivos([{ bytes: fabricarPdf({ paginas: 1 }) }, { bytes: new TextEncoder().encode("lixo") }])).toThrow(
      "Arquivo 2 da lista",
    );
  });

  it("pede pelo menos dois arquivos", () => {
    expect(() => juntarArquivos([{ bytes: fabricarPdf({ paginas: 1 }) }])).toThrow(ErroDocumento);
  });
});
```

- [ ] **Step 9: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/separar.test.ts`
Expected: FAIL, porque `../src/motor/separar` não existe.

- [ ] **Step 10: Implementar `web/src/motor/separar.ts`**

```ts
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
```

- [ ] **Step 11: Rodar tudo da Task 3**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/intervalos.test.ts test/grupos.test.ts test/separar.test.ts && npx tsc --noEmit`
Expected: 21 testes PASS e `tsc` sem erros.

- [ ] **Step 12: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add web/src/motor/intervalos.ts web/src/motor/grupos.ts web/src/motor/separar.ts web/test/intervalos.test.ts web/test/grupos.test.ts web/test/separar.test.ts && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(motor): separar por intervalo, a cada N e por marcadores; juntar arquivos" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Desenho da página, texto e assinatura por imagem

**Files:**
- Create: `web/src/motor/visual.ts`
- Create: `web/src/motor/texto.ts`
- Create: `web/src/motor/assinatura-imagem.ts`
- Test: `web/test/visual.test.ts`, `web/test/texto.test.ts`, `web/test/assinatura-imagem.test.ts`

**Interfaces:**
- Consumes: `abrirDocumento`, `salvarDocumento` (Task 1); `operacao` (Task 2); tipos da Task 1; `pixel`, `pngPreto`, `pngMetadeTransparente`, `fabricarPdf`, `textoDaPagina` (Task 1).
- Produces:
  - `visual.ts`: `renderizarPagina(doc, pagina: number, escala: number): ImagemRgba`, `copiarArea(doc, pagina: number, retangulo: Retangulo, escala?: number): Bytes` (PNG).
  - `texto.ts`: `selecionarTexto(doc, pagina: number, de: Ponto, ate: Ponto): { quads: Quad[]; texto: string }`, `buscarNaPagina(doc, pagina: number, termo: string): Quad[][]` (um array de quads por ocorrência).
  - `assinatura-imagem.ts`: `inserirImagemNoConteudo(doc, pagina: number, bytesImagem: Uint8Array, retangulo: Retangulo): void`.

- [ ] **Step 1: Escrever `web/test/visual.test.ts`**

```ts
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
```

- [ ] **Step 2: Escrever `web/test/texto.test.ts`**

```ts
import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { abrirDocumento } from "../src/motor/documento";
import { buscarNaPagina, selecionarTexto } from "../src/motor/texto";
import { fabricarPdf } from "./fabrica";

/** PDF de uma página com "Pagina 1 e PAGINA e Petição", em WinAnsi (ç = octal 347, ã = octal 343). */
function pdfComAcentos(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const barra = String.fromCharCode(92);
  const conteudo = `BT /F1 24 Tf 72 720 Td (Pagina 1 e PAGINA e Peti${barra}347${barra}343o) Tj ET`;
  const fonte = { F1: { Type: "Font", Subtype: "Type1", BaseFont: "Helvetica", Encoding: "WinAnsiEncoding" } };
  doc.insertPage(-1, doc.addPage([0, 0, 595, 842], 0, { Font: fonte }, conteudo));
  return new Uint8Array(doc.saveToBuffer("").asUint8Array());
}

describe("selecionarTexto", () => {
  it("devolve o texto e os retângulos do trecho arrastado", () => {
    const sel = selecionarTexto(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, [60, 100], [400, 140]);
    expect(sel.texto).toBe("Pagina 1");
    expect(sel.quads).toHaveLength(1);
    expect(sel.quads[0][0]).toBeCloseTo(72, 0);
  });

  it("seleção em área vazia não devolve nada", () => {
    expect(selecionarTexto(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, [300, 400], [350, 450])).toEqual({ quads: [], texto: "" });
  });
});

describe("buscarNaPagina", () => {
  it("ignora maiúsculas e acentos", () => {
    const doc = abrirDocumento(pdfComAcentos());
    expect(buscarNaPagina(doc, 0, "pagina")).toHaveLength(2);
    expect(buscarNaPagina(doc, 0, "peticao")).toHaveLength(1);
    expect(buscarNaPagina(doc, 0, "PETIÇÃO")).toHaveLength(1);
  });

  it("termo vazio não busca", () => {
    expect(buscarNaPagina(abrirDocumento(fabricarPdf({ paginas: 1 })), 0, "   ")).toEqual([]);
  });
});
```

- [ ] **Step 3: Escrever `web/test/assinatura-imagem.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { inserirImagemNoConteudo } from "../src/motor/assinatura-imagem";
import { abrirDocumento, salvarDocumento } from "../src/motor/documento";
import { ErroDocumento } from "../src/motor/tipos";
import { fabricarPdf, pixel, pngMetadeTransparente, pngPreto, textoDaPagina } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

describe("inserirImagemNoConteudo", () => {
  it("põe a imagem no retângulo da tela, mantém o texto e desfaz", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(pixel(doc, 0, 300, 400)).toBeGreaterThan(200);
    expect(textoDaPagina(doc, 0)).toBe("Pagina 1");
    doc.undo();
    expect(pixel(doc, 0, 150, 125)).toBeGreaterThan(200);
  });

  it("acerta o lugar em página girada 90 graus", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 90 }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(pixel(doc, 0, 105, 300)).toBeGreaterThan(200);
  });

  it("respeita a transparência e a orientação em página girada 270 graus", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, rotacao: 270 }));
    inserirImagemNoConteudo(doc, 0, pngMetadeTransparente(), [100, 100, 300, 200]);
    expect(pixel(doc, 0, 120, 150)).toBeLessThan(50);
    expect(pixel(doc, 0, 280, 150)).toBeGreaterThan(200);
  });

  it("funciona com recursos herdados do nó pai sem apagar o texto", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 2, recursosHerdados: true }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(textoDaPagina(doc, 0)).toBe("Pagina 1");
    expect(textoDaPagina(doc, 1)).toBe("Pagina 2");
    expect(doc.findPage(1).get("Resources").isNull()).toBe(true);
  });

  it("funciona com conteúdo dividido em vários fluxos", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1, conteudoEmArray: true }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    expect(pixel(doc, 0, 150, 125)).toBeLessThan(50);
    expect(textoDaPagina(doc, 0)).toBe("Pagina 1");
  });

  it("aceita duas assinaturas na mesma página e o PDF.js lê o resultado", async () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    inserirImagemNoConteudo(doc, 0, pngPreto(), [100, 100, 200, 150]);
    inserirImagemNoConteudo(doc, 0, pngPreto(), [300, 300, 350, 350]);
    const reaberto = abrirDocumento(salvarDocumento(doc));
    expect(pixel(reaberto, 0, 150, 125)).toBeLessThan(50);
    expect(pixel(reaberto, 0, 325, 325)).toBeLessThan(50);
    expect((await lerComPdfJs(salvarDocumento(doc))).textos).toEqual(["Pagina 1"]);
  });

  it("recusa imagem ilegível ou retângulo fora da página sem criar passo de desfazer", () => {
    const doc = abrirDocumento(fabricarPdf({ paginas: 1 }));
    expect(() => inserirImagemNoConteudo(doc, 0, new Uint8Array([1, 2, 3]), [100, 100, 200, 150])).toThrow(ErroDocumento);
    expect(() => inserirImagemNoConteudo(doc, 0, pngPreto(), [500, 800, 700, 900])).toThrow(ErroDocumento);
    expect(doc.canUndo()).toBe(false);
  });
});
```

- [ ] **Step 4: Rodar os três e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/visual.test.ts test/texto.test.ts test/assinatura-imagem.test.ts`
Expected: FAIL, porque os três módulos não existem.

- [ ] **Step 5: Implementar `web/src/motor/visual.ts`**

```ts
import * as mupdf from "mupdf";
import { ErroDocumento, type Bytes, type ImagemRgba, type Retangulo } from "./tipos";

function conferirPagina(doc: mupdf.PDFDocument, pagina: number): void {
  if (!Number.isInteger(pagina) || pagina < 0 || pagina >= doc.countPages()) {
    throw new ErroDocumento(`A página ${pagina + 1} não existe neste documento.`);
  }
}

/** Desenha a página na escala pedida (1 equivale a 72 pontos por polegada) e devolve pixels RGBA prontos para um ImageData. */
export function renderizarPagina(doc: mupdf.PDFDocument, pagina: number, escala: number): ImagemRgba {
  conferirPagina(doc, pagina);
  const pix = doc.loadPage(pagina).toPixmap(mupdf.Matrix.scale(escala, escala), mupdf.ColorSpace.DeviceRGB, false, true);
  try {
    const largura = pix.getWidth();
    const altura = pix.getHeight();
    const passo = pix.getStride();
    const n = pix.getNumberOfComponents();
    const origem = pix.getPixels();
    const rgba = new Uint8ClampedArray(largura * altura * 4);
    for (let y = 0; y < altura; y++) {
      let o = y * passo;
      let d = y * largura * 4;
      for (let x = 0; x < largura; x++, o += n, d += 4) {
        rgba[d] = origem[o];
        rgba[d + 1] = origem[o + 1];
        rgba[d + 2] = origem[o + 2];
        rgba[d + 3] = 255;
      }
    }
    return { largura, altura, rgba };
  } finally {
    pix.destroy();
  }
}

/** Copia uma área da página como PNG, em resolução dobrada por padrão, para ficar nítida quando colada. */
export function copiarArea(doc: mupdf.PDFDocument, pagina: number, retangulo: Retangulo, escala = 2): Bytes {
  conferirPagina(doc, pagina);
  const [x0, y0, x1, y1] = retangulo;
  if (x1 - x0 < 1 || y1 - y0 < 1) throw new ErroDocumento("Selecione uma área maior.");
  const caixa: Retangulo = [Math.floor(x0 * escala), Math.floor(y0 * escala), Math.ceil(x1 * escala), Math.ceil(y1 * escala)];
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, caixa, false);
  pix.clear(255);
  const dispositivo = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  try {
    doc.loadPage(pagina).run(dispositivo, mupdf.Matrix.scale(escala, escala));
    dispositivo.close();
    return new Uint8Array(pix.asPNG());
  } finally {
    dispositivo.destroy();
    pix.destroy();
  }
}
```

- [ ] **Step 6: Implementar `web/src/motor/texto.ts`**

```ts
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
  const estrutura = doc.loadPage(pagina).toStructuredText("preserve-whitespace");
  try {
    return { quads: estrutura.highlight(de, ate, 1000), texto: estrutura.copy(de, ate) };
  } finally {
    estrutura.destroy();
  }
}

/** Ocorrências do termo na página. Cada ocorrência é uma lista de quads, porque um termo pode quebrar de linha. */
export function buscarNaPagina(doc: mupdf.PDFDocument, pagina: number, termo: string): Quad[][] {
  conferirPagina(doc, pagina);
  if (termo.trim() === "") return [];
  return doc.loadPage(pagina).search(termo, OPCOES_BUSCA);
}
```

- [ ] **Step 7: Implementar `web/src/motor/assinatura-imagem.ts`**

```ts
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
  const pg = doc.loadPage(pagina);
  const [x0, y0, x1, y1] = retangulo;
  const [bx0, by0, bx1, by1] = pg.getBounds();
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
    const objeto = pg.getObject();
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
    const matriz = mupdf.Matrix.concat([x1 - x0, 0, 0, -(y1 - y0), x0, y1], mupdf.Matrix.invert(pg.getTransform()));
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
```

- [ ] **Step 8: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/visual.test.ts test/texto.test.ts test/assinatura-imagem.test.ts && npx tsc --noEmit`
Expected: 16 testes PASS e `tsc` sem erros.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add web/src/motor/visual.ts web/src/motor/texto.ts web/src/motor/assinatura-imagem.ts web/test/visual.test.ts web/test/texto.test.ts web/test/assinatura-imagem.test.ts && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(motor): desenhar página, selecionar e buscar texto, assinatura por imagem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Worker, protocolo e cliente do motor

**Files:**
- Create: `web/src/motor/protocolo.ts`
- Create: `web/src/motor/servico.ts`
- Create: `web/src/motor/worker.ts`
- Create: `web/src/motor/cliente.ts`
- Test: `web/test/servico.test.ts`, `web/test/cliente.test.ts`

**Interfaces:**
- Consumes: todas as funções das Tasks 1 a 4, com os nomes listados nelas; `Grupo` (Task 3).
- Produces:
  - `protocolo.ts`: `type Pedido` (união discriminada por `tipo`), `interface Resultados` (tipo do resultado de cada `tipo`), `type Envelope = { id: number; pedido: Pedido }`, `type Resposta`, `type ErroSerializado`.
  - `servico.ts`: `class ServicoMotor { tratar(pedido: Pedido): { valor: unknown; transferir: Transferable[] } }`, `serializarErro(erro: unknown): ErroSerializado`.
  - `cliente.ts`: `interface CanalWorker`, `class Motor { constructor(canal: CanalWorker); static criar(): Motor; pedir<P extends Pedido>(pedido: P, transferir?: Transferable[]): Promise<Resultados[P["tipo"]]> }`, `desserializarErro(erro: ErroSerializado): Error`.
  - Tipos de pedido: `abrir`, `fechar`, `info`, `renderizar`, `selecionar`, `buscar`, `copiarArea`, `excluir`, `girar`, `reordenar`, `inserirBranco`, `inserirPdf`, `inserirImagem`, `cortar`, `assinarImagem`, `desfazer`, `refazer`, `extrair`, `separar`, `juntar`, `salvar`. Os que alteram o documento devolvem `InfoDocumento` atualizado.

- [ ] **Step 1: Criar `web/src/motor/protocolo.ts`**

```ts
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
```

- [ ] **Step 2: Escrever o teste do serviço, `web/test/servico.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { Resultados } from "../src/motor/protocolo";
import { ServicoMotor, serializarErro } from "../src/motor/servico";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";
import { lerComPdfJs } from "./leitor-independente";

function abrir(servico: ServicoMotor, paginas = 3) {
  return servico.tratar({ tipo: "abrir", bytes: fabricarPdf({ paginas }) }).valor as Resultados["abrir"];
}

describe("ServicoMotor", () => {
  it("abre, informa e fecha documentos por id", () => {
    const servico = new ServicoMotor();
    const { doc, info } = abrir(servico);
    expect(info.paginas).toBe(3);
    expect((servico.tratar({ tipo: "info", doc }).valor as Resultados["info"]).paginas).toBe(3);
    servico.tratar({ tipo: "fechar", doc });
    expect(() => servico.tratar({ tipo: "info", doc })).toThrow(ErroDocumento);
  });

  it("marca para transferência os pixels desenhados", () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico);
    const { valor, transferir } = servico.tratar({ tipo: "renderizar", doc, pagina: 0, escala: 0.25 });
    expect(transferir).toEqual([(valor as Resultados["renderizar"]).rgba.buffer]);
  });

  it("alterações devolvem a informação atualizada, e desfazer volta atrás", () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico);
    const depois = servico.tratar({ tipo: "excluir", doc, paginas: [0] }).valor as Resultados["excluir"];
    expect(depois.paginas).toBe(2);
    expect(depois.podeDesfazer).toBe(true);
    const desfeito = servico.tratar({ tipo: "desfazer", doc }).valor as Resultados["desfazer"];
    expect(desfeito.paginas).toBe(3);
    expect(desfeito.podeRefazer).toBe(true);
  });

  it("separa em vários arquivos e transfere todos", async () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico, 4);
    const { valor, transferir } = servico.tratar({
      tipo: "separar",
      doc,
      grupos: [
        { rotulo: "a", paginas: [0, 1] },
        { rotulo: "b", paginas: [2, 3] },
      ],
    });
    const partes = valor as Resultados["separar"];
    expect(transferir).toHaveLength(2);
    expect((await lerComPdfJs(partes[1].bytes)).textos).toEqual(["Pagina 3", "Pagina 4"]);
  });

  it("salva bytes que o PDF.js lê", async () => {
    const servico = new ServicoMotor();
    const { doc } = abrir(servico, 2);
    servico.tratar({ tipo: "girar", doc, paginas: [0], graus: 90 });
    const salvo = servico.tratar({ tipo: "salvar", doc }).valor as Resultados["salvar"];
    expect((await lerComPdfJs(salvo)).paginas).toBe(2);
  });
});

describe("serializarErro", () => {
  it("preserva o tipo de erro para atravessar o worker", () => {
    expect(serializarErro(new ErroSenha(true, 2))).toEqual({ tipo: "senha", tentativaErrada: true, arquivo: 2 });
    expect(serializarErro(new ErroDocumento("ruim"))).toEqual({ tipo: "documento", mensagem: "ruim" });
    expect(serializarErro(new Error("x"))).toEqual({ tipo: "interno", mensagem: "x" });
    expect(serializarErro("texto")).toEqual({ tipo: "interno", mensagem: "texto" });
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/servico.test.ts`
Expected: FAIL, porque `../src/motor/servico` não existe.

- [ ] **Step 4: Implementar `web/src/motor/servico.ts`**

```ts
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
```

- [ ] **Step 5: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/servico.test.ts`
Expected: 6 testes PASS.

- [ ] **Step 6: Escrever o teste do cliente, `web/test/cliente.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { Motor, type CanalWorker } from "../src/motor/cliente";
import type { Resposta } from "../src/motor/protocolo";
import { ServicoMotor, serializarErro } from "../src/motor/servico";
import { ErroDocumento, ErroSenha } from "../src/motor/tipos";
import { fabricarPdf } from "./fabrica";

/** Canal que imita o worker: responde de forma assíncrona, rodando o ServicoMotor no mesmo thread. */
function canalFalso(): CanalWorker {
  const servico = new ServicoMotor();
  const canal: CanalWorker = {
    onmessage: null,
    postMessage({ id, pedido }) {
      queueMicrotask(() => {
        let resposta: Resposta;
        try {
          resposta = { id, ok: true, valor: servico.tratar(pedido).valor };
        } catch (erro) {
          resposta = { id, ok: false, erro: serializarErro(erro) };
        }
        canal.onmessage?.({ data: resposta } as MessageEvent<Resposta>);
      });
    },
  };
  return canal;
}

describe("Motor", () => {
  it("faz a ida e volta com o tipo certo de resultado", async () => {
    const motor = new Motor(canalFalso());
    const { doc, info } = await motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ paginas: 2 }) });
    expect(info.paginas).toBe(2);
    const imagem = await motor.pedir({ tipo: "renderizar", doc, pagina: 0, escala: 0.25 });
    expect(imagem.rgba.length).toBe(imagem.largura * imagem.altura * 4);
  });

  it("entrega cada resposta a quem pediu, mesmo com pedidos simultâneos", async () => {
    const motor = new Motor(canalFalso());
    const [a, b] = await Promise.all([
      motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ paginas: 1 }) }),
      motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ paginas: 4 }) }),
    ]);
    expect([a.info.paginas, b.info.paginas]).toEqual([1, 4]);
  });

  it("reconstrói os erros do motor", async () => {
    const motor = new Motor(canalFalso());
    await expect(motor.pedir({ tipo: "abrir", bytes: fabricarPdf({ senhaAbertura: "x" }) })).rejects.toBeInstanceOf(ErroSenha);
    await expect(motor.pedir({ tipo: "info", doc: "nao-existe" })).rejects.toBeInstanceOf(ErroDocumento);
  });
});
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/cliente.test.ts`
Expected: FAIL, porque `../src/motor/cliente` não existe.

- [ ] **Step 8: Implementar `web/src/motor/cliente.ts`**

```ts
import type { Envelope, ErroSerializado, Pedido, Resposta, Resultados } from "./protocolo";
import { ErroDocumento, ErroSenha } from "./tipos";

/** O que o Motor precisa de um Worker. Nos testes, um objeto falso cumpre o mesmo papel. */
export interface CanalWorker {
  onmessage: ((evento: MessageEvent<Resposta>) => void) | null;
  postMessage(envelope: Envelope, transferir: Transferable[]): void;
}

interface Pendente {
  resolver: (valor: unknown) => void;
  rejeitar: (erro: Error) => void;
}

/** Lado da interface: manda pedidos ao worker e devolve promessas com o resultado já tipado. */
export class Motor {
  private readonly canal: CanalWorker;
  private readonly pendentes = new Map<number, Pendente>();
  private proximo = 1;

  constructor(canal: CanalWorker) {
    this.canal = canal;
    canal.onmessage = ({ data }) => {
      const pendente = this.pendentes.get(data.id);
      if (!pendente) return;
      this.pendentes.delete(data.id);
      if (data.ok) pendente.resolver(data.valor);
      else pendente.rejeitar(desserializarErro(data.erro));
    };
  }

  static criar(): Motor {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    return new Motor(worker as unknown as CanalWorker);
  }

  pedir<P extends Pedido>(pedido: P, transferir: Transferable[] = []): Promise<Resultados[P["tipo"]]> {
    const id = this.proximo++;
    return new Promise((resolver, rejeitar) => {
      this.pendentes.set(id, { resolver: resolver as (valor: unknown) => void, rejeitar });
      this.canal.postMessage({ id, pedido }, transferir);
    });
  }
}

export function desserializarErro(erro: ErroSerializado): Error {
  switch (erro.tipo) {
    case "senha":
      return new ErroSenha(erro.tentativaErrada, erro.arquivo);
    case "documento":
      return new ErroDocumento(erro.mensagem);
    case "interno":
      return new Error(erro.mensagem);
  }
}
```

- [ ] **Step 9: Implementar `web/src/motor/worker.ts`**

```ts
// Ponto de entrada do Web Worker do motor. Só faz a ponte entre mensagens e o ServicoMotor.
import type { Envelope, Resposta } from "./protocolo";

// O MuPDF.js procura o .wasm ao lado do próprio arquivo, mas depois do build do Vite esse caminho muda.
// O pacote só exporta o ponto de entrada principal, então o .wasm é apontado por caminho relativo, que o
// Vite reconhece e copia para o build. A configuração precisa existir antes de a biblioteca ser carregada.
const urlWasm = new URL("../../node_modules/mupdf/dist/mupdf-wasm.wasm", import.meta.url).href;
(globalThis as unknown as Record<string, unknown>)["$libmupdf_wasm_Module"] = { locateFile: () => urlWasm };

interface EscopoWorker {
  onmessage: ((evento: MessageEvent<Envelope>) => void) | null;
  postMessage(resposta: Resposta, transferir?: Transferable[]): void;
}

const escopo = self as unknown as EscopoWorker;
const pronto = import("./servico").then((m) => ({ servico: new m.ServicoMotor(), serializarErro: m.serializarErro }));

escopo.onmessage = async ({ data: { id, pedido } }) => {
  const { servico, serializarErro } = await pronto;
  try {
    const { valor, transferir } = servico.tratar(pedido);
    escopo.postMessage({ id, ok: true, valor }, transferir);
  } catch (erro) {
    escopo.postMessage({ id, ok: false, erro: serializarErro(erro) });
  }
};
```

- [ ] **Step 10: Rodar todos os testes web e a checagem de tipos**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run && npx tsc --noEmit`
Expected: todos os testes das Tasks 1 a 5 PASS (78 no total) e `tsc` sem erros.

- [ ] **Step 11: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add web/src/motor/protocolo.ts web/src/motor/servico.ts web/src/motor/worker.ts web/src/motor/cliente.ts web/test/servico.test.ts web/test/cliente.test.ts && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(motor): worker com protocolo tipado e cliente" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Lançador, servidor local seguro

**Files:**
- Create: `lancador/pyproject.toml`
- Create: `lancador/editor_pdf/__init__.py`, `lancador/editor_pdf/config.py`, `lancador/editor_pdf/estado.py`, `lancador/editor_pdf/servidor.py`
- Create: `lancador/tests/conftest.py`
- Test: `lancador/tests/test_servidor.py`

**Interfaces:**
- Consumes: nada da parte web; serve os arquivos de `web/dist/` (gerados na Task 10).
- Produces:
  - `config.py`: `RAIZ_PROJETO`, `RAIZ_WEB`, `pasta_dados() -> Path`, `CABECALHO_SEGREDO = "X-Editor-Segredo"`, `LIMITE_SEM_PULSO = 90.0`, `CARENCIA_INICIAL = 60.0`, `SAIDA_CEDO = 10.0`, `DIAS_VERSOES = 30`, `MAX_RECENTES = 15`.
  - `estado.py`: `RegistroArquivos.registrar(caminho) -> str`, `RegistroArquivos.caminho(ident) -> Path | None`, `FilaPendentes.adicionar(caminhos)`, `FilaPendentes.retirar_todos() -> list[Path]`, `Recentes(arquivo, limite).adicionar(caminho)`, `Recentes.listar() -> list[Path]`.
  - `servidor.py`: `Aplicacao` (dataclass com `raiz_web`, `dados`, `segredo`, `escolher_pdfs`, `escolher_destino`, `escolher_pasta`, `abrir_para_imprimir`, `registro`, `pastas`, `pendentes`, `recentes`, `ultimo_pulso`, `modo_pulso`, `encerrar`; método `descrever(caminho) -> {"id", "nome", "pasta"}`), `ServidorEditor(app, porta=0)` com `.porta`, tabela `ROTAS`.
  - Rotas desta task: `GET /` (index com segredo), estáticos, `GET /api/pendentes`, `POST /api/abrir-externo`, `POST /api/pulso`, `POST /api/dialogo/abrir`, `GET /api/arquivo/<id>`.

- [ ] **Step 1: Criar `lancador/pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Criar `lancador/editor_pdf/__init__.py` (vazio) e `lancador/editor_pdf/config.py`**

```python
"""Caminhos e constantes do lançador."""

from __future__ import annotations

import os
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parents[2]
RAIZ_WEB = RAIZ_PROJETO / "web" / "dist"

CABECALHO_SEGREDO = "X-Editor-Segredo"
LIMITE_SEM_PULSO = 90.0  # segundos sem sinal da página para considerar a janela fechada
CARENCIA_INICIAL = 60.0  # segundos para a janela abrir antes de qualquer decisão de encerrar
SAIDA_CEDO = 10.0  # se o Edge sair antes disso, ele entregou a janela a outro processo
DIAS_VERSOES = 30
MAX_RECENTES = 15


def pasta_dados() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    pasta = Path(base) / "EditorPDF"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta
```

- [ ] **Step 3: Criar `lancador/editor_pdf/estado.py`**

```python
"""Estado do lançador: arquivos conhecidos por id, fila de arquivos a abrir e lista de recentes."""

from __future__ import annotations

import json
import secrets
import threading
from pathlib import Path

from .config import MAX_RECENTES


class RegistroArquivos:
    """A página nunca manda caminhos de volta. Ela conhece só ids, e o lançador guarda o caminho de cada um."""

    def __init__(self) -> None:
        self._por_id: dict[str, Path] = {}
        self._por_caminho: dict[str, str] = {}
        self._trava = threading.Lock()

    def registrar(self, caminho: Path) -> str:
        absoluto = Path(caminho).resolve()
        chave = str(absoluto).lower()  # o Windows não diferencia maiúsculas em caminhos
        with self._trava:
            if chave not in self._por_caminho:
                ident = secrets.token_urlsafe(9)
                self._por_id[ident] = absoluto
                self._por_caminho[chave] = ident
            return self._por_caminho[chave]

    def caminho(self, ident: str) -> Path | None:
        with self._trava:
            return self._por_id.get(ident)


class FilaPendentes:
    """Arquivos que chegaram pelo "Abrir com" e ainda não foram buscados pela página."""

    def __init__(self) -> None:
        self._itens: list[Path] = []
        self._trava = threading.Lock()

    def adicionar(self, caminhos: list[Path]) -> None:
        with self._trava:
            self._itens.extend(Path(c) for c in caminhos)

    def retirar_todos(self) -> list[Path]:
        with self._trava:
            itens, self._itens = self._itens, []
            return itens


class Recentes:
    def __init__(self, arquivo: Path, limite: int = MAX_RECENTES) -> None:
        self._arquivo = arquivo
        self._limite = limite
        self._trava = threading.Lock()

    def _ler(self) -> list[str]:
        try:
            valor = json.loads(self._arquivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        return [str(v) for v in valor] if isinstance(valor, list) else []

    def adicionar(self, caminho: Path) -> None:
        atual = str(Path(caminho).resolve())
        with self._trava:
            lista = [atual] + [c for c in self._ler() if c.lower() != atual.lower()]
            self._arquivo.write_text(json.dumps(lista[: self._limite], ensure_ascii=False), encoding="utf-8")

    def listar(self) -> list[Path]:
        with self._trava:
            return [Path(c) for c in self._ler() if Path(c).is_file()]
```

- [ ] **Step 4: Criar `lancador/tests/conftest.py`**

```python
from __future__ import annotations

import http.client
import threading
from pathlib import Path

import pytest

from editor_pdf.servidor import Aplicacao, ServidorEditor

SEGREDO = "segredo-de-teste"


class Falsos:
    """Substitui os diálogos do Windows e a impressão, registrando o que foi pedido."""

    def __init__(self) -> None:
        self.pdfs: list[Path] = []
        self.destino: Path | None = None
        self.pasta: Path | None = None
        self.sugestoes: list[str] = []
        self.impressos: list[Path] = []

    def escolher_pdfs(self) -> list[Path]:
        return list(self.pdfs)

    def escolher_destino(self, nome: str) -> Path | None:
        self.sugestoes.append(nome)
        return self.destino

    def escolher_pasta(self) -> Path | None:
        return self.pasta

    def abrir_para_imprimir(self, caminho: Path) -> None:
        self.impressos.append(caminho)


@pytest.fixture
def web(tmp_path: Path) -> Path:
    raiz = tmp_path / "dist"
    (raiz / "assets").mkdir(parents=True)
    (raiz / "index.html").write_text("<html><head><title>x</title></head><body></body></html>", encoding="utf-8")
    (raiz / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (raiz / "assets" / "motor.wasm").write_bytes(b"\0asm")
    (tmp_path / "segredo.txt").write_text("não deve sair", encoding="utf-8")
    return raiz


@pytest.fixture
def falsos() -> Falsos:
    return Falsos()


@pytest.fixture
def app(tmp_path: Path, web: Path, falsos: Falsos) -> Aplicacao:
    dados = tmp_path / "dados"
    dados.mkdir()
    return Aplicacao(
        raiz_web=web,
        dados=dados,
        segredo=SEGREDO,
        escolher_pdfs=falsos.escolher_pdfs,
        escolher_destino=falsos.escolher_destino,
        escolher_pasta=falsos.escolher_pasta,
        abrir_para_imprimir=falsos.abrir_para_imprimir,
    )


@pytest.fixture
def servidor(app: Aplicacao):
    srv = ServidorEditor(app)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv
    srv.shutdown()
    srv.server_close()


@pytest.fixture
def pdf(tmp_path: Path) -> Path:
    """PDF falso num caminho com acento, espaço e parênteses, como os do Lucas."""
    pasta = tmp_path / "Área de trabalho"
    pasta.mkdir()
    caminho = pasta / "Petição Inicial (cópia).pdf"
    caminho.write_bytes(b"%PDF-1.7 original")
    return caminho


@pytest.fixture
def chamar(servidor: ServidorEditor):
    def _chamar(metodo, caminho, corpo=None, cabecalhos=None, segredo=SEGREDO, host=None):
        conexao = http.client.HTTPConnection("127.0.0.1", servidor.porta, timeout=5)
        enviados = dict(cabecalhos or {})
        if segredo is not None:
            enviados["X-Editor-Segredo"] = segredo
        if host is not None:
            enviados["Host"] = host
        conexao.request(metodo, caminho, body=corpo, headers=enviados)
        resposta = conexao.getresponse()
        dados = resposta.read()
        recebidos = {k.lower(): v for k, v in resposta.getheaders()}
        conexao.close()
        return resposta.status, recebidos, dados

    return _chamar
```

- [ ] **Step 5: Escrever o teste que falha, `lancador/tests/test_servidor.py`**

```python
from __future__ import annotations

import json
import time

from conftest import SEGREDO


def test_index_recebe_o_segredo_e_nao_tem_cors(chamar):
    status, cabecalhos, corpo = chamar("GET", "/", segredo=None)
    assert status == 200
    assert f'<meta name="editor-segredo" content="{SEGREDO}"></head>' in corpo.decode("utf-8")
    assert cabecalhos["cache-control"] == "no-store"
    assert "access-control-allow-origin" not in cabecalhos


def test_host_estranho_e_recusado_mesmo_com_segredo(chamar, servidor):
    assert chamar("GET", "/", host=f"site-malicioso.com:{servidor.porta}")[0] == 403
    assert chamar("GET", "/api/pendentes", host=f"site-malicioso.com:{servidor.porta}")[0] == 403
    assert chamar("GET", "/", host=f"localhost:{servidor.porta}")[0] == 200


def test_api_exige_o_segredo(chamar):
    assert chamar("GET", "/api/pendentes", segredo=None)[0] == 403
    assert chamar("GET", "/api/pendentes", segredo="errado")[0] == 403
    assert chamar("GET", "/api/pendentes")[0] == 200


def test_estaticos_com_tipo_certo(chamar):
    status, cabecalhos, _ = chamar("GET", "/assets/app.js", segredo=None)
    assert status == 200 and cabecalhos["content-type"].startswith("text/javascript")
    status, cabecalhos, _ = chamar("GET", "/assets/motor.wasm", segredo=None)
    assert status == 200 and cabecalhos["content-type"] == "application/wasm"


def test_estaticos_nao_saem_da_pasta(chamar):
    assert chamar("GET", "/../segredo.txt", segredo=None)[0] == 404
    assert chamar("GET", "/%2e%2e/segredo.txt", segredo=None)[0] == 404
    assert chamar("GET", "/assets/nao-existe.js", segredo=None)[0] == 404


def test_pendentes_saem_uma_vez_com_nome_acentuado(chamar, app, pdf):
    app.pendentes.adicionar([pdf])
    status, _, corpo = chamar("GET", "/api/pendentes")
    itens = json.loads(corpo)
    assert status == 200
    assert [i["nome"] for i in itens] == ["Petição Inicial (cópia).pdf"]
    assert itens[0]["pasta"].endswith("Área de trabalho")
    assert json.loads(chamar("GET", "/api/pendentes")[2]) == []


def test_le_arquivo_pelo_id_e_registra_nos_recentes(chamar, app, pdf):
    app.pendentes.adicionar([pdf])
    ident = json.loads(chamar("GET", "/api/pendentes")[2])[0]["id"]
    status, cabecalhos, corpo = chamar("GET", f"/api/arquivo/{ident}")
    assert status == 200 and corpo == b"%PDF-1.7 original"
    assert cabecalhos["content-type"] == "application/pdf"
    assert app.recentes.listar() == [pdf.resolve()]
    assert chamar("GET", "/api/arquivo/desconhecido")[0] == 404


def test_dialogo_de_abrir(chamar, falsos, pdf):
    falsos.pdfs = [pdf]
    itens = json.loads(chamar("POST", "/api/dialogo/abrir")[2])
    assert [i["nome"] for i in itens] == [pdf.name]


def test_abrir_externo_aceita_so_arquivos_que_existem(chamar, app, pdf, tmp_path):
    corpo = json.dumps({"caminhos": [str(pdf), str(tmp_path / "sumiu.pdf")]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo, {"Content-Type": "application/json"})[0] == 204
    assert app.pendentes.retirar_todos() == [pdf]


def test_abrir_externo_sem_janela_pede_encerramento(chamar, app, pdf):
    app.modo_pulso = True
    app.ultimo_pulso = time.monotonic() - 1000
    corpo = json.dumps({"caminhos": [str(pdf)]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo)[0] == 410
    assert app.encerrar.is_set()


def test_pulso_atualiza_o_ultimo_sinal(chamar, app):
    app.ultimo_pulso = 0.0
    assert chamar("POST", "/api/pulso")[0] == 204
    assert app.ultimo_pulso > 0.0
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_servidor.py -q`
Expected: FAIL na coleta, `ModuleNotFoundError: No module named 'editor_pdf.servidor'`.

- [ ] **Step 7: Implementar `lancador/editor_pdf/servidor.py`**

```python
"""Servidor HTTP local do editor.

Escuta só em 127.0.0.1, confere o cabeçalho Host (contra troca de DNS) e exige o segredo da sessão em toda
chamada /api. Não envia cabeçalhos CORS, então nenhum outro site consegue ler as respostas.
"""

from __future__ import annotations

import hmac
import json
import re
import threading
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable
from urllib.parse import unquote, urlsplit

from .config import CABECALHO_SEGREDO, LIMITE_SEM_PULSO
from .estado import FilaPendentes, Recentes, RegistroArquivos

# Tipos fixos: no Windows o módulo mimetypes lê o registro e às vezes devolve text/plain para .js.
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
}
LIMITE_CORPO = 1024 * 1024 * 1024


@dataclass
class Aplicacao:
    raiz_web: Path
    dados: Path
    segredo: str
    escolher_pdfs: Callable[[], list[Path]]
    escolher_destino: Callable[[str], Path | None]
    escolher_pasta: Callable[[], Path | None]
    abrir_para_imprimir: Callable[[Path], None]
    registro: RegistroArquivos = field(default_factory=RegistroArquivos)
    pastas: RegistroArquivos = field(default_factory=RegistroArquivos)
    pendentes: FilaPendentes = field(default_factory=FilaPendentes)
    recentes: Recentes = field(init=False)
    ultimo_pulso: float = field(default_factory=time.monotonic)
    modo_pulso: bool = False
    encerrar: threading.Event = field(default_factory=threading.Event)

    def __post_init__(self) -> None:
        self.recentes = Recentes(self.dados / "recentes.json")

    def descrever(self, caminho: Path) -> dict[str, str]:
        return {"id": self.registro.registrar(caminho), "nome": caminho.name, "pasta": str(caminho.parent)}


class ServidorEditor(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, app: Aplicacao, porta: int = 0) -> None:
        super().__init__(("127.0.0.1", porta), Manipulador)
        self.app = app

    @property
    def porta(self) -> int:
        return int(self.server_address[1])


class Manipulador(BaseHTTPRequestHandler):
    server: ServidorEditor
    protocol_version = "HTTP/1.1"

    def log_message(self, formato: str, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        self._despachar("GET")

    def do_PUT(self) -> None:
        self._despachar("PUT")

    def do_POST(self) -> None:
        self._despachar("POST")

    def do_DELETE(self) -> None:
        self._despachar("DELETE")

    # ---------------------------------------------------------------- despacho

    def _despachar(self, metodo: str) -> None:
        app = self.server.app
        porta = self.server.porta
        if self.headers.get("Host", "") not in (f"127.0.0.1:{porta}", f"localhost:{porta}"):
            self._texto(HTTPStatus.FORBIDDEN, "Host recusado.")
            return
        caminho = urlsplit(self.path).path
        if not caminho.startswith("/api/"):
            if metodo == "GET":
                self._estatico(caminho)
            else:
                self._texto(HTTPStatus.METHOD_NOT_ALLOWED, "Método não permitido.")
            return
        recebido = self.headers.get(CABECALHO_SEGREDO, "")
        if not hmac.compare_digest(recebido.encode("utf-8"), app.segredo.encode("utf-8")):
            self._texto(HTTPStatus.FORBIDDEN, "Segredo ausente ou errado.")
            return
        for metodo_rota, padrao, nome in ROTAS:
            achado = padrao.fullmatch(caminho)
            if achado and metodo_rota == metodo:
                try:
                    getattr(self, nome)(*(unquote(g) for g in achado.groups()))
                except ValueError as erro:
                    self._json(HTTPStatus.BAD_REQUEST, {"erro": str(erro)})
                return
        self._texto(HTTPStatus.NOT_FOUND, "Rota desconhecida.")

    # ---------------------------------------------------------------- respostas

    def _corpo(self) -> bytes:
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho < 0 or tamanho > LIMITE_CORPO:
            raise ValueError("Arquivo grande demais.")
        return self.rfile.read(tamanho)

    def _enviar(self, status: HTTPStatus, corpo: bytes, tipo: str) -> None:
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if status >= 400:
            # Em erro o corpo do pedido pode não ter sido lido; fechar a conexão evita ler lixo depois.
            self.send_header("Connection", "close")
            self.close_connection = True
        if status == HTTPStatus.NO_CONTENT:
            self.end_headers()
            return
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _texto(self, status: HTTPStatus, texto: str) -> None:
        self._enviar(status, texto.encode("utf-8"), "text/plain; charset=utf-8")

    def _json(self, status: HTTPStatus, valor: object) -> None:
        self._enviar(status, json.dumps(valor, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _bytes(self, dados: bytes, tipo: str = "application/pdf") -> None:
        self._enviar(HTTPStatus.OK, dados, tipo)

    def _vazio(self) -> None:
        self._enviar(HTTPStatus.NO_CONTENT, b"", "")

    def _estatico(self, caminho: str) -> None:
        app = self.server.app
        raiz = app.raiz_web.resolve()
        if caminho in ("", "/", "/index.html"):
            html = (raiz / "index.html").read_text(encoding="utf-8")
            meta = f'<meta name="editor-segredo" content="{app.segredo}">'
            self._enviar(HTTPStatus.OK, html.replace("</head>", meta + "</head>", 1).encode("utf-8"), TIPOS[".html"])
            return
        alvo = (raiz / unquote(caminho).lstrip("/")).resolve()
        if not alvo.is_relative_to(raiz) or not alvo.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        self._enviar(HTTPStatus.OK, alvo.read_bytes(), TIPOS.get(alvo.suffix.lower(), "application/octet-stream"))

    # ---------------------------------------------------------------- rotas

    def _api_pendentes(self) -> None:
        app = self.server.app
        self._json(HTTPStatus.OK, [app.descrever(c) for c in app.pendentes.retirar_todos()])

    def _api_abrir_externo(self) -> None:
        app = self.server.app
        if app.modo_pulso and time.monotonic() - app.ultimo_pulso > LIMITE_SEM_PULSO:
            # A janela foi fechada sem que o processo do Edge avisasse; este lançador sai e o novo assume.
            app.encerrar.set()
            self._texto(HTTPStatus.GONE, "Sem janela aberta.")
            return
        pedido = json.loads(self._corpo() or b"{}")
        app.pendentes.adicionar([Path(c) for c in pedido.get("caminhos", []) if Path(c).is_file()])
        self._vazio()

    def _api_pulso(self) -> None:
        self.server.app.ultimo_pulso = time.monotonic()
        self._vazio()

    def _api_dialogo_abrir(self) -> None:
        app = self.server.app
        self._json(HTTPStatus.OK, [app.descrever(c) for c in app.escolher_pdfs()])

    def _api_ler_arquivo(self, ident: str) -> None:
        app = self.server.app
        caminho = app.registro.caminho(ident)
        if caminho is None or not caminho.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        dados = caminho.read_bytes()
        app.recentes.adicionar(caminho)
        self._bytes(dados)


ROTAS: list[tuple[str, re.Pattern[str], str]] = [
    (metodo, re.compile(padrao), nome)
    for metodo, padrao, nome in [
        ("GET", r"/api/pendentes", "_api_pendentes"),
        ("POST", r"/api/abrir-externo", "_api_abrir_externo"),
        ("POST", r"/api/pulso", "_api_pulso"),
        ("POST", r"/api/dialogo/abrir", "_api_dialogo_abrir"),
        ("GET", r"/api/arquivo/([^/]+)", "_api_ler_arquivo"),
    ]
]
```

- [ ] **Step 8: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_servidor.py -q`
Expected: 11 passed.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add lancador/pyproject.toml lancador/editor_pdf/__init__.py lancador/editor_pdf/config.py lancador/editor_pdf/estado.py lancador/editor_pdf/servidor.py lancador/tests/conftest.py lancador/tests/test_servidor.py && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(lancador): servidor local com segredo de sessão e verificação de Host" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Lançador, gravação, rascunhos, recentes e impressão

**Files:**
- Create: `lancador/editor_pdf/arquivos.py`
- Modify: `lancador/editor_pdf/servidor.py` (import, tratamento de `ArquivoEmUso` em `_despachar`, rotas novas)
- Test: `lancador/tests/test_arquivos.py`, `lancador/tests/test_servidor_gravacao.py`

**Interfaces:**
- Consumes: `Aplicacao`, `ServidorEditor`, `ROTAS`, fixtures `chamar`, `app`, `falsos`, `pdf` (Task 6).
- Produces:
  - `arquivos.py`: `class ArquivoEmUso(Exception)`, `salvar_atomico(destino: Path, dados: bytes, pasta_versoes: Path | None = None, agora: datetime | None = None) -> Path | None` (devolve o backup criado), `limpar_antigos(pasta: Path, dias: int, agora: float | None = None) -> int`, `nome_seguro(nome: str, extensao: str = ".pdf") -> str`, `caminho_livre(pasta: Path, nome: str) -> Path`.
  - Rotas novas: `PUT /api/arquivo/<id>` (204; 409 com `{"erro"}` se em uso), `POST /api/salvar-como` (corpo = bytes, cabeçalho `X-Nome-Sugerido` codificado com `encodeURIComponent`; 200 com `{id,nome,pasta}` ou 204 se cancelado), `POST /api/dialogo/pasta` (200 `{id,nome,pasta}` ou 204), `PUT /api/pasta/<id>/<nome>` (200 `{nome}` final), `POST /api/imprimir` (204), `GET /api/recentes`, `GET /api/rascunhos` (`[{chave,nome,modificado}]`), `GET|PUT|DELETE /api/rascunho/<chave>` (PUT com cabeçalho `X-Nome-Arquivo` codificado), `GET|PUT /api/assinatura-imagem` (GET 404 se não houver).

- [ ] **Step 1: Escrever `lancador/tests/test_arquivos.py`**

```python
from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from pathlib import Path

import pytest

from editor_pdf.arquivos import ArquivoEmUso, caminho_livre, limpar_antigos, nome_seguro, salvar_atomico


def test_cria_arquivo_novo_sem_backup(tmp_path: Path):
    destino = tmp_path / "novo.pdf"
    assert salvar_atomico(destino, b"conteudo", tmp_path / "versoes") is None
    assert destino.read_bytes() == b"conteudo"


def test_guarda_a_versao_anterior_com_data_no_nome(pdf: Path, tmp_path: Path):
    versoes = tmp_path / "versoes"
    copia = salvar_atomico(pdf, b"%PDF novo", versoes, agora=datetime(2026, 10, 12, 9, 30, 0))
    assert pdf.read_bytes() == b"%PDF novo"
    assert copia == versoes / "2026-10-12_09-30-00 Petição Inicial (cópia).pdf"
    assert copia.read_bytes() == b"%PDF-1.7 original"


def test_backup_de_arquivo_antigo_nao_e_apagado_na_limpeza(pdf: Path, tmp_path: Path):
    antigo = time.time() - 400 * 86400
    os.utime(pdf, (antigo, antigo))
    copia = salvar_atomico(pdf, b"%PDF novo", tmp_path / "versoes")
    assert copia is not None
    assert limpar_antigos(tmp_path / "versoes", 30) == 0
    assert copia.exists()


@pytest.mark.skipif(sys.platform != "win32", reason="trava de arquivo do Windows")
def test_arquivo_aberto_em_outro_programa(pdf: Path, tmp_path: Path):
    versoes = tmp_path / "versoes"
    with open(pdf, "rb"):
        with pytest.raises(ArquivoEmUso) as erro:
            salvar_atomico(pdf, b"%PDF novo", versoes)
    assert "Petição Inicial (cópia).pdf" in str(erro.value)
    assert pdf.read_bytes() == b"%PDF-1.7 original"
    assert [p.name for p in pdf.parent.iterdir()] == [pdf.name]
    assert not versoes.exists() or list(versoes.iterdir()) == []


def test_limpa_so_o_que_passou_do_prazo(tmp_path: Path):
    velho, novo = tmp_path / "velho.pdf", tmp_path / "novo.pdf"
    velho.write_bytes(b"1")
    novo.write_bytes(b"2")
    antigo = time.time() - 31 * 86400
    os.utime(velho, (antigo, antigo))
    assert limpar_antigos(tmp_path, 30) == 1
    assert not velho.exists() and novo.exists()
    assert limpar_antigos(tmp_path / "nao-existe", 30) == 0


def test_nome_seguro():
    assert nome_seguro('Procuração: "João"/2026?.pdf') == "Procuração_ _João__2026_.pdf"
    assert nome_seguro("Contestação") == "Contestação.pdf"
    assert nome_seguro("CON") == "_CON.pdf"
    assert nome_seguro("   ") == "documento.pdf"
    assert nome_seguro(" nome. ") == "nome.pdf"


def test_caminho_livre(tmp_path: Path):
    assert caminho_livre(tmp_path, "a.pdf") == tmp_path / "a.pdf"
    (tmp_path / "a.pdf").write_bytes(b"")
    assert caminho_livre(tmp_path, "a.pdf") == tmp_path / "a (2).pdf"
    (tmp_path / "a (2).pdf").write_bytes(b"")
    assert caminho_livre(tmp_path, "a.pdf") == tmp_path / "a (3).pdf"
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_arquivos.py -q`
Expected: FAIL na coleta, `ModuleNotFoundError: No module named 'editor_pdf.arquivos'`.

- [ ] **Step 3: Implementar `lancador/editor_pdf/arquivos.py`**

```python
"""Gravação segura no disco: arquivo temporário e troca atômica, com cópia da versão anterior."""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import time
from datetime import datetime
from pathlib import Path

PROIBIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVADOS = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


class ArquivoEmUso(Exception):
    def __init__(self, caminho: Path) -> None:
        super().__init__(
            f'Não foi possível gravar "{caminho.name}". Ele está aberto em outro programa ou sem permissão de gravação. '
            "Feche o arquivo no outro programa ou salve com outro nome."
        )
        self.caminho = caminho


def salvar_atomico(
    destino: Path, dados: bytes, pasta_versoes: Path | None = None, agora: datetime | None = None
) -> Path | None:
    """Grava num temporário ao lado e só então troca pelo destino. Se houver pasta de versões, guarda antes a anterior."""
    destino = Path(destino)
    copia: Path | None = None
    if pasta_versoes is not None and destino.exists():
        pasta_versoes.mkdir(parents=True, exist_ok=True)
        carimbo = (agora or datetime.now()).strftime("%Y-%m-%d_%H-%M-%S")
        copia = caminho_livre(pasta_versoes, f"{carimbo} {destino.name}")
        shutil.copy2(destino, copia)
        os.utime(copia)  # o prazo de 30 dias conta da cópia, não da data do original
    descritor, temporario = tempfile.mkstemp(prefix=".editorpdf-", suffix=".tmp", dir=destino.parent)
    try:
        with os.fdopen(descritor, "wb") as saida:
            saida.write(dados)
            saida.flush()
            os.fsync(saida.fileno())
        try:
            os.replace(temporario, destino)
        except PermissionError as erro:
            raise ArquivoEmUso(destino) from erro
    except BaseException:
        Path(temporario).unlink(missing_ok=True)
        if copia is not None:
            copia.unlink(missing_ok=True)
        raise
    return copia


def limpar_antigos(pasta: Path, dias: int, agora: float | None = None) -> int:
    if not pasta.is_dir():
        return 0
    limite = (agora if agora is not None else time.time()) - dias * 86400
    removidos = 0
    for item in pasta.iterdir():
        if item.is_file() and item.stat().st_mtime < limite:
            try:
                item.unlink()
                removidos += 1
            except OSError:
                pass
    return removidos


def nome_seguro(nome: str, extensao: str = ".pdf") -> str:
    base = PROIBIDOS.sub("_", nome).strip().rstrip(". ")
    if base.lower().endswith(extensao):
        base = base[: -len(extensao)].rstrip(". ")
    base = base[:150] or "documento"
    if base.upper() in RESERVADOS:
        base = f"_{base}"
    return base + extensao


def caminho_livre(pasta: Path, nome: str) -> Path:
    alvo = pasta / nome
    if not alvo.exists():
        return alvo
    raiz, extensao = os.path.splitext(nome)
    n = 2
    while (pasta / f"{raiz} ({n}){extensao}").exists():
        n += 1
    return pasta / f"{raiz} ({n}){extensao}"
```

- [ ] **Step 4: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_arquivos.py -q`
Expected: 7 passed.

- [ ] **Step 5: Escrever `lancador/tests/test_servidor_gravacao.py`**

```python
from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.parse import quote

import pytest


def _id_de(chamar, app, caminho: Path) -> str:
    app.pendentes.adicionar([caminho])
    return json.loads(chamar("GET", "/api/pendentes")[2])[0]["id"]


def test_salvar_no_lugar_com_backup(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    assert chamar("PUT", f"/api/arquivo/{ident}", b"%PDF novo")[0] == 204
    assert pdf.read_bytes() == b"%PDF novo"
    copias = list((app.dados / "versoes").iterdir())
    assert len(copias) == 1 and copias[0].read_bytes() == b"%PDF-1.7 original"


@pytest.mark.skipif(sys.platform != "win32", reason="trava de arquivo do Windows")
def test_salvar_arquivo_em_uso_devolve_409(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    with open(pdf, "rb"):
        status, _, corpo = chamar("PUT", f"/api/arquivo/{ident}", b"%PDF novo")
    assert status == 409
    assert "Petição Inicial (cópia).pdf" in json.loads(corpo)["erro"]
    assert pdf.read_bytes() == b"%PDF-1.7 original"


def test_salvar_como(chamar, falsos, tmp_path):
    falsos.destino = tmp_path / "Área de trabalho 2" / "Petição (cópia).pdf"
    falsos.destino.parent.mkdir()
    status, _, corpo = chamar("POST", "/api/salvar-como", b"%PDF", {"X-Nome-Sugerido": quote("Petição (cópia)")})
    assert status == 200
    assert json.loads(corpo)["nome"] == "Petição (cópia).pdf"
    assert falsos.sugestoes == ["Petição (cópia)"]
    assert falsos.destino.read_bytes() == b"%PDF"


def test_salvar_como_cancelado(chamar, falsos):
    falsos.destino = None
    assert chamar("POST", "/api/salvar-como", b"%PDF")[0] == 204


def test_salvar_varios_numa_pasta_sem_sobrescrever(chamar, falsos, tmp_path):
    falsos.pasta = tmp_path / "Separados"
    falsos.pasta.mkdir()
    pasta = json.loads(chamar("POST", "/api/dialogo/pasta")[2])["id"]
    nome = quote("Procuração.pdf", safe="")
    assert json.loads(chamar("PUT", f"/api/pasta/{pasta}/{nome}", b"1")[2])["nome"] == "Procuração.pdf"
    assert json.loads(chamar("PUT", f"/api/pasta/{pasta}/{nome}", b"2")[2])["nome"] == "Procuração (2).pdf"
    assert chamar("PUT", f"/api/pasta/desconhecida/{nome}", b"3")[0] == 404


def test_rascunhos(chamar):
    assert chamar("PUT", "/api/rascunho/abc", b"%PDF r", {"X-Nome-Arquivo": quote("Petição.pdf")})[0] == 204
    lista = json.loads(chamar("GET", "/api/rascunhos")[2])
    assert [(r["chave"], r["nome"]) for r in lista] == [("abc", "Petição.pdf")]
    assert chamar("GET", "/api/rascunho/abc")[2] == b"%PDF r"
    assert chamar("DELETE", "/api/rascunho/abc")[0] == 204
    assert json.loads(chamar("GET", "/api/rascunhos")[2]) == []
    assert chamar("GET", "/api/rascunho/abc")[0] == 404
    assert chamar("PUT", f"/api/rascunho/{quote('a b')}", b"x")[0] == 400


def test_recentes_ignoram_arquivo_que_sumiu(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    chamar("GET", f"/api/arquivo/{ident}")
    assert [r["nome"] for r in json.loads(chamar("GET", "/api/recentes")[2])] == [pdf.name]
    pdf.unlink()
    assert json.loads(chamar("GET", "/api/recentes")[2]) == []


def test_imagem_da_assinatura(chamar):
    assert chamar("GET", "/api/assinatura-imagem")[0] == 404
    assert chamar("PUT", "/api/assinatura-imagem", b"\x89PNG teste")[0] == 204
    status, cabecalhos, corpo = chamar("GET", "/api/assinatura-imagem")
    assert status == 200 and corpo == b"\x89PNG teste" and cabecalhos["content-type"] == "image/png"


def test_imprimir_grava_copia_temporaria_e_entrega(chamar, app, falsos):
    assert chamar("POST", "/api/imprimir", b"%PDF imprimir")[0] == 204
    assert len(falsos.impressos) == 1
    assert falsos.impressos[0].parent == app.dados / "impressao"
    assert falsos.impressos[0].read_bytes() == b"%PDF imprimir"
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_servidor_gravacao.py -q`
Expected: FAIL, com 404 nas rotas novas.

- [ ] **Step 7: Alterar `lancador/editor_pdf/servidor.py`**

7a. Nos imports, logo depois de `from urllib.parse import unquote, urlsplit`, acrescentar:

```python
from datetime import datetime

from .arquivos import ArquivoEmUso, caminho_livre, nome_seguro, salvar_atomico
```

7b. Logo depois de `LIMITE_CORPO = 1024 * 1024 * 1024`, acrescentar:

```python
CHAVE_RASCUNHO = re.compile(r"[A-Za-z0-9_-]{1,64}")
```

7c. Em `_despachar`, trocar o bloco `try`/`except` por:

```python
                try:
                    getattr(self, nome)(*(unquote(g) for g in achado.groups()))
                except ArquivoEmUso as erro:
                    self._json(HTTPStatus.CONFLICT, {"erro": str(erro)})
                except ValueError as erro:
                    self._json(HTTPStatus.BAD_REQUEST, {"erro": str(erro)})
                return
```

7d. Acrescentar estes métodos à classe `Manipulador`, depois de `_api_ler_arquivo`:

```python
    def _api_salvar_arquivo(self, ident: str) -> None:
        app = self.server.app
        caminho = app.registro.caminho(ident)
        if caminho is None:
            self._texto(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        salvar_atomico(caminho, self._corpo(), app.dados / "versoes")
        self._vazio()

    def _api_salvar_como(self) -> None:
        app = self.server.app
        dados = self._corpo()
        sugerido = unquote(self.headers.get("X-Nome-Sugerido", "documento"))
        destino = app.escolher_destino(sugerido)
        if destino is None:
            self._vazio()
            return
        salvar_atomico(destino, dados, app.dados / "versoes")
        app.recentes.adicionar(destino)
        self._json(HTTPStatus.OK, app.descrever(destino))

    def _api_dialogo_pasta(self) -> None:
        app = self.server.app
        pasta = app.escolher_pasta()
        if pasta is None:
            self._vazio()
            return
        self._json(HTTPStatus.OK, {"id": app.pastas.registrar(pasta), "nome": pasta.name, "pasta": str(pasta)})

    def _api_salvar_na_pasta(self, ident: str, nome: str) -> None:
        app = self.server.app
        pasta = app.pastas.caminho(ident)
        if pasta is None or not pasta.is_dir():
            self._texto(HTTPStatus.NOT_FOUND, "Pasta não encontrada.")
            return
        destino = caminho_livre(pasta, nome_seguro(nome))
        salvar_atomico(destino, self._corpo())
        self._json(HTTPStatus.OK, {"nome": destino.name})

    def _api_imprimir(self) -> None:
        app = self.server.app
        pasta = app.dados / "impressao"
        pasta.mkdir(parents=True, exist_ok=True)
        destino = caminho_livre(pasta, f"impressao {datetime.now():%Y-%m-%d_%H-%M-%S}.pdf")
        salvar_atomico(destino, self._corpo())
        app.abrir_para_imprimir(destino)
        self._vazio()

    def _api_recentes(self) -> None:
        app = self.server.app
        self._json(HTTPStatus.OK, [app.descrever(c) for c in app.recentes.listar()])

    def _pasta_rascunhos(self) -> Path:
        pasta = self.server.app.dados / "rascunhos"
        pasta.mkdir(parents=True, exist_ok=True)
        return pasta

    @staticmethod
    def _conferir_chave(chave: str) -> None:
        if not CHAVE_RASCUNHO.fullmatch(chave):
            raise ValueError("Chave de rascunho inválida.")

    def _api_rascunhos(self) -> None:
        pasta = self._pasta_rascunhos()
        itens = []
        for meta in pasta.glob("*.json"):
            try:
                info = json.loads(meta.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if (pasta / f"{meta.stem}.pdf").is_file():
                itens.append({"chave": meta.stem, "nome": str(info.get("nome", "")), "modificado": str(info.get("modificado", ""))})
        itens.sort(key=lambda item: item["modificado"], reverse=True)
        self._json(HTTPStatus.OK, itens)

    def _api_ler_rascunho(self, chave: str) -> None:
        self._conferir_chave(chave)
        arquivo = self._pasta_rascunhos() / f"{chave}.pdf"
        if not arquivo.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Rascunho não encontrado.")
            return
        self._bytes(arquivo.read_bytes())

    def _api_guardar_rascunho(self, chave: str) -> None:
        self._conferir_chave(chave)
        pasta = self._pasta_rascunhos()
        nome = unquote(self.headers.get("X-Nome-Arquivo", "documento.pdf"))
        salvar_atomico(pasta / f"{chave}.pdf", self._corpo())
        meta = {"nome": nome, "modificado": datetime.now().isoformat(timespec="seconds")}
        (pasta / f"{chave}.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        self._vazio()

    def _api_apagar_rascunho(self, chave: str) -> None:
        self._conferir_chave(chave)
        pasta = self._pasta_rascunhos()
        (pasta / f"{chave}.pdf").unlink(missing_ok=True)
        (pasta / f"{chave}.json").unlink(missing_ok=True)
        self._vazio()

    def _api_ler_assinatura(self) -> None:
        arquivo = self.server.app.dados / "assinatura.png"
        if not arquivo.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Nenhuma assinatura cadastrada.")
            return
        self._bytes(arquivo.read_bytes(), "image/png")

    def _api_guardar_assinatura(self) -> None:
        salvar_atomico(self.server.app.dados / "assinatura.png", self._corpo())
        self._vazio()
```

7e. Trocar a lista de `ROTAS` inteira por:

```python
ROTAS: list[tuple[str, re.Pattern[str], str]] = [
    (metodo, re.compile(padrao), nome)
    for metodo, padrao, nome in [
        ("GET", r"/api/pendentes", "_api_pendentes"),
        ("POST", r"/api/abrir-externo", "_api_abrir_externo"),
        ("POST", r"/api/pulso", "_api_pulso"),
        ("POST", r"/api/dialogo/abrir", "_api_dialogo_abrir"),
        ("GET", r"/api/arquivo/([^/]+)", "_api_ler_arquivo"),
        ("PUT", r"/api/arquivo/([^/]+)", "_api_salvar_arquivo"),
        ("POST", r"/api/salvar-como", "_api_salvar_como"),
        ("POST", r"/api/dialogo/pasta", "_api_dialogo_pasta"),
        ("PUT", r"/api/pasta/([^/]+)/([^/]+)", "_api_salvar_na_pasta"),
        ("POST", r"/api/imprimir", "_api_imprimir"),
        ("GET", r"/api/recentes", "_api_recentes"),
        ("GET", r"/api/rascunhos", "_api_rascunhos"),
        ("GET", r"/api/rascunho/([^/]+)", "_api_ler_rascunho"),
        ("PUT", r"/api/rascunho/([^/]+)", "_api_guardar_rascunho"),
        ("DELETE", r"/api/rascunho/([^/]+)", "_api_apagar_rascunho"),
        ("GET", r"/api/assinatura-imagem", "_api_ler_assinatura"),
        ("PUT", r"/api/assinatura-imagem", "_api_guardar_assinatura"),
    ]
]
```

- [ ] **Step 8: Rodar todos os testes do lançador**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest -q`
Expected: 27 passed.

- [ ] **Step 9: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add lancador/editor_pdf/arquivos.py lancador/editor_pdf/servidor.py lancador/tests/test_arquivos.py lancador/tests/test_servidor_gravacao.py && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(lancador): salvar com troca atômica e backup, rascunhos, recentes e impressão" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Lançador, instância única, janela, diálogos e ponto de entrada

**Files:**
- Create: `lancador/editor_pdf/instancia.py`, `lancador/editor_pdf/janela.py`, `lancador/editor_pdf/dialogos.py`, `lancador/editor_pdf/principal.py`
- Create: `lancador/editor_pdf.pyw`
- Test: `lancador/tests/test_instancia.py`, `lancador/tests/test_janela_dialogos.py`, `lancador/tests/test_principal.py`

**Interfaces:**
- Consumes: `Aplicacao`, `ServidorEditor` (Tasks 6 e 7); `limpar_antigos` (Task 7); constantes de `config.py` (Task 6).
- Produces:
  - `instancia.py`: `registrar(dados, porta, segredo)`, `remover(dados)`, `encaminhar_se_aberto(dados, caminhos, espera=2.0) -> bool`.
  - `janela.py`: `localizar_edge() -> Path | None`, `comando_janela(edge, url, perfil) -> list[str]`, `abrir_janela(edge, url, perfil) -> subprocess.Popen`, `comando_imprimir(edge, pdf) -> list[str]`, `abrir_para_imprimir(pdf)`.
  - `dialogos.py`: `escolher_pdfs(executar=...) -> list[Path]`, `escolher_destino(nome, executar=...) -> Path | None`, `escolher_pasta(executar=...) -> Path | None`, `avisar(mensagem, executar=...)`.
  - `principal.py`: `deve_encerrar(agora, inicio, ultimo_pulso, janela_viva, modo_pulso) -> bool`, `main(argv) -> int`.

- [ ] **Step 1: Escrever `lancador/tests/test_instancia.py`**

```python
from __future__ import annotations

import socket
import time

from conftest import SEGREDO
from editor_pdf import instancia


def test_encaminha_para_o_editor_aberto(app, servidor, pdf):
    instancia.registrar(app.dados, servidor.porta, SEGREDO)
    assert instancia.encaminhar_se_aberto(app.dados, [pdf]) is True
    assert app.pendentes.retirar_todos() == [pdf]


def test_sem_registro_nao_encaminha(tmp_path):
    assert instancia.encaminhar_se_aberto(tmp_path, []) is False


def test_registro_velho_de_porta_fechada_nao_encaminha(tmp_path):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]
    instancia.registrar(tmp_path, porta, "qualquer")
    inicio = time.monotonic()
    assert instancia.encaminhar_se_aberto(tmp_path, []) is False
    assert time.monotonic() - inicio < 3


def test_editor_sem_janela_recusa_e_se_encerra(app, servidor, pdf):
    app.modo_pulso = True
    app.ultimo_pulso = time.monotonic() - 1000
    instancia.registrar(app.dados, servidor.porta, SEGREDO)
    assert instancia.encaminhar_se_aberto(app.dados, [pdf]) is False
    assert app.encerrar.is_set()


def test_remover(tmp_path):
    instancia.registrar(tmp_path, 1234, "x")
    instancia.remover(tmp_path)
    assert not (tmp_path / "instancia.json").exists()
```

- [ ] **Step 2: Escrever `lancador/tests/test_janela_dialogos.py`**

```python
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from editor_pdf import dialogos, janela

LANCADOR = Path(__file__).resolve().parents[1]


def test_comando_da_janela_sem_barra_e_com_perfil_proprio(tmp_path):
    edge = Path(r"C:\Edge\msedge.exe")
    comando = janela.comando_janela(edge, "http://127.0.0.1:5000/", tmp_path / "perfil")
    assert comando[0] == str(edge)
    assert "--app=http://127.0.0.1:5000/" in comando
    assert f"--user-data-dir={tmp_path / 'perfil'}" in comando
    assert "--no-first-run" in comando


def test_localiza_o_edge_pelas_pastas_do_windows(tmp_path, monkeypatch):
    falso = tmp_path / "Microsoft" / "Edge" / "Application" / "msedge.exe"
    falso.parent.mkdir(parents=True)
    falso.write_bytes(b"")
    monkeypatch.setenv("ProgramFiles(x86)", str(tmp_path / "nada"))
    monkeypatch.setenv("ProgramFiles", str(tmp_path))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "nada"))
    assert janela.localizar_edge() == falso


def test_comando_de_imprimir():
    assert janela.comando_imprimir(Path("msedge.exe"), Path(r"C:\x\a b.pdf")) == ["msedge.exe", r"C:\x\a b.pdf"]


def test_dialogos_convertem_a_resposta_do_processo():
    assert dialogos.escolher_pdfs(executar=lambda acao, arg: [r"C:\x\Petição.pdf"]) == [Path(r"C:\x\Petição.pdf")]
    assert dialogos.escolher_pdfs(executar=lambda acao, arg: None) == []
    assert dialogos.escolher_destino("a", executar=lambda acao, arg: r"C:\x\a.pdf") == Path(r"C:\x\a.pdf")
    assert dialogos.escolher_destino("a", executar=lambda acao, arg: None) is None
    assert dialogos.escolher_pasta(executar=lambda acao, arg: None) is None


def test_processo_de_dialogo_recusa_acao_desconhecida_sem_abrir_janela():
    resultado = subprocess.run(
        [sys.executable, "-m", "editor_pdf.dialogos", "acao-que-nao-existe"], cwd=LANCADOR, capture_output=True, timeout=20
    )
    assert resultado.returncode == 2
```

- [ ] **Step 3: Escrever `lancador/tests/test_principal.py`**

```python
from __future__ import annotations

from editor_pdf.config import CARENCIA_INICIAL, LIMITE_SEM_PULSO
from editor_pdf.principal import deve_encerrar

INICIO = 1000.0


def test_nunca_encerra_com_a_janela_viva():
    assert deve_encerrar(INICIO + 10_000, INICIO, INICIO, janela_viva=True, modo_pulso=False) is False


def test_encerra_quando_a_janela_fecha_normalmente():
    assert deve_encerrar(INICIO + 300, INICIO, INICIO + 295, janela_viva=False, modo_pulso=False) is True


def test_em_modo_pulso_espera_a_carencia_e_o_silencio():
    agora = INICIO + CARENCIA_INICIAL - 1
    assert deve_encerrar(agora, INICIO, INICIO - 500, janela_viva=False, modo_pulso=True) is False
    agora = INICIO + CARENCIA_INICIAL + 1
    assert deve_encerrar(agora, INICIO, agora - 5, janela_viva=False, modo_pulso=True) is False
    assert deve_encerrar(agora, INICIO, agora - LIMITE_SEM_PULSO - 1, janela_viva=False, modo_pulso=True) is True
```

- [ ] **Step 4: Rodar os três e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_instancia.py tests/test_janela_dialogos.py tests/test_principal.py -q`
Expected: FAIL na coleta, módulos inexistentes.

- [ ] **Step 5: Implementar `lancador/editor_pdf/instancia.py`**

```python
"""Garante uma janela só: se o editor já está aberto, a segunda chamada entrega os arquivos a ele e encerra.

O arquivo instancia.json guarda porta e segredo. Ele fica em LOCALAPPDATA, que só o próprio usuário lê.
"""

from __future__ import annotations

import http.client
import json
import os
from pathlib import Path

from .config import CABECALHO_SEGREDO


def _arquivo(dados: Path) -> Path:
    return dados / "instancia.json"


def registrar(dados: Path, porta: int, segredo: str) -> None:
    conteudo = {"porta": porta, "segredo": segredo, "pid": os.getpid()}
    _arquivo(dados).write_text(json.dumps(conteudo), encoding="utf-8")


def remover(dados: Path) -> None:
    _arquivo(dados).unlink(missing_ok=True)


def encaminhar_se_aberto(dados: Path, caminhos: list[Path], espera: float = 2.0) -> bool:
    try:
        info = json.loads(_arquivo(dados).read_text(encoding="utf-8"))
        porta, segredo = int(info["porta"]), str(info["segredo"])
    except (OSError, ValueError, KeyError, TypeError):
        return False
    corpo = json.dumps({"caminhos": [str(c) for c in caminhos]}).encode("utf-8")
    conexao = http.client.HTTPConnection("127.0.0.1", porta, timeout=espera)
    try:
        conexao.request(
            "POST",
            "/api/abrir-externo",
            body=corpo,
            headers={CABECALHO_SEGREDO: segredo, "Content-Type": "application/json"},
        )
        return conexao.getresponse().status == 204
    except OSError:
        return False
    finally:
        conexao.close()
```

- [ ] **Step 6: Implementar `lancador/editor_pdf/janela.py`**

```python
"""Abre o editor numa janela do Edge sem barra de endereço e entrega PDFs ao Edge para imprimir."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path


def localizar_edge() -> Path | None:
    candidatos = [
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    return next((c for c in candidatos if c.is_file()), None)


def comando_janela(edge: Path, url: str, perfil: Path) -> list[str]:
    # Perfil próprio: a janela não se mistura com o Edge do dia a dia, e o processo termina quando ela fecha.
    return [
        str(edge),
        f"--app={url}",
        f"--user-data-dir={perfil}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-mode",
        "--disable-features=Translate",
    ]


def abrir_janela(edge: Path, url: str, perfil: Path) -> subprocess.Popen:
    perfil.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen(comando_janela(edge, url, perfil))


def comando_imprimir(edge: Path, pdf: Path) -> list[str]:
    return [str(edge), str(pdf)]


def abrir_para_imprimir(pdf: Path) -> None:
    edge = localizar_edge()
    if edge is not None:
        subprocess.Popen(comando_imprimir(edge, pdf))
    else:
        os.startfile(pdf)  # noqa: S606 (abre no leitor padrão do Windows)
```

- [ ] **Step 7: Implementar `lancador/editor_pdf/dialogos.py`**

```python
"""Janelas de abrir, salvar e escolher pasta do Windows, e avisos de erro.

Rodam num processo separado para não misturar o Tk com as threads do servidor. A resposta volta como
JSON com escape ASCII, para que caminhos acentuados não dependam da codificação do console.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Callable

LANCADOR = Path(__file__).resolve().parents[1]
ACOES = {"abrir", "salvar", "pasta", "aviso"}

Executor = Callable[[str, str], object]


def _executar(acao: str, argumento: str = "") -> object:
    resultado = subprocess.run(
        [sys.executable, "-m", "editor_pdf.dialogos", acao, argumento],
        cwd=LANCADOR,
        capture_output=True,
        text=True,
        encoding="utf-8",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if resultado.returncode != 0:
        return None
    return json.loads(resultado.stdout or "null")


def escolher_pdfs(executar: Executor = _executar) -> list[Path]:
    valor = executar("abrir", "")
    return [Path(c) for c in valor] if isinstance(valor, list) else []


def escolher_destino(nome_sugerido: str, executar: Executor = _executar) -> Path | None:
    valor = executar("salvar", nome_sugerido)
    return Path(valor) if isinstance(valor, str) and valor else None


def escolher_pasta(executar: Executor = _executar) -> Path | None:
    valor = executar("pasta", "")
    return Path(valor) if isinstance(valor, str) and valor else None


def avisar(mensagem: str, executar: Executor = _executar) -> None:
    executar("aviso", mensagem)


def _principal(acao: str, argumento: str) -> None:
    if acao not in ACOES:
        raise SystemExit(2)
    import tkinter as tk
    from tkinter import filedialog, messagebox

    raiz = tk.Tk()
    raiz.withdraw()
    raiz.attributes("-topmost", True)
    try:
        if acao == "abrir":
            saida: object = list(
                filedialog.askopenfilenames(
                    parent=raiz, title="Abrir PDF", filetypes=[("PDF", "*.pdf"), ("Todos os arquivos", "*.*")]
                )
            )
        elif acao == "salvar":
            saida = (
                filedialog.asksaveasfilename(
                    parent=raiz, title="Salvar como", initialfile=argumento, defaultextension=".pdf", filetypes=[("PDF", "*.pdf")]
                )
                or None
            )
        elif acao == "pasta":
            saida = filedialog.askdirectory(parent=raiz, title="Escolha a pasta") or None
        else:
            messagebox.showerror("Editor PDF", argumento, parent=raiz)
            saida = None
    finally:
        raiz.destroy()
    sys.stdout.write(json.dumps(saida))


if __name__ == "__main__":
    _principal(sys.argv[1] if len(sys.argv) > 1 else "", sys.argv[2] if len(sys.argv) > 2 else "")
```

- [ ] **Step 8: Implementar `lancador/editor_pdf/principal.py`**

```python
"""Ponto de entrada: abre o servidor e a janela, e encerra tudo quando a janela fecha."""

from __future__ import annotations

import secrets
import threading
import time
from pathlib import Path

from . import dialogos, instancia, janela
from .arquivos import limpar_antigos
from .config import CARENCIA_INICIAL, DIAS_VERSOES, LIMITE_SEM_PULSO, RAIZ_WEB, SAIDA_CEDO, pasta_dados
from .servidor import Aplicacao, ServidorEditor


def deve_encerrar(agora: float, inicio: float, ultimo_pulso: float, janela_viva: bool, modo_pulso: bool) -> bool:
    """Decide se o lançador sai.

    Com o processo do Edge vivo, nunca: janela minimizada atrasa os sinais da página, e isso não é fechamento.
    Se o Edge saiu depois de abrir a janela normalmente, a janela fechou. Se saiu logo no começo (modo pulso),
    o Edge entregou a janela a outro processo, e só o silêncio da página indica que ela fechou.
    """
    if janela_viva:
        return False
    if not modo_pulso:
        return True
    return agora - inicio > CARENCIA_INICIAL and agora - ultimo_pulso > LIMITE_SEM_PULSO


def main(argv: list[str]) -> int:
    dados = pasta_dados()
    caminhos = [Path(a) for a in argv[1:] if Path(a).is_file()]
    if instancia.encaminhar_se_aberto(dados, caminhos):
        return 0
    edge = janela.localizar_edge()
    if edge is None:
        dialogos.avisar("O Microsoft Edge não foi encontrado. O editor usa o Edge para abrir a janela.")
        return 1
    if not (RAIZ_WEB / "index.html").is_file():
        dialogos.avisar("O editor ainda não foi compilado. Rode 'npm run build' na pasta web.")
        return 1
    limpar_antigos(dados / "versoes", DIAS_VERSOES)
    limpar_antigos(dados / "impressao", 1)
    app = Aplicacao(
        raiz_web=RAIZ_WEB,
        dados=dados,
        segredo=secrets.token_urlsafe(32),
        escolher_pdfs=dialogos.escolher_pdfs,
        escolher_destino=dialogos.escolher_destino,
        escolher_pasta=dialogos.escolher_pasta,
        abrir_para_imprimir=janela.abrir_para_imprimir,
    )
    app.pendentes.adicionar(caminhos)
    servidor = ServidorEditor(app)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    instancia.registrar(dados, servidor.porta, app.segredo)
    inicio = time.monotonic()
    processo = janela.abrir_janela(edge, f"http://127.0.0.1:{servidor.porta}/", dados / "perfil-edge")
    saida_do_edge: float | None = None
    try:
        while not app.encerrar.is_set():
            time.sleep(1)
            agora = time.monotonic()
            if saida_do_edge is None and processo.poll() is not None:
                saida_do_edge = agora
                app.modo_pulso = saida_do_edge - inicio < SAIDA_CEDO
            if deve_encerrar(agora, inicio, app.ultimo_pulso, saida_do_edge is None, app.modo_pulso):
                break
    finally:
        instancia.remover(dados)
        servidor.shutdown()
        servidor.server_close()
        if processo.poll() is None:
            processo.terminate()
    return 0
```

- [ ] **Step 9: Criar `lancador/editor_pdf.pyw`**

```python
"""Atalho para rodar o editor com pythonw.exe, sem janela de console."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from editor_pdf.principal import main  # noqa: E402

raise SystemExit(main(sys.argv))
```

- [ ] **Step 10: Rodar todos os testes do lançador**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest -q`
Expected: 40 passed.

- [ ] **Step 11: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add lancador/editor_pdf/instancia.py lancador/editor_pdf/janela.py lancador/editor_pdf/dialogos.py lancador/editor_pdf/principal.py lancador/editor_pdf.pyw lancador/tests/test_instancia.py lancador/tests/test_janela_dialogos.py lancador/tests/test_principal.py && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(lancador): instância única, janela do Edge, diálogos e ponto de entrada" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Registro no "Abrir com" e atalho na área de trabalho

**Files:**
- Create: `lancador/editor_pdf/registro.py`
- Create: `lancador/instalar.py`, `lancador/desinstalar.py`
- Test: `lancador/tests/test_registro.py`

**Interfaces:**
- Consumes: `lancador/editor_pdf.pyw` (Task 8).
- Produces: `registro.py` com `PROGID = "EditorPDF.Documento"`, `NOME = "Editor PDF"`, `entradas(pythonw: Path, script: Path) -> list[tuple[str, str, str]]` (subchave de HKCU, nome do valor, dado), `chaves_a_remover() -> list[str]` (da mais funda para a mais rasa), `valores_a_remover() -> list[tuple[str, str]]`.

- [ ] **Step 1: Escrever `lancador/tests/test_registro.py`**

```python
from __future__ import annotations

from pathlib import Path

from editor_pdf.registro import NOME, PROGID, chaves_a_remover, entradas, valores_a_remover


def test_entradas_do_abrir_com():
    pythonw = Path(r"C:\Users\lucas\AppData\Local\Programs\Python\Python313\pythonw.exe")
    script = Path(r"C:\Users\lucas\Downloads\editor-pdf\lancador\editor_pdf.pyw")
    lista = entradas(pythonw, script)
    comando = f'"{pythonw}" "{script}" "%1"'
    assert (rf"Software\Classes\{PROGID}\shell\open\command", "", comando) in lista
    assert (rf"Software\Classes\{PROGID}\shell\open", "FriendlyAppName", NOME) in lista
    assert (r"Software\Classes\.pdf\OpenWithProgids", PROGID, "") in lista
    assert all(chave.startswith("Software\\Classes\\") for chave, _, _ in lista)


def test_caminho_com_espaco_e_acento_fica_entre_aspas():
    lista = entradas(Path(r"C:\Program Files\Python\pythonw.exe"), Path(r"C:\Área de trabalho\editor_pdf.pyw"))
    comando = next(dado for chave, _, dado in lista if chave.endswith(r"\command"))
    assert comando == r'"C:\Program Files\Python\pythonw.exe" "C:\Área de trabalho\editor_pdf.pyw" "%1"'


def test_remocao_apaga_so_o_que_e_do_editor():
    chaves = chaves_a_remover()
    assert chaves[0].endswith(r"\shell\open\command")
    assert chaves[-1] == rf"Software\Classes\{PROGID}"
    assert valores_a_remover() == [(r"Software\Classes\.pdf\OpenWithProgids", PROGID)]
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_registro.py -q`
Expected: FAIL na coleta, módulo inexistente.

- [ ] **Step 3: Implementar `lancador/editor_pdf/registro.py`**

```python
"""Entradas do registro do Windows para o editor aparecer no "Abrir com" dos PDFs.

Tudo fica em HKEY_CURRENT_USER, sem administrador, e o leitor padrão de PDF não muda.
"""

from __future__ import annotations

from pathlib import Path

PROGID = "EditorPDF.Documento"
NOME = "Editor PDF"
BASE = r"Software\Classes"


def entradas(pythonw: Path, script: Path) -> list[tuple[str, str, str]]:
    comando = f'"{pythonw}" "{script}" "%1"'
    return [
        (rf"{BASE}\{PROGID}", "", f"Documento PDF ({NOME})"),
        (rf"{BASE}\{PROGID}\shell\open", "FriendlyAppName", NOME),
        (rf"{BASE}\{PROGID}\shell\open\command", "", comando),
        (rf"{BASE}\.pdf\OpenWithProgids", PROGID, ""),
    ]


def chaves_a_remover() -> list[str]:
    return [
        rf"{BASE}\{PROGID}\shell\open\command",
        rf"{BASE}\{PROGID}\shell\open",
        rf"{BASE}\{PROGID}\shell",
        rf"{BASE}\{PROGID}",
    ]


def valores_a_remover() -> list[tuple[str, str]]:
    return [(rf"{BASE}\.pdf\OpenWithProgids", PROGID)]
```

- [ ] **Step 4: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/lancador && python -m pytest tests/test_registro.py -q`
Expected: 3 passed.

- [ ] **Step 5: Criar `lancador/instalar.py`**

```python
"""Põe o Editor PDF no "Abrir com" dos PDFs e cria o atalho na área de trabalho. Desfazer: desinstalar.py."""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import winreg
from pathlib import Path

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA))

from editor_pdf.registro import NOME, entradas  # noqa: E402

SCRIPT = PASTA / "editor_pdf.pyw"
CRIAR_ATALHO = (
    "$d=[Environment]::GetFolderPath('Desktop');"
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d ($env:ED_NOME+'.lnk')));"
    "$s.TargetPath=$env:ED_ALVO;$s.Arguments='\"'+$env:ED_SCRIPT+'\"';$s.WorkingDirectory=$env:ED_PASTA;$s.Save()"
)


def pythonw() -> Path:
    candidato = Path(sys.executable).with_name("pythonw.exe")
    return candidato if candidato.is_file() else Path(sys.executable)


def main() -> None:
    for chave, nome, dado in entradas(pythonw(), SCRIPT):
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, chave) as aberta:
            winreg.SetValueEx(aberta, nome, 0, winreg.REG_SZ, dado)
    # Os caminhos vão por variável de ambiente para não depender de aspas dentro do comando do PowerShell.
    ambiente = {**os.environ, "ED_NOME": NOME, "ED_ALVO": str(pythonw()), "ED_SCRIPT": str(SCRIPT), "ED_PASTA": str(PASTA)}
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", CRIAR_ATALHO], check=True, env=ambiente)
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)  # avisa o Explorer que as associações mudaram
    print(f'Pronto. "{NOME}" aparece no "Abrir com" dos PDFs e tem atalho na área de trabalho.')


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Criar `lancador/desinstalar.py`**

```python
"""Desfaz o que instalar.py fez: tira o editor do "Abrir com" e apaga o atalho."""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import winreg
from pathlib import Path

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA))

from editor_pdf.registro import NOME, chaves_a_remover, valores_a_remover  # noqa: E402

APAGAR_ATALHO = (
    "$d=[Environment]::GetFolderPath('Desktop');"
    "$a=Join-Path $d ($env:ED_NOME+'.lnk');if(Test-Path $a){Remove-Item $a}"
)


def main() -> None:
    for chave, nome in valores_a_remover():
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, chave, 0, winreg.KEY_SET_VALUE) as aberta:
                winreg.DeleteValue(aberta, nome)
        except FileNotFoundError:
            pass
    for chave in chaves_a_remover():
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, chave)
        except FileNotFoundError:
            pass
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", APAGAR_ATALHO],
        check=True,
        env={**os.environ, "ED_NOME": NOME},
    )
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    print(f'"{NOME}" saiu do "Abrir com" e o atalho foi apagado.')


if __name__ == "__main__":
    main()
```

- [ ] **Step 7: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add lancador/editor_pdf/registro.py lancador/instalar.py lancador/desinstalar.py lancador/tests/test_registro.py && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat(lancador): registro no Abrir com e atalho na área de trabalho" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

A execução de `instalar.py` fica para a Task 10, depois da confirmação do Lucas, porque grava no registro do Windows dele.

---

### Task 10: Plataforma do PC e página de prova, de ponta a ponta

**Files:**
- Create: `web/src/plataforma/tipos.ts`
- Create: `web/src/plataforma/pc.ts`
- Create: `web/index.html`
- Create: `web/src/prova/principal.ts`
- Create: `web/test/gerar-amostra.ts`
- Test: `web/test/plataforma-pc.test.ts`

**Interfaces:**
- Consumes: `Motor` (Task 5); rotas do lançador (Tasks 6 e 7); `fabricarPdf` (Task 1).
- Produces:
  - `plataforma/tipos.ts`: `interface ArquivoAberto { id: string; nome: string; pasta: string }`, `interface Rascunho { chave: string; nome: string; modificado: string }`, `interface Capacidades { abas; camera; assinaturaA3; salvarNoLugar }`, `interface Plataforma` (métodos abaixo), `class ErroArquivoEmUso extends Error`.
  - `Plataforma`: `pendentes()`, `escolherArquivos()`, `ler(id)`, `salvar(id, bytes)`, `salvarComo(nomeSugerido, bytes)`, `escolherPasta()`, `salvarNaPasta(pasta, nome, bytes)`, `imprimir(bytes)`, `recentes()`, `guardarRascunho(chave, nome, bytes)`, `rascunhos()`, `lerRascunho(chave)`, `apagarRascunho(chave)`, `imagemAssinatura()`, `guardarImagemAssinatura(png)`, `pulso()`.
  - `plataforma/pc.ts`: `class PlataformaPc implements Plataforma` com `constructor(segredo: string, buscar?: typeof fetch)` e `static daPagina(): PlataformaPc`.

- [ ] **Step 1: Criar `web/src/plataforma/tipos.ts`**

```ts
import type { Bytes } from "../motor/tipos";

export interface ArquivoAberto {
  id: string;
  nome: string;
  pasta: string;
}

export interface Rascunho {
  chave: string;
  nome: string;
  modificado: string;
}

export interface Capacidades {
  abas: boolean;
  camera: boolean;
  assinaturaA3: boolean;
  salvarNoLugar: boolean;
}

/** O que muda entre PC e Android fica aqui. O resto do editor só conversa com esta interface. */
export interface Plataforma {
  readonly capacidades: Capacidades;
  pendentes(): Promise<ArquivoAberto[]>;
  escolherArquivos(): Promise<ArquivoAberto[]>;
  ler(id: string): Promise<Bytes>;
  salvar(id: string, bytes: Bytes): Promise<void>;
  salvarComo(nomeSugerido: string, bytes: Bytes): Promise<ArquivoAberto | null>;
  escolherPasta(): Promise<string | null>;
  salvarNaPasta(pasta: string, nome: string, bytes: Bytes): Promise<string>;
  imprimir(bytes: Bytes): Promise<void>;
  recentes(): Promise<ArquivoAberto[]>;
  guardarRascunho(chave: string, nome: string, bytes: Bytes): Promise<void>;
  rascunhos(): Promise<Rascunho[]>;
  lerRascunho(chave: string): Promise<Bytes>;
  apagarRascunho(chave: string): Promise<void>;
  imagemAssinatura(): Promise<Bytes | null>;
  guardarImagemAssinatura(png: Bytes): Promise<void>;
  pulso(): Promise<void>;
}

export class ErroArquivoEmUso extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroArquivoEmUso";
  }
}
```

- [ ] **Step 2: Escrever o teste que falha, `web/test/plataforma-pc.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { PlataformaPc } from "../src/plataforma/pc";
import { ErroArquivoEmUso } from "../src/plataforma/tipos";

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
}

function fetchFalso(respostas: Record<string, Response | (() => Response)>) {
  const chamadas: Chamada[] = [];
  const buscar = (async (url: string, init: RequestInit = {}) => {
    chamadas.push({ url, metodo: init.method ?? "GET", cabecalhos: (init.headers ?? {}) as Record<string, string> });
    const chave = `${init.method ?? "GET"} ${url}`;
    const resposta = respostas[chave];
    if (!resposta) return new Response("sem rota", { status: 404 });
    return typeof resposta === "function" ? resposta() : resposta;
  }) as typeof fetch;
  return { buscar, chamadas };
}

const json = (valor: unknown) => new Response(JSON.stringify(valor), { headers: { "Content-Type": "application/json" } });

describe("PlataformaPc", () => {
  it("manda o segredo em toda chamada", async () => {
    const { buscar, chamadas } = fetchFalso({ "GET /api/pendentes": json([]), "POST /api/pulso": new Response(null, { status: 204 }) });
    const p = new PlataformaPc("s3gr3do", buscar);
    await p.pendentes();
    await p.pulso();
    expect(chamadas.every((c) => c.cabecalhos["X-Editor-Segredo"] === "s3gr3do")).toBe(true);
  });

  it("lê bytes de um arquivo pelo id, codificando o id", async () => {
    const { buscar, chamadas } = fetchFalso({ "GET /api/arquivo/a%2Fb": new Response(new Uint8Array([37, 80])) });
    expect(Array.from(await new PlataformaPc("s", buscar).ler("a/b"))).toEqual([37, 80]);
    expect(chamadas[0].url).toBe("/api/arquivo/a%2Fb");
  });

  it("transforma o 409 do lançador em ErroArquivoEmUso com a mensagem dele", async () => {
    const { buscar } = fetchFalso({
      "PUT /api/arquivo/x": () => new Response(JSON.stringify({ erro: "Petição.pdf está aberto" }), { status: 409 }),
    });
    const promessa = new PlataformaPc("s", buscar).salvar("x", new Uint8Array([1]));
    await expect(promessa).rejects.toBeInstanceOf(ErroArquivoEmUso);
    await expect(new PlataformaPc("s", buscar).salvar("x", new Uint8Array([1]))).rejects.toThrow("Petição.pdf está aberto");
  });

  it("salvar como manda o nome sugerido codificado e entende o cancelamento", async () => {
    const { buscar, chamadas } = fetchFalso({ "POST /api/salvar-como": new Response(null, { status: 204 }) });
    expect(await new PlataformaPc("s", buscar).salvarComo("Petição (cópia)", new Uint8Array([1]))).toBeNull();
    expect(chamadas[0].cabecalhos["X-Nome-Sugerido"]).toBe(encodeURIComponent("Petição (cópia)"));
  });

  it("imagem de assinatura ausente vira null", async () => {
    const { buscar } = fetchFalso({});
    expect(await new PlataformaPc("s", buscar).imagemAssinatura()).toBeNull();
  });

  it("outros erros do lançador viram Error com a rota", async () => {
    const { buscar } = fetchFalso({});
    await expect(new PlataformaPc("s", buscar).recentes()).rejects.toThrow("/api/recentes");
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/plataforma-pc.test.ts`
Expected: FAIL, porque `../src/plataforma/pc` não existe.

- [ ] **Step 4: Implementar `web/src/plataforma/pc.ts`**

```ts
import type { Bytes } from "../motor/tipos";
import { ErroArquivoEmUso, type ArquivoAberto, type Capacidades, type Plataforma, type Rascunho } from "./tipos";

interface OpcoesChamada {
  corpo?: Bytes;
  cabecalhos?: Record<string, string>;
  aceitar404?: boolean;
}

/** Plataforma do PC: tudo passa pelo lançador Python em 127.0.0.1, autenticado pelo segredo da sessão. */
export class PlataformaPc implements Plataforma {
  readonly capacidades: Capacidades = { abas: true, camera: false, assinaturaA3: true, salvarNoLugar: true };
  private readonly segredo: string;
  private readonly buscar: typeof fetch;

  constructor(segredo: string, buscar: typeof fetch = fetch.bind(globalThis)) {
    this.segredo = segredo;
    this.buscar = buscar;
  }

  /** Lê o segredo que o lançador embutiu na página ao servi-la. */
  static daPagina(): PlataformaPc {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="editor-segredo"]');
    if (!meta?.content) throw new Error("Esta página precisa ser aberta pelo lançador do editor.");
    return new PlataformaPc(meta.content);
  }

  private async chamar(metodo: string, caminho: string, opcoes: OpcoesChamada = {}): Promise<Response | null> {
    const resposta = await this.buscar(caminho, {
      method: metodo,
      body: opcoes.corpo,
      headers: { "X-Editor-Segredo": this.segredo, ...opcoes.cabecalhos },
    });
    if (resposta.status === 404 && opcoes.aceitar404) return null;
    if (resposta.status === 409) throw new ErroArquivoEmUso(((await resposta.json()) as { erro: string }).erro);
    if (!resposta.ok) throw new Error(`O lançador respondeu ${resposta.status} em ${caminho}.`);
    return resposta;
  }

  private async json<T>(metodo: string, caminho: string, opcoes: OpcoesChamada = {}): Promise<T> {
    return (await (await this.chamar(metodo, caminho, opcoes))!.json()) as T;
  }

  private async bytes(caminho: string, aceitar404 = false): Promise<Bytes | null> {
    const resposta = await this.chamar("GET", caminho, { aceitar404 });
    return resposta ? new Uint8Array(await resposta.arrayBuffer()) : null;
  }

  pendentes(): Promise<ArquivoAberto[]> {
    return this.json("GET", "/api/pendentes");
  }

  escolherArquivos(): Promise<ArquivoAberto[]> {
    return this.json("POST", "/api/dialogo/abrir");
  }

  async ler(id: string): Promise<Bytes> {
    return (await this.bytes(`/api/arquivo/${encodeURIComponent(id)}`))!;
  }

  async salvar(id: string, bytes: Bytes): Promise<void> {
    await this.chamar("PUT", `/api/arquivo/${encodeURIComponent(id)}`, { corpo: bytes });
  }

  async salvarComo(nomeSugerido: string, bytes: Bytes): Promise<ArquivoAberto | null> {
    const resposta = await this.chamar("POST", "/api/salvar-como", {
      corpo: bytes,
      cabecalhos: { "X-Nome-Sugerido": encodeURIComponent(nomeSugerido) },
    });
    return resposta!.status === 204 ? null : ((await resposta!.json()) as ArquivoAberto);
  }

  async escolherPasta(): Promise<string | null> {
    const resposta = await this.chamar("POST", "/api/dialogo/pasta");
    return resposta!.status === 204 ? null : ((await resposta!.json()) as { id: string }).id;
  }

  async salvarNaPasta(pasta: string, nome: string, bytes: Bytes): Promise<string> {
    const caminho = `/api/pasta/${encodeURIComponent(pasta)}/${encodeURIComponent(nome)}`;
    return (await this.json<{ nome: string }>("PUT", caminho, { corpo: bytes })).nome;
  }

  async imprimir(bytes: Bytes): Promise<void> {
    await this.chamar("POST", "/api/imprimir", { corpo: bytes });
  }

  recentes(): Promise<ArquivoAberto[]> {
    return this.json("GET", "/api/recentes");
  }

  async guardarRascunho(chave: string, nome: string, bytes: Bytes): Promise<void> {
    await this.chamar("PUT", `/api/rascunho/${encodeURIComponent(chave)}`, {
      corpo: bytes,
      cabecalhos: { "X-Nome-Arquivo": encodeURIComponent(nome) },
    });
  }

  rascunhos(): Promise<Rascunho[]> {
    return this.json("GET", "/api/rascunhos");
  }

  async lerRascunho(chave: string): Promise<Bytes> {
    return (await this.bytes(`/api/rascunho/${encodeURIComponent(chave)}`))!;
  }

  async apagarRascunho(chave: string): Promise<void> {
    await this.chamar("DELETE", `/api/rascunho/${encodeURIComponent(chave)}`);
  }

  imagemAssinatura(): Promise<Bytes | null> {
    return this.bytes("/api/assinatura-imagem", true);
  }

  async guardarImagemAssinatura(png: Bytes): Promise<void> {
    await this.chamar("PUT", "/api/assinatura-imagem", { corpo: png });
  }

  async pulso(): Promise<void> {
    await this.chamar("POST", "/api/pulso");
  }
}
```

- [ ] **Step 5: Rodar**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run test/plataforma-pc.test.ts && npx tsc --noEmit`
Expected: 6 testes PASS e `tsc` sem erros.

- [ ] **Step 6: Criar a página de prova, `web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Editor PDF</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #e8e8e8; }
      header { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; padding: 8px 12px; background: #fff; border-bottom: 1px solid #ccc; }
      #paginas { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px; }
      #paginas canvas { background: #fff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2); }
    </style>
  </head>
  <body>
    <header>
      <button id="abrir">Abrir</button>
      <button id="girar">Girar página 1</button>
      <span id="estado">Nenhum arquivo aberto</span>
    </header>
    <main id="paginas"></main>
    <script type="module" src="/src/prova/principal.ts"></script>
  </body>
</html>
```

- [ ] **Step 7: Criar `web/src/prova/principal.ts`**

```ts
// Página de prova da etapa 1A: abre, desenha, gira a primeira página e salva.
// A interface definitiva substitui este arquivo no plano 1B.
import { Motor } from "../motor/cliente";
import { PlataformaPc } from "../plataforma/pc";
import type { ArquivoAberto } from "../plataforma/tipos";

const ZOOM = 1.25;
const motor = Motor.criar();
const plataforma = PlataformaPc.daPagina();
const area = document.querySelector<HTMLElement>("#paginas")!;
const estado = document.querySelector<HTMLElement>("#estado")!;
let atual: { doc: string; arquivo: ArquivoAberto } | null = null;

function mostrarErro(erro: unknown): void {
  estado.textContent = erro instanceof Error ? erro.message : String(erro);
}

async function desenhar(canvas: HTMLCanvasElement): Promise<void> {
  if (!atual) return;
  const imagem = await motor.pedir({
    tipo: "renderizar",
    doc: atual.doc,
    pagina: Number(canvas.dataset.pagina),
    escala: ZOOM * devicePixelRatio,
  });
  canvas.width = imagem.largura;
  canvas.height = imagem.altura;
  canvas.getContext("2d")!.putImageData(new ImageData(imagem.rgba, imagem.largura, imagem.altura), 0, 0);
}

const observador = new IntersectionObserver(
  (entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      observador.unobserve(entrada.target);
      desenhar(entrada.target as HTMLCanvasElement).catch(mostrarErro);
    }
  },
  { rootMargin: "800px" },
);

function montarPaginas(tamanhos: Array<{ largura: number; altura: number }>): void {
  observador.disconnect();
  area.replaceChildren(
    ...tamanhos.map((t, i) => {
      const canvas = document.createElement("canvas");
      canvas.dataset.pagina = String(i);
      canvas.style.width = `${t.largura * ZOOM}px`;
      canvas.style.height = `${t.altura * ZOOM}px`;
      observador.observe(canvas);
      return canvas;
    }),
  );
}

async function abrir(arquivo: ArquivoAberto): Promise<void> {
  const bytes = await plataforma.ler(arquivo.id);
  const { doc, info } = await motor.pedir({ tipo: "abrir", bytes }, [bytes.buffer]);
  if (atual) await motor.pedir({ tipo: "fechar", doc: atual.doc });
  atual = { doc, arquivo };
  document.title = `Editor PDF: ${arquivo.nome}`;
  montarPaginas(info.tamanhos);
  estado.textContent = `${arquivo.nome}, ${info.paginas} páginas${info.reparado ? " (estava danificado e foi reparado)" : ""}`;
}

document.querySelector("#abrir")!.addEventListener("click", () => {
  plataforma
    .escolherArquivos()
    .then((lista) => (lista[0] ? abrir(lista[0]) : undefined))
    .catch(mostrarErro);
});

document.querySelector("#girar")!.addEventListener("click", () => {
  if (!atual) return;
  motor
    .pedir({ tipo: "girar", doc: atual.doc, paginas: [0], graus: 90 })
    .then((info) => {
      montarPaginas(info.tamanhos);
      estado.textContent = "Página 1 girada. Ctrl+S salva no arquivo.";
    })
    .catch(mostrarErro);
});

document.addEventListener("keydown", (evento) => {
  if (!(evento.ctrlKey && evento.key.toLowerCase() === "s") || !atual) return;
  evento.preventDefault();
  const { doc, arquivo } = atual;
  motor
    .pedir({ tipo: "salvar", doc })
    .then((bytes) => plataforma.salvar(arquivo.id, bytes))
    .then(() => (estado.textContent = `Salvo: ${arquivo.nome}`))
    .catch(mostrarErro);
});

async function buscarPendentes(): Promise<void> {
  const novos = await plataforma.pendentes();
  if (novos[0]) await abrir(novos[0]);
}

plataforma.pulso().catch(() => undefined);
setInterval(() => plataforma.pulso().catch(() => undefined), 15000);
buscarPendentes().catch(mostrarErro);
setInterval(() => buscarPendentes().catch(mostrarErro), 2000);
```

- [ ] **Step 8: Gerar o build e conferir que o .wasm foi copiado**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npm run build && ls dist dist/assets`
Expected: build sem erros; `dist/index.html` e, em `dist/assets/`, um `.js` da página, um `.js` do worker e um arquivo `mupdf-wasm-<hash>.wasm`. Se o `.wasm` não aparecer em `dist/assets/`, o caminho relativo em `worker.ts` não foi reconhecido pelo Vite: parar e investigar antes de seguir.

- [ ] **Step 9: Criar o gerador de amostra, `web/test/gerar-amostra.ts`**

```ts
// Gera um PDF sintético de 40 páginas para o teste de ponta a ponta. Uso: node test/gerar-amostra.ts <saida.pdf>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fabricarPdf } from "./fabrica.ts";

const saida = process.argv[2];
if (!saida) throw new Error("Informe o arquivo de saída.");
mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, fabricarPdf({ paginas: 40, prefixo: "Amostra" }));
console.log(`Gravado ${saida}`);
```

Como `fabrica.ts` importa `../src/motor/tipos.ts` só como tipo (`import type`), o Node roda o arquivo direto, removendo os tipos.

Run:
```bash
cd /c/Users/lucas/Downloads/editor-pdf/web && node test/gerar-amostra.ts "../testes-reais/Petição de teste (amostra).pdf"
```
Expected: `Gravado ../testes-reais/Petição de teste (amostra).pdf`.

- [ ] **Step 10: Teste de ponta a ponta, manual**

Run:
```bash
cd /c/Users/lucas/Downloads/editor-pdf && pythonw lancador/editor_pdf.pyw "testes-reais/Petição de teste (amostra).pdf"
```

Conferir, nesta ordem:
1. Abre uma janela do Edge sem barra de endereço, com o título "Editor PDF: Petição de teste (amostra).pdf" e o texto "40 páginas".
2. Rolando até o fim, todas as páginas aparecem com "Amostra 1" até "Amostra 40".
3. "Girar página 1" deita a primeira página. Ctrl+S mostra "Salvo".
4. Em `%LOCALAPPDATA%\EditorPDF\versoes` existe uma cópia com data no nome e o conteúdo original.
5. Rodar o mesmo comando de novo com o editor aberto: nenhuma janela nova aparece, e o arquivo é reaberto na janela existente em até 2 segundos.
6. Fechar a janela. Em até 3 segundos não sobra processo: `tasklist | findstr /i pythonw` não mostra nada do editor.
7. Abrir o arquivo de novo: a página 1 continua girada.

Se algum item falhar, registrar o que aconteceu e corrigir antes do commit, com teste automatizado quando der para reproduzir.

- [ ] **Step 11: Rodar todos os testes**

Run: `cd /c/Users/lucas/Downloads/editor-pdf/web && npx vitest run && npx tsc --noEmit && cd ../lancador && python -m pytest -q`
Expected: 84 testes web PASS, `tsc` sem erros e 43 testes Python PASS.

- [ ] **Step 12: Commit**

```bash
cd /c/Users/lucas/Downloads/editor-pdf && git add web/src/plataforma/tipos.ts web/src/plataforma/pc.ts web/index.html web/src/prova/principal.ts web/test/gerar-amostra.ts web/test/plataforma-pc.test.ts && git -c user.name="Lucas Nanini" -c user.email="261664484+LNannini@users.noreply.github.com" commit -m "feat: plataforma do PC e página de prova de ponta a ponta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 13: Instalar no "Abrir com", só com autorização do Lucas**

Perguntar ao Lucas se pode gravar no registro do Windows dele (em `HKEY_CURRENT_USER`, sem administrador) e criar o atalho "Editor PDF" na área de trabalho. Explicar que `python lancador/desinstalar.py` desfaz tudo. Só com o sim dele:

Run: `cd /c/Users/lucas/Downloads/editor-pdf && python lancador/instalar.py`
Expected: mensagem "Pronto...". Conferir com ele: botão direito num PDF, "Abrir com", aparece "Editor PDF" e abre o arquivo; o atalho da área de trabalho abre o editor vazio; o leitor padrão continua o mesmo de antes.

---

## Depois deste plano

- **Plano 1B, interface do PC:** troca a página de prova pela interface em Preact descrita na Parte 2 da spec (abas, miniaturas com arrastar, marcadores, busca, seleção de texto, diálogos de juntar, separar e cortar, assinatura por imagem com cadastro, rascunho a cada minuto, desfazer, imprimir). Usa o `Motor` e a `Plataforma` deste plano sem mudança de contrato.
- **Plano 1C, Android:** implementação Android da `Plataforma`, PWA com service worker e Web Share Target, layout de celular e publicação. Antes dele, o protótipo curto de Web Share Target e de desempenho no celular do Lucas listado na spec.
