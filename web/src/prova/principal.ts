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

plataforma
  .manterVivo()
  .catch(() => undefined)
  .then(() => (estado.textContent = "O lançador foi encerrado. Feche esta janela e abra o editor de novo."));
buscarPendentes().catch(mostrarErro);
setInterval(() => buscarPendentes().catch(mostrarErro), 2000);
