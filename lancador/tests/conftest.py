from __future__ import annotations

import http.client
import threading
from pathlib import Path

import pytest

from editor_pdf.servidor import Aplicacao, ServidorEditor

SEGREDO = "segredo-de-teste"


class Falsos:
    """Substitui os diálogos do Windows e a impressão, registrando o que foi pedido."""

    def __init__(self) -> None:
        self.pdfs: list[Path] = []
        self.destino: Path | None = None
        self.pasta: Path | None = None
        self.sugestoes: list[str] = []
        self.impressos: list[Path] = []

    def escolher_pdfs(self) -> list[Path]:
        return list(self.pdfs)

    def escolher_destino(self, nome: str) -> Path | None:
        self.sugestoes.append(nome)
        return self.destino

    def escolher_pasta(self) -> Path | None:
        return self.pasta

    def abrir_para_imprimir(self, caminho: Path) -> None:
        self.impressos.append(caminho)


@pytest.fixture
def web(tmp_path: Path) -> Path:
    raiz = tmp_path / "dist"
    (raiz / "assets").mkdir(parents=True)
    (raiz / "index.html").write_text("<html><head><title>x</title></head><body></body></html>", encoding="utf-8")
    (raiz / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (raiz / "assets" / "motor.wasm").write_bytes(b"\0asm")
    (tmp_path / "segredo.txt").write_text("não deve sair", encoding="utf-8")
    return raiz


@pytest.fixture
def falsos() -> Falsos:
    return Falsos()


@pytest.fixture
def app(tmp_path: Path, web: Path, falsos: Falsos) -> Aplicacao:
    dados = tmp_path / "dados"
    dados.mkdir()
    return Aplicacao(
        raiz_web=web,
        dados=dados,
        segredo=SEGREDO,
        escolher_pdfs=falsos.escolher_pdfs,
        escolher_destino=falsos.escolher_destino,
        escolher_pasta=falsos.escolher_pasta,
        abrir_para_imprimir=falsos.abrir_para_imprimir,
    )


@pytest.fixture
def servidor(app: Aplicacao):
    srv = ServidorEditor(app)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield srv
    srv.shutdown()
    srv.server_close()


@pytest.fixture
def pdf(tmp_path: Path) -> Path:
    """PDF falso num caminho com acento, espaço e parênteses, como os do Lucas."""
    pasta = tmp_path / "Área de trabalho"
    pasta.mkdir()
    caminho = pasta / "Petição Inicial (cópia).pdf"
    caminho.write_bytes(b"%PDF-1.7 original")
    return caminho


@pytest.fixture
def chamar(servidor: ServidorEditor):
    def _chamar(metodo, caminho, corpo=None, cabecalhos=None, segredo=SEGREDO, host=None):
        conexao = http.client.HTTPConnection("127.0.0.1", servidor.porta, timeout=5)
        enviados = dict(cabecalhos or {})
        if segredo is not None:
            enviados["X-Editor-Segredo"] = segredo
        if host is not None:
            enviados["Host"] = host
        conexao.request(metodo, caminho, body=corpo, headers=enviados)
        resposta = conexao.getresponse()
        dados = resposta.read()
        recebidos = {k.lower(): v for k, v in resposta.getheaders()}
        conexao.close()
        return resposta.status, recebidos, dados

    return _chamar
