"""Servidor HTTP local do editor.

Escuta só em 127.0.0.1, confere o cabeçalho Host (contra troca de DNS) e exige o segredo da sessão em toda
chamada /api. Não envia cabeçalhos CORS, então nenhum outro site consegue ler as respostas.
"""

from __future__ import annotations

import hmac
import json
import re
import threading
import time
from dataclasses import dataclass, field
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable
from urllib.parse import unquote, urlsplit

from .config import CABECALHO_SEGREDO, LIMITE_SEM_PULSO
from .estado import FilaPendentes, Recentes, RegistroArquivos

# Tipos fixos: no Windows o módulo mimetypes lê o registro e às vezes devolve text/plain para .js.
TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
}
LIMITE_CORPO = 1024 * 1024 * 1024


@dataclass
class Aplicacao:
    raiz_web: Path
    dados: Path
    segredo: str
    escolher_pdfs: Callable[[], list[Path]]
    escolher_destino: Callable[[str], Path | None]
    escolher_pasta: Callable[[], Path | None]
    abrir_para_imprimir: Callable[[Path], None]
    registro: RegistroArquivos = field(default_factory=RegistroArquivos)
    pastas: RegistroArquivos = field(default_factory=RegistroArquivos)
    pendentes: FilaPendentes = field(default_factory=FilaPendentes)
    recentes: Recentes = field(init=False)
    ultimo_pulso: float = field(default_factory=time.monotonic)
    modo_pulso: bool = False
    encerrar: threading.Event = field(default_factory=threading.Event)

    def __post_init__(self) -> None:
        self.recentes = Recentes(self.dados / "recentes.json")

    def descrever(self, caminho: Path) -> dict[str, str]:
        return {"id": self.registro.registrar(caminho), "nome": caminho.name, "pasta": str(caminho.parent)}


class ServidorEditor(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, app: Aplicacao, porta: int = 0) -> None:
        super().__init__(("127.0.0.1", porta), Manipulador)
        self.app = app

    @property
    def porta(self) -> int:
        return int(self.server_address[1])


class Manipulador(BaseHTTPRequestHandler):
    server: ServidorEditor
    protocol_version = "HTTP/1.1"

    def log_message(self, formato: str, *args: object) -> None:
        pass

    def do_GET(self) -> None:
        self._despachar("GET")

    def do_PUT(self) -> None:
        self._despachar("PUT")

    def do_POST(self) -> None:
        self._despachar("POST")

    def do_DELETE(self) -> None:
        self._despachar("DELETE")

    # ---------------------------------------------------------------- despacho

    def _despachar(self, metodo: str) -> None:
        app = self.server.app
        porta = self.server.porta
        if self.headers.get("Host", "") not in (f"127.0.0.1:{porta}", f"localhost:{porta}"):
            self._texto(HTTPStatus.FORBIDDEN, "Host recusado.")
            return
        caminho = urlsplit(self.path).path
        if not caminho.startswith("/api/"):
            if metodo == "GET":
                self._estatico(caminho)
            else:
                self._texto(HTTPStatus.METHOD_NOT_ALLOWED, "Método não permitido.")
            return
        recebido = self.headers.get(CABECALHO_SEGREDO, "")
        if not hmac.compare_digest(recebido.encode("utf-8"), app.segredo.encode("utf-8")):
            self._texto(HTTPStatus.FORBIDDEN, "Segredo ausente ou errado.")
            return
        for metodo_rota, padrao, nome in ROTAS:
            achado = padrao.fullmatch(caminho)
            if achado and metodo_rota == metodo:
                try:
                    getattr(self, nome)(*(unquote(g) for g in achado.groups()))
                except ValueError as erro:
                    self._json(HTTPStatus.BAD_REQUEST, {"erro": str(erro)})
                return
        self._texto(HTTPStatus.NOT_FOUND, "Rota desconhecida.")

    # ---------------------------------------------------------------- respostas

    def _corpo(self) -> bytes:
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho < 0 or tamanho > LIMITE_CORPO:
            raise ValueError("Arquivo grande demais.")
        return self.rfile.read(tamanho)

    def _enviar(self, status: HTTPStatus, corpo: bytes, tipo: str) -> None:
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if status >= 400:
            # Em erro o corpo do pedido pode não ter sido lido; fechar a conexão evita ler lixo depois.
            self.send_header("Connection", "close")
            self.close_connection = True
        if status == HTTPStatus.NO_CONTENT:
            self.end_headers()
            return
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _texto(self, status: HTTPStatus, texto: str) -> None:
        self._enviar(status, texto.encode("utf-8"), "text/plain; charset=utf-8")

    def _json(self, status: HTTPStatus, valor: object) -> None:
        self._enviar(status, json.dumps(valor, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _bytes(self, dados: bytes, tipo: str = "application/pdf") -> None:
        self._enviar(HTTPStatus.OK, dados, tipo)

    def _vazio(self) -> None:
        self._enviar(HTTPStatus.NO_CONTENT, b"", "")

    def _estatico(self, caminho: str) -> None:
        app = self.server.app
        raiz = app.raiz_web.resolve()
        if caminho in ("", "/", "/index.html"):
            html = (raiz / "index.html").read_text(encoding="utf-8")
            meta = f'<meta name="editor-segredo" content="{app.segredo}">'
            self._enviar(HTTPStatus.OK, html.replace("</head>", meta + "</head>", 1).encode("utf-8"), TIPOS[".html"])
            return
        alvo = (raiz / unquote(caminho).lstrip("/")).resolve()
        if not alvo.is_relative_to(raiz) or not alvo.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        self._enviar(HTTPStatus.OK, alvo.read_bytes(), TIPOS.get(alvo.suffix.lower(), "application/octet-stream"))

    # ---------------------------------------------------------------- rotas

    def _api_pendentes(self) -> None:
        app = self.server.app
        self._json(HTTPStatus.OK, [app.descrever(c) for c in app.pendentes.retirar_todos()])

    def _api_abrir_externo(self) -> None:
        app = self.server.app
        if app.modo_pulso and time.monotonic() - app.ultimo_pulso > LIMITE_SEM_PULSO:
            # A janela foi fechada sem que o processo do Edge avisasse; este lançador sai e o novo assume.
            app.encerrar.set()
            self._texto(HTTPStatus.GONE, "Sem janela aberta.")
            return
        pedido = json.loads(self._corpo() or b"{}")
        app.pendentes.adicionar([Path(c) for c in pedido.get("caminhos", []) if Path(c).is_file()])
        self._vazio()

    def _api_pulso(self) -> None:
        self.server.app.ultimo_pulso = time.monotonic()
        self._vazio()

    def _api_dialogo_abrir(self) -> None:
        app = self.server.app
        self._json(HTTPStatus.OK, [app.descrever(c) for c in app.escolher_pdfs()])

    def _api_ler_arquivo(self, ident: str) -> None:
        app = self.server.app
        caminho = app.registro.caminho(ident)
        if caminho is None or not caminho.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        dados = caminho.read_bytes()
        app.recentes.adicionar(caminho)
        self._bytes(dados)


ROTAS: list[tuple[str, re.Pattern[str], str]] = [
    (metodo, re.compile(padrao), nome)
    for metodo, padrao, nome in [
        ("GET", r"/api/pendentes", "_api_pendentes"),
        ("POST", r"/api/abrir-externo", "_api_abrir_externo"),
        ("POST", r"/api/pulso", "_api_pulso"),
        ("POST", r"/api/dialogo/abrir", "_api_dialogo_abrir"),
        ("GET", r"/api/arquivo/([^/]+)", "_api_ler_arquivo"),
    ]
]
