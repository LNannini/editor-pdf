from __future__ import annotations

from editor_pdf.config import CARENCIA_INICIAL, LIMITE_SEM_PULSO
from editor_pdf.principal import deve_encerrar

INICIO = 1000.0


def test_nunca_encerra_com_a_janela_viva():
    assert deve_encerrar(INICIO + 10_000, INICIO, INICIO, janela_viva=True, modo_pulso=False) is False


def test_encerra_quando_a_janela_fecha_normalmente():
    assert deve_encerrar(INICIO + 300, INICIO, INICIO + 295, janela_viva=False, modo_pulso=False) is True


def test_em_modo_pulso_espera_a_carencia_e_o_silencio():
    agora = INICIO + CARENCIA_INICIAL - 1
    assert deve_encerrar(agora, INICIO, INICIO - 500, janela_viva=False, modo_pulso=True) is False
    agora = INICIO + CARENCIA_INICIAL + 1
    assert deve_encerrar(agora, INICIO, agora - 5, janela_viva=False, modo_pulso=True) is False
    assert deve_encerrar(agora, INICIO, agora - LIMITE_SEM_PULSO - 1, janela_viva=False, modo_pulso=True) is True
