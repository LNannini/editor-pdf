"""Ponto de entrada: abre o servidor e a janela, e encerra tudo quando a janela fecha."""

from __future__ import annotations

import importlib.util
import secrets
import threading
from pathlib import Path
from typing import Any

from . import dialogos, instancia, janela
from .arquivos import limpar_antigos
from .config import DIAS_VERSOES, RAIZ_WEB, pasta_dados
from .servidor import Aplicacao, ServidorEditor


def _problema_de_instalacao() -> str | None:
    if importlib.util.find_spec("webview") is None:
        return "Falta instalar o pywebview. Rode: python -m pip install -r lancador\\requirements.txt"
    if not (RAIZ_WEB / "index.html").is_file():
        return "O editor ainda não foi compilado. Rode 'npm run build' na pasta web."
    return None


def main(argv: list[str]) -> int:
    dados = pasta_dados()
    caminhos = [Path(a) for a in argv[1:] if Path(a).is_file()]
    # Da pergunta "tem editor aberto?" até o registro, um lançador por vez: vários PDFs abertos juntos
    # pelo Explorer viram uma janela só, e não uma por arquivo.
    with instancia.trava_de_inicio(dados):
        if instancia.encaminhar_se_aberto(dados, caminhos):
            return 0
        problema = _problema_de_instalacao()
        if problema is None:
            limpar_antigos(dados / "versoes", DIAS_VERSOES)
            limpar_antigos(dados / "impressao", 1)
            app = Aplicacao(
                raiz_web=RAIZ_WEB,
                dados=dados,
                segredo=secrets.token_urlsafe(32),
                escolher_pdfs=dialogos.escolher_pdfs,
                escolher_destino=dialogos.escolher_destino,
                escolher_pasta=dialogos.escolher_pasta,
                abrir_para_imprimir=janela.abrir_para_imprimir,
            )
            app.pendentes.adicionar(caminhos)
            servidor = ServidorEditor(app)
            threading.Thread(target=servidor.serve_forever, daemon=True).start()
            instancia.registrar(dados, servidor.porta, app.segredo)
    if problema is not None:
        dialogos.avisar(problema)  # fora da trava, para a mensagem na tela não segurar os outros lançadores
        return 1

    def ao_abrir(aberta: Any) -> None:
        app.trazer_para_frente = aberta.restore
        app.definir_titulo = aberta.set_title

    try:
        janela.abrir_janela(f"http://127.0.0.1:{servidor.porta}/", "Editor PDF", ao_abrir=ao_abrir)
    finally:
        app.encerrar.set()  # a janela fechou: recusa novos arquivos para o próximo lançador assumir
        instancia.remover(dados)
        servidor.shutdown()
        servidor.server_close()
    return 0
