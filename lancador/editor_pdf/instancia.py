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
    """Apaga o registro só se ele ainda for deste processo; um lançador novo pode já ter gravado o dele."""
    try:
        info = json.loads(_arquivo(dados).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    if isinstance(info, dict) and info.get("pid") == os.getpid():
        _arquivo(dados).unlink(missing_ok=True)


def encaminhar_se_aberto(dados: Path, caminhos: list[Path], espera: float = 5.0) -> bool:
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
