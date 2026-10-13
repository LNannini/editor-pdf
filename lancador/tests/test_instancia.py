from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from conftest import SEGREDO
from editor_pdf import instancia

LANCADOR = Path(__file__).resolve().parents[1]


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


def test_editor_fechando_recusa_para_o_novo_assumir(app, servidor, pdf):
    app.encerrar.set()  # a janela fechou e o lançador antigo está saindo
    instancia.registrar(app.dados, servidor.porta, SEGREDO)
    assert instancia.encaminhar_se_aberto(app.dados, [pdf]) is False
    assert app.pendentes.retirar_todos() == []


def test_trava_de_inicio_faz_lancadores_simultaneos_entrarem_um_de_cada_vez(tmp_path):
    # Abrir vários PDFs de uma vez pelo Explorer inicia vários lançadores ao mesmo tempo.
    codigo = (
        "import json, sys, time\n"
        "from pathlib import Path\n"
        "from editor_pdf import instancia\n"
        "with instancia.trava_de_inicio(Path(sys.argv[1])):\n"
        "    entrada = time.time(); time.sleep(0.8); saida = time.time()\n"
        "print(json.dumps([entrada, saida]))\n"
    )
    lancadores = [
        subprocess.Popen([sys.executable, "-c", codigo, str(tmp_path)], cwd=LANCADOR, stdout=subprocess.PIPE, text=True)
        for _ in range(3)
    ]
    intervalos = sorted(json.loads(p.communicate(timeout=60)[0]) for p in lancadores)
    for (_, saida_anterior), (entrada_seguinte, _) in zip(intervalos, intervalos[1:]):
        assert entrada_seguinte >= saida_anterior - 0.02


def test_remover(tmp_path):
    instancia.registrar(tmp_path, 1234, "x")
    instancia.remover(tmp_path)
    assert not (tmp_path / "instancia.json").exists()


def test_remover_preserva_o_registro_do_lancador_novo(tmp_path):
    # O lançador que está saindo não pode apagar o registro que um lançador novo acabou de gravar.
    arquivo = tmp_path / "instancia.json"
    arquivo.write_text(json.dumps({"porta": 4321, "segredo": "novo", "pid": os.getpid() + 1}), encoding="utf-8")
    instancia.remover(tmp_path)
    assert arquivo.exists()
