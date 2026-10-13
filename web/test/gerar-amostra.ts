// Gera um PDF sintético de 40 páginas para o teste de ponta a ponta. Uso: node test/gerar-amostra.ts <saida.pdf>
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fabricarPdf } from "./fabrica.ts";

const saida = process.argv[2];
if (!saida) throw new Error("Informe o arquivo de saída.");
mkdirSync(dirname(saida), { recursive: true });
writeFileSync(saida, fabricarPdf({ paginas: 40, prefixo: "Amostra" }));
console.log(`Gravado ${saida}`);
