from __future__ import annotations

import json
import time

from conftest import SEGREDO


def test_index_recebe_o_segredo_e_nao_tem_cors(chamar):
    status, cabecalhos, corpo = chamar("GET", "/", segredo=None)
    assert status == 200
    assert f'<meta name="editor-segredo" content="{SEGREDO}"></head>' in corpo.decode("utf-8")
    assert cabecalhos["cache-control"] == "no-store"
    assert "access-control-allow-origin" not in cabecalhos


def test_host_estranho_e_recusado_mesmo_com_segredo(chamar, servidor):
    assert chamar("GET", "/", host=f"site-malicioso.com:{servidor.porta}")[0] == 403
    assert chamar("GET", "/api/pendentes", host=f"site-malicioso.com:{servidor.porta}")[0] == 403
    assert chamar("GET", "/", host=f"localhost:{servidor.porta}")[0] == 200


def test_api_exige_o_segredo(chamar):
    assert chamar("GET", "/api/pendentes", segredo=None)[0] == 403
    assert chamar("GET", "/api/pendentes", segredo="errado")[0] == 403
    assert chamar("GET", "/api/pendentes")[0] == 200


def test_estaticos_com_tipo_certo(chamar):
    status, cabecalhos, _ = chamar("GET", "/assets/app.js", segredo=None)
    assert status == 200 and cabecalhos["content-type"].startswith("text/javascript")
    status, cabecalhos, _ = chamar("GET", "/assets/motor.wasm", segredo=None)
    assert status == 200 and cabecalhos["content-type"] == "application/wasm"


def test_estaticos_nao_saem_da_pasta(chamar):
    assert chamar("GET", "/../segredo.txt", segredo=None)[0] == 404
    assert chamar("GET", "/%2e%2e/segredo.txt", segredo=None)[0] == 404
    assert chamar("GET", "/assets/nao-existe.js", segredo=None)[0] == 404


def test_pendentes_saem_uma_vez_com_nome_acentuado(chamar, app, pdf):
    app.pendentes.adicionar([pdf])
    status, _, corpo = chamar("GET", "/api/pendentes")
    itens = json.loads(corpo)
    assert status == 200
    assert [i["nome"] for i in itens] == ["Petição Inicial (cópia).pdf"]
    assert itens[0]["pasta"].endswith("Área de trabalho")
    assert json.loads(chamar("GET", "/api/pendentes")[2]) == []


def test_le_arquivo_pelo_id_e_registra_nos_recentes(chamar, app, pdf):
    app.pendentes.adicionar([pdf])
    ident = json.loads(chamar("GET", "/api/pendentes")[2])[0]["id"]
    status, cabecalhos, corpo = chamar("GET", f"/api/arquivo/{ident}")
    assert status == 200 and corpo == b"%PDF-1.7 original"
    assert cabecalhos["content-type"] == "application/pdf"
    assert app.recentes.listar() == [pdf.resolve()]
    assert chamar("GET", "/api/arquivo/desconhecido")[0] == 404


def test_dialogo_de_abrir(chamar, falsos, pdf):
    falsos.pdfs = [pdf]
    itens = json.loads(chamar("POST", "/api/dialogo/abrir")[2])
    assert [i["nome"] for i in itens] == [pdf.name]


def test_abrir_externo_aceita_so_arquivos_que_existem(chamar, app, pdf, tmp_path):
    corpo = json.dumps({"caminhos": [str(pdf), str(tmp_path / "sumiu.pdf")]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo, {"Content-Type": "application/json"})[0] == 204
    assert app.pendentes.retirar_todos() == [pdf]


def test_abrir_externo_sem_janela_pede_encerramento(chamar, app, pdf):
    app.modo_pulso = True
    app.ultimo_pulso = time.monotonic() - 1000
    corpo = json.dumps({"caminhos": [str(pdf)]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo)[0] == 410
    assert app.encerrar.is_set()


def test_pulso_atualiza_o_ultimo_sinal(chamar, app):
    app.ultimo_pulso = 0.0
    assert chamar("POST", "/api/pulso")[0] == 204
    assert app.ultimo_pulso > 0.0
