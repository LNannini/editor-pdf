"""A janela do editor e a entrega de PDFs ao Edge para imprimir.

A janela é do próprio lançador, com o WebView2 do Windows por meio do pywebview: chama-se "Editor PDF",
não usa perfil do Edge, e abrir_janela só retorna quando ela fecha.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any, Callable


def abrir_janela(
    url: str,
    titulo: str,
    ao_abrir: Callable[[Any], None] | None = None,
    oculta: bool = False,
) -> None:
    """Abre a janela e bloqueia até ela fechar. ao_abrir recebe a janela, numa thread à parte, logo que ela existe."""
    import webview  # importado aqui para o resto do lançador funcionar mesmo antes de instalar o pywebview

    janela = webview.create_window(titulo, url, width=1200, height=900, min_size=(600, 400), text_select=True, hidden=oculta)
    if ao_abrir is None:
        webview.start()
    else:
        webview.start(ao_abrir, janela)


def localizar_edge() -> Path | None:
    candidatos = [
        Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    return next((c for c in candidatos if c.is_file()), None)


def comando_imprimir(edge: Path, pdf: Path) -> list[str]:
    return [str(edge), str(pdf)]


def abrir_para_imprimir(pdf: Path) -> None:
    edge = localizar_edge()
    if edge is not None:
        subprocess.Popen(comando_imprimir(edge, pdf))
    else:
        os.startfile(pdf)  # noqa: S606 (abre no leitor padrão do Windows)
