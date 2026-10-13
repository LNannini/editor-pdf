import { ErroDocumento } from "./tipos";

/**
 * Lê o que o Lucas digita na caixa "Separar por intervalo" e devolve um grupo de páginas por arquivo.
 * Entrada em números de página como aparecem na tela (a partir de 1); saída em índices (a partir de 0).
 * Exemplo: "1-5, 8, 10-12" com total 20 vira [[0,1,2,3,4], [7], [9,10,11]].
 * Intervalos que se repetem ("1-3, 2-4") são aceitos e geram arquivos com páginas em comum.
 */
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
