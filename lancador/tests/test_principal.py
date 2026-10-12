from __future__ import annotations

from editor_pdf.config import CARENCIA_INICIAL, GRACA_RECARGA
from editor_pdf.principal import deve_encerrar

INICIO = 1000.0


def test_nunca_encerra_com_a_pagina_conectada():
    # O processo do Edge sai sozinho alguns segundos depois de abrir; o que vale é a conexão da página.
    assert deve_encerrar(INICIO + 10_000, INICIO, conexoes=1, ja_conectou=True, ultima_queda=None) is False


def test_espera_a_janela_abrir_durante_a_carencia():
    assert deve_encerrar(INICIO + CARENCIA_INICIAL - 1, INICIO, conexoes=0, ja_conectou=False, ultima_queda=None) is False
    assert deve_encerrar(INICIO + CARENCIA_INICIAL + 1, INICIO, conexoes=0, ja_conectou=False, ultima_queda=None) is True


def test_recarregar_a_pagina_nao_encerra():
    queda = INICIO + 100
    assert deve_encerrar(queda + GRACA_RECARGA - 1, INICIO, conexoes=0, ja_conectou=True, ultima_queda=queda) is False


def test_encerra_quando_a_janela_fecha():
    queda = INICIO + 100
    assert deve_encerrar(queda + GRACA_RECARGA + 1, INICIO, conexoes=0, ja_conectou=True, ultima_queda=queda) is True
