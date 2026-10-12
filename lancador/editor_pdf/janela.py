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
    # Perfil próprio: a janela não se mistura com o Edge do dia a dia. O processo iniciado aqui sai sozinho
    # alguns segundos depois e entrega a janela a outro; quem diz se ela continua aberta é a conexão /api/vivo.
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
