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
from datetime import datetime

from .arquivos import ArquivoEmUso, caminho_livre, nome_seguro, salvar_atomico
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
CHAVE_RASCUNHO = re.compile(r"[A-Za-z0-9_-]{1,64}")


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
        self._corpo_lido = False
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
                except ArquivoEmUso as erro:
                    self._json(HTTPStatus.CONFLICT, {"erro": str(erro)})
                except ValueError as erro:
                    self._json(HTTPStatus.BAD_REQUEST, {"erro": str(erro)})
                return
        self._texto(HTTPStatus.NOT_FOUND, "Rota desconhecida.")

    # ---------------------------------------------------------------- respostas

    def _corpo(self) -> bytes:
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho < 0 or tamanho > LIMITE_CORPO:
            raise ValueError("Arquivo grande demais.")
        self._corpo_lido = True
        return self.rfile.read(tamanho)

    def _descartar_corpo(self) -> None:
        """Lê e joga fora o corpo não lido. Sem isso, o Windows derruba a conexão e a resposta de erro se perde."""
        if self._corpo_lido:
            return
        self._corpo_lido = True
        try:
            restante = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return
        if restante > LIMITE_CORPO:
            return
        while restante > 0:
            pedaco = self.rfile.read(min(restante, 64 * 1024))
            if not pedaco:
                return
            restante -= len(pedaco)

    def _enviar(self, status: HTTPStatus, corpo: bytes, tipo: str) -> None:
        if status >= 400:
            self._descartar_corpo()
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

    def _api_salvar_arquivo(self, ident: str) -> None:
        app = self.server.app
        caminho = app.registro.caminho(ident)
        if caminho is None:
            self._texto(HTTPStatus.NOT_FOUND, "Arquivo não encontrado.")
            return
        salvar_atomico(caminho, self._corpo(), app.dados / "versoes")
        self._vazio()

    def _api_salvar_como(self) -> None:
        app = self.server.app
        dados = self._corpo()
        sugerido = unquote(self.headers.get("X-Nome-Sugerido", "documento"))
        destino = app.escolher_destino(sugerido)
        if destino is None:
            self._vazio()
            return
        salvar_atomico(destino, dados, app.dados / "versoes")
        app.recentes.adicionar(destino)
        self._json(HTTPStatus.OK, app.descrever(destino))

    def _api_dialogo_pasta(self) -> None:
        app = self.server.app
        pasta = app.escolher_pasta()
        if pasta is None:
            self._vazio()
            return
        self._json(HTTPStatus.OK, {"id": app.pastas.registrar(pasta), "nome": pasta.name, "pasta": str(pasta)})

    def _api_salvar_na_pasta(self, ident: str, nome: str) -> None:
        app = self.server.app
        pasta = app.pastas.caminho(ident)
        if pasta is None or not pasta.is_dir():
            self._texto(HTTPStatus.NOT_FOUND, "Pasta não encontrada.")
            return
        destino = caminho_livre(pasta, nome_seguro(nome))
        salvar_atomico(destino, self._corpo())
        self._json(HTTPStatus.OK, {"nome": destino.name})

    def _api_imprimir(self) -> None:
        app = self.server.app
        pasta = app.dados / "impressao"
        pasta.mkdir(parents=True, exist_ok=True)
        destino = caminho_livre(pasta, f"impressao {datetime.now():%Y-%m-%d_%H-%M-%S}.pdf")
        salvar_atomico(destino, self._corpo())
        app.abrir_para_imprimir(destino)
        self._vazio()

    def _api_recentes(self) -> None:
        app = self.server.app
        self._json(HTTPStatus.OK, [app.descrever(c) for c in app.recentes.listar()])

    def _pasta_rascunhos(self) -> Path:
        pasta = self.server.app.dados / "rascunhos"
        pasta.mkdir(parents=True, exist_ok=True)
        return pasta

    @staticmethod
    def _conferir_chave(chave: str) -> None:
        if not CHAVE_RASCUNHO.fullmatch(chave):
            raise ValueError("Chave de rascunho inválida.")

    def _api_rascunhos(self) -> None:
        pasta = self._pasta_rascunhos()
        itens = []
        for meta in pasta.glob("*.json"):
            try:
                info = json.loads(meta.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            if (pasta / f"{meta.stem}.pdf").is_file():
                itens.append({"chave": meta.stem, "nome": str(info.get("nome", "")), "modificado": str(info.get("modificado", ""))})
        itens.sort(key=lambda item: item["modificado"], reverse=True)
        self._json(HTTPStatus.OK, itens)

    def _api_ler_rascunho(self, chave: str) -> None:
        self._conferir_chave(chave)
        arquivo = self._pasta_rascunhos() / f"{chave}.pdf"
        if not arquivo.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Rascunho não encontrado.")
            return
        self._bytes(arquivo.read_bytes())

    def _api_guardar_rascunho(self, chave: str) -> None:
        self._conferir_chave(chave)
        pasta = self._pasta_rascunhos()
        nome = unquote(self.headers.get("X-Nome-Arquivo", "documento.pdf"))
        salvar_atomico(pasta / f"{chave}.pdf", self._corpo())
        meta = {"nome": nome, "modificado": datetime.now().isoformat(timespec="seconds")}
        (pasta / f"{chave}.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
        self._vazio()

    def _api_apagar_rascunho(self, chave: str) -> None:
        self._conferir_chave(chave)
        pasta = self._pasta_rascunhos()
        (pasta / f"{chave}.pdf").unlink(missing_ok=True)
        (pasta / f"{chave}.json").unlink(missing_ok=True)
        self._vazio()

    def _api_ler_assinatura(self) -> None:
        arquivo = self.server.app.dados / "assinatura.png"
        if not arquivo.is_file():
            self._texto(HTTPStatus.NOT_FOUND, "Nenhuma assinatura cadastrada.")
            return
        self._bytes(arquivo.read_bytes(), "image/png")

    def _api_guardar_assinatura(self) -> None:
        salvar_atomico(self.server.app.dados / "assinatura.png", self._corpo())
        self._vazio()


ROTAS: list[tuple[str, re.Pattern[str], str]] = [
    (metodo, re.compile(padrao), nome)
    for metodo, padrao, nome in [
        ("GET", r"/api/pendentes", "_api_pendentes"),
        ("POST", r"/api/abrir-externo", "_api_abrir_externo"),
        ("POST", r"/api/pulso", "_api_pulso"),
        ("POST", r"/api/dialogo/abrir", "_api_dialogo_abrir"),
        ("GET", r"/api/arquivo/([^/]+)", "_api_ler_arquivo"),
        ("PUT", r"/api/arquivo/([^/]+)", "_api_salvar_arquivo"),
        ("POST", r"/api/salvar-como", "_api_salvar_como"),
        ("POST", r"/api/dialogo/pasta", "_api_dialogo_pasta"),
        ("PUT", r"/api/pasta/([^/]+)/([^/]+)", "_api_salvar_na_pasta"),
        ("POST", r"/api/imprimir", "_api_imprimir"),
        ("GET", r"/api/recentes", "_api_recentes"),
        ("GET", r"/api/rascunhos", "_api_rascunhos"),
        ("GET", r"/api/rascunho/([^/]+)", "_api_ler_rascunho"),
        ("PUT", r"/api/rascunho/([^/]+)", "_api_guardar_rascunho"),
        ("DELETE", r"/api/rascunho/([^/]+)", "_api_apagar_rascunho"),
        ("GET", r"/api/assinatura-imagem", "_api_ler_assinatura"),
        ("PUT", r"/api/assinatura-imagem", "_api_guardar_assinatura"),
    ]
]
