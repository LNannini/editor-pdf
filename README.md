# Editor PDF

App de PDF para Android, de uso pessoal, sem propaganda e sem marca d'água: ler, selecionar texto, digitalizar documentos com a câmera e organizar páginas. Roda no Chrome do celular como app instalado (PWA), e os arquivos nunca saem do aparelho.

No PC, o autor usa o [PdfCraft](https://github.com/storytold/pdfcraft). Este projeto cobre o que o PdfCraft não tem: o celular e a digitalização pela câmera.

## Situação

| Etapa | Conteúdo | Situação |
|---|---|---|
| 1 | Motor de PDF sobre o MuPDF.js | Pronta, em revisão no PR #1 |
| 2 | Digitalizador, OCR em português e a primeira versão do app no celular | Próxima |
| 3 | Leitor e operações de página no celular | Planejada |
| 4 | Apagar área, imagens e correção de texto | Planejada |

O desenho completo está em [`docs/superpowers/specs/2026-10-12-editor-pdf-design.md`](docs/superpowers/specs/2026-10-12-editor-pdf-design.md).

## Rodar os testes

Requer Node.js 26.

```
cd web
npm ci
npm test
```

## Licença e créditos

AGPL-3.0, porque o app usa o [MuPDF.js](https://mupdf.com), que tem essa licença. Veja [`LICENSE`](LICENSE).

Na etapa 2, o detector de bordas, o endireitamento e a limpeza das fotos do digitalizador vão ser reescritos a partir do PdfCraft, da equipe ArtCraft, que tem licença MIT. Cada arquivo reescrito vai indicar a origem e levar o aviso dessa licença.
