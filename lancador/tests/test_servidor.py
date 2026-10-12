from __future__ import annotations

import json
import socket
import struct
import threading
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
    app.ja_conectou = True  # a página já esteve aberta e fechou há muito tempo
    app.ultima_queda = time.monotonic() - 100
    corpo = json.dumps({"caminhos": [str(pdf)]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo)[0] == 410
    assert app.encerrar.is_set()


def test_abrir_externo_durante_recarga_espera_a_pagina_voltar(chamar, app, pdf):
    app.ja_conectou = True
    app.ultima_queda = time.monotonic()  # a conexão acabou de cair: pode ser F5
    app.graca_recarga = 2.0
    threading.Timer(0.3, app.conexao_aberta).start()  # a página recarregada volta a conectar
    corpo = json.dumps({"caminhos": [str(pdf)]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo)[0] == 204
    assert not app.encerrar.is_set()
    assert app.pendentes.retirar_todos() == [pdf]


def test_abrir_externo_logo_depois_de_fechar_recusa_para_o_novo_assumir(chamar, app, pdf):
    app.ja_conectou = True
    app.ultima_queda = time.monotonic()  # a janela acabou de fechar e não volta
    app.graca_recarga = 0.3
    corpo = json.dumps({"caminhos": [str(pdf)]}).encode("utf-8")
    assert chamar("POST", "/api/abrir-externo", corpo)[0] == 410
    assert app.encerrar.is_set()
    assert app.pendentes.retirar_todos() == []


def test_respostas_proibem_o_editor_dentro_de_moldura_de_outro_site(chamar):
    _, cabecalhos, _ = chamar("GET", "/", segredo=None)
    assert cabecalhos["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in cabecalhos["content-security-policy"]


def _aguardar(condicao, segundos=3.0) -> bool:
    fim = time.monotonic() + segundos
    while time.monotonic() < fim:
        if condicao():
            return True
        time.sleep(0.05)
    return condicao()


def test_conexao_vivo_conta_a_pagina_aberta_e_percebe_o_fechamento(servidor, app):
    conexao = socket.create_connection(("127.0.0.1", servidor.porta))
    pedido = f"GET /api/vivo HTTP/1.1\r\nHost: 127.0.0.1:{servidor.porta}\r\nX-Editor-Segredo: {SEGREDO}\r\n\r\n"
    conexao.sendall(pedido.encode("ascii"))
    assert conexao.recv(1024).startswith(b"HTTP/1.1 200")
    assert _aguardar(lambda: app.conexoes == 1)
    assert app.ja_conectou is True
    conexao.close()
    assert _aguardar(lambda: app.conexoes == 0)
    assert app.ultima_queda is not None


def test_conexao_resetada_pelo_cliente_nao_suja_o_console(servidor, capsys):
    conexao = socket.create_connection(("127.0.0.1", servidor.porta))
    conexao.setsockopt(socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("ii", 1, 0))
    conexao.close()  # fecha com RST, como o Edge faz com conexões abertas por antecipação
    time.sleep(0.3)
    assert "Traceback" not in capsys.readouterr().err
