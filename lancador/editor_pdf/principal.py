"""Ponto de entrada: abre o servidor e a janela, e encerra tudo quando a janela fecha."""

from __future__ import annotations

import secrets
import threading
import time
from pathlib import Path

from . import dialogos, instancia, janela
from .arquivos import limpar_antigos
from .config import CARENCIA_INICIAL, DIAS_VERSOES, GRACA_RECARGA, RAIZ_WEB, pasta_dados
from .servidor import Aplicacao, ServidorEditor


def deve_encerrar(agora: float, inicio: float, conexoes: int, ja_conectou: bool, ultima_queda: float | None) -> bool:
    """Decide se o lançador sai, olhando só para a conexão /api/vivo da página.

    O processo do Edge não serve de sinal: ele sai sozinho alguns segundos depois de abrir a janela.
    Enquanto houver página conectada, o lançador fica. Se nenhuma conectou na carência, a janela não abriu.
    Se a última caiu e nenhuma voltou dentro da graça (o tempo de uma recarga), a janela fechou.
    """
    if conexoes > 0:
        return False
    if not ja_conectou:
        return agora - inicio > CARENCIA_INICIAL
    return ultima_queda is not None and agora - ultima_queda > GRACA_RECARGA


def main(argv: list[str]) -> int:
    dados = pasta_dados()
    caminhos = [Path(a) for a in argv[1:] if Path(a).is_file()]
    if instancia.encaminhar_se_aberto(dados, caminhos):
        return 0
    edge = janela.localizar_edge()
    if edge is None:
        dialogos.avisar("O Microsoft Edge não foi encontrado. O editor usa o Edge para abrir a janela.")
        return 1
    if not (RAIZ_WEB / "index.html").is_file():
        dialogos.avisar("O editor ainda não foi compilado. Rode 'npm run build' na pasta web.")
        return 1
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
    janela.abrir_janela(edge, f"http://127.0.0.1:{servidor.porta}/", dados / "perfil-edge")
    try:
        while not app.encerrar.is_set():
            time.sleep(1)
            if deve_encerrar(time.monotonic(), app.inicio, app.conexoes, app.ja_conectou, app.ultima_queda):
                break
    finally:
        app.encerrar.set()  # solta a conexão /api/vivo que ainda estiver presa
        instancia.remover(dados)
        servidor.shutdown()
        servidor.server_close()
    return 0
