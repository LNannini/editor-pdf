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
