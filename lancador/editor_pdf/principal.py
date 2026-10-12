"""Ponto de entrada: abre o servidor e a janela, e encerra tudo quando a janela fecha."""

from __future__ import annotations

import secrets
import threading
import time
from pathlib import Path

from . import dialogos, instancia, janela
from .arquivos import limpar_antigos
from .config import CARENCIA_INICIAL, DIAS_VERSOES, LIMITE_SEM_PULSO, RAIZ_WEB, SAIDA_CEDO, pasta_dados
from .servidor import Aplicacao, ServidorEditor


def deve_encerrar(agora: float, inicio: float, ultimo_pulso: float, janela_viva: bool, modo_pulso: bool) -> bool:
    """Decide se o lançador sai.

    Com o processo do Edge vivo, nunca: janela minimizada atrasa os sinais da página, e isso não é fechamento.
    Se o Edge saiu depois de abrir a janela normalmente, a janela fechou. Se saiu logo no começo (modo pulso),
    o Edge entregou a janela a outro processo, e só o silêncio da página indica que ela fechou.
    """
    if janela_viva:
        return False
    if not modo_pulso:
        return True
    return agora - inicio > CARENCIA_INICIAL and agora - ultimo_pulso > LIMITE_SEM_PULSO


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
    inicio = time.monotonic()
    processo = janela.abrir_janela(edge, f"http://127.0.0.1:{servidor.porta}/", dados / "perfil-edge")
    saida_do_edge: float | None = None
    try:
        while not app.encerrar.is_set():
            time.sleep(1)
            agora = time.monotonic()
            if saida_do_edge is None and processo.poll() is not None:
                saida_do_edge = agora
                app.modo_pulso = saida_do_edge - inicio < SAIDA_CEDO
            if deve_encerrar(agora, inicio, app.ultimo_pulso, saida_do_edge is None, app.modo_pulso):
                break
    finally:
        instancia.remover(dados)
        servidor.shutdown()
        servidor.server_close()
        if processo.poll() is None:
            processo.terminate()
    return 0
