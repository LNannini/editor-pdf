"""Estado do lançador: arquivos conhecidos por id, fila de arquivos a abrir e lista de recentes."""

from __future__ import annotations

import json
import secrets
import threading
from pathlib import Path

from .config import MAX_RECENTES


class RegistroArquivos:
    """A página nunca manda caminhos de volta. Ela conhece só ids, e o lançador guarda o caminho de cada um."""

    def __init__(self) -> None:
        self._por_id: dict[str, Path] = {}
        self._por_caminho: dict[str, str] = {}
        self._trava = threading.Lock()

    def registrar(self, caminho: Path) -> str:
        absoluto = Path(caminho).resolve()
        chave = str(absoluto).lower()  # o Windows não diferencia maiúsculas em caminhos
        with self._trava:
            if chave not in self._por_caminho:
                ident = secrets.token_urlsafe(9)
                self._por_id[ident] = absoluto
                self._por_caminho[chave] = ident
            return self._por_caminho[chave]

    def caminho(self, ident: str) -> Path | None:
        with self._trava:
            return self._por_id.get(ident)


class FilaPendentes:
    """Arquivos que chegaram pelo "Abrir com" e ainda não foram buscados pela página."""

    def __init__(self) -> None:
        self._itens: list[Path] = []
        self._trava = threading.Lock()

    def adicionar(self, caminhos: list[Path]) -> None:
        with self._trava:
            self._itens.extend(Path(c) for c in caminhos)

    def retirar_todos(self) -> list[Path]:
        with self._trava:
            itens, self._itens = self._itens, []
            return itens


class Recentes:
    def __init__(self, arquivo: Path, limite: int = MAX_RECENTES) -> None:
        self._arquivo = arquivo
        self._limite = limite
        self._trava = threading.Lock()

    def _ler(self) -> list[str]:
        try:
            valor = json.loads(self._arquivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return []
        return [str(v) for v in valor] if isinstance(valor, list) else []

    def adicionar(self, caminho: Path) -> None:
        atual = str(Path(caminho).resolve())
        with self._trava:
            lista = [atual] + [c for c in self._ler() if c.lower() != atual.lower()]
            self._arquivo.write_text(json.dumps(lista[: self._limite], ensure_ascii=False), encoding="utf-8")

    def listar(self) -> list[Path]:
        with self._trava:
            return [Path(c) for c in self._ler() if Path(c).is_file()]
