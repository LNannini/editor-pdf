from __future__ import annotations

import socket
import time

from conftest import SEGREDO
from editor_pdf import instancia


def test_encaminha_para_o_editor_aberto(app, servidor, pdf):
    instancia.registrar(app.dados, servidor.porta, SEGREDO)
    assert instancia.encaminhar_se_aberto(app.dados, [pdf]) is True
    assert app.pendentes.retirar_todos() == [pdf]


def test_sem_registro_nao_encaminha(tmp_path):
    assert instancia.encaminhar_se_aberto(tmp_path, []) is False


def test_registro_velho_de_porta_fechada_nao_encaminha(tmp_path):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        porta = s.getsockname()[1]
    instancia.registrar(tmp_path, porta, "qualquer")
    inicio = time.monotonic()
    assert instancia.encaminhar_se_aberto(tmp_path, []) is False
    assert time.monotonic() - inicio < 3


def test_editor_sem_janela_recusa_e_se_encerra(app, servidor, pdf):
    app.modo_pulso = True
    app.ultimo_pulso = time.monotonic() - 1000
    instancia.registrar(app.dados, servidor.porta, SEGREDO)
    assert instancia.encaminhar_se_aberto(app.dados, [pdf]) is False
    assert app.encerrar.is_set()


def test_remover(tmp_path):
    instancia.registrar(tmp_path, 1234, "x")
    instancia.remover(tmp_path)
    assert not (tmp_path / "instancia.json").exists()
