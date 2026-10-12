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
