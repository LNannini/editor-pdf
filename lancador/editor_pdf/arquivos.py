"""Gravação segura no disco: arquivo temporário e troca atômica, com cópia da versão anterior."""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import time
from datetime import datetime
from pathlib import Path

PROIBIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVADOS = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


class ArquivoEmUso(Exception):
    def __init__(self, caminho: Path) -> None:
        super().__init__(
            f'Não foi possível gravar "{caminho.name}". Ele está aberto em outro programa ou sem permissão de gravação. '
            "Feche o arquivo no outro programa ou salve com outro nome."
        )
        self.caminho = caminho


def salvar_atomico(
    destino: Path, dados: bytes, pasta_versoes: Path | None = None, agora: datetime | None = None
) -> Path | None:
    """Grava num temporário ao lado e só então troca pelo destino. Se houver pasta de versões, guarda antes a anterior."""
    destino = Path(destino)
    copia: Path | None = None
    if pasta_versoes is not None and destino.exists():
        pasta_versoes.mkdir(parents=True, exist_ok=True)
        carimbo = (agora or datetime.now()).strftime("%Y-%m-%d_%H-%M-%S")
        copia = caminho_livre(pasta_versoes, f"{carimbo} {destino.name}")
        shutil.copy2(destino, copia)
        os.utime(copia)  # o prazo de 30 dias conta da cópia, não da data do original
    descritor, temporario = tempfile.mkstemp(prefix=".editorpdf-", suffix=".tmp", dir=destino.parent)
    try:
        with os.fdopen(descritor, "wb") as saida:
            saida.write(dados)
            saida.flush()
            os.fsync(saida.fileno())
        try:
            os.replace(temporario, destino)
        except PermissionError as erro:
            raise ArquivoEmUso(destino) from erro
    except BaseException:
        Path(temporario).unlink(missing_ok=True)
        if copia is not None:
            copia.unlink(missing_ok=True)
        raise
    return copia


def limpar_antigos(pasta: Path, dias: int, agora: float | None = None) -> int:
    if not pasta.is_dir():
        return 0
    limite = (agora if agora is not None else time.time()) - dias * 86400
    removidos = 0
    for item in pasta.iterdir():
        if item.is_file() and item.stat().st_mtime < limite:
            try:
                item.unlink()
                removidos += 1
            except OSError:
                pass
    return removidos


def nome_seguro(nome: str, extensao: str = ".pdf") -> str:
    base = PROIBIDOS.sub("_", nome).strip().rstrip(". ")
    if base.lower().endswith(extensao):
        base = base[: -len(extensao)].rstrip(". ")
    base = base[:150] or "documento"
    if base.upper() in RESERVADOS:
        base = f"_{base}"
    return base + extensao


def caminho_livre(pasta: Path, nome: str) -> Path:
    alvo = pasta / nome
    if not alvo.exists():
        return alvo
    raiz, extensao = os.path.splitext(nome)
    n = 2
    while (pasta / f"{raiz} ({n}){extensao}").exists():
        n += 1
    return pasta / f"{raiz} ({n}){extensao}"
