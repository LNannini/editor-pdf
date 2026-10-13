"""Caminhos e constantes do lançador."""

from __future__ import annotations

import os
from pathlib import Path

RAIZ_PROJETO = Path(__file__).resolve().parents[2]
RAIZ_WEB = RAIZ_PROJETO / "web" / "dist"

CABECALHO_SEGREDO = "X-Editor-Segredo"
DIAS_VERSOES = 30
MAX_RECENTES = 15


def pasta_dados() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    pasta = Path(base) / "EditorPDF"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta
