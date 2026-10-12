from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path
from urllib.parse import quote

import pytest


def _id_de(chamar, app, caminho: Path) -> str:
    app.pendentes.adicionar([caminho])
    return json.loads(chamar("GET", "/api/pendentes")[2])[0]["id"]


def test_salvar_no_lugar_com_backup(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    assert chamar("PUT", f"/api/arquivo/{ident}", b"%PDF novo")[0] == 204
    assert pdf.read_bytes() == b"%PDF novo"
    copias = list((app.dados / "versoes").iterdir())
    assert len(copias) == 1 and copias[0].read_bytes() == b"%PDF-1.7 original"


@pytest.mark.skipif(sys.platform != "win32", reason="trava de arquivo do Windows")
def test_salvar_arquivo_em_uso_devolve_409(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    with open(pdf, "rb"):
        status, _, corpo = chamar("PUT", f"/api/arquivo/{ident}", b"%PDF novo")
    assert status == 409
    assert "Petição Inicial (cópia).pdf" in json.loads(corpo)["erro"]
    assert pdf.read_bytes() == b"%PDF-1.7 original"


def test_salvar_como(chamar, falsos, tmp_path):
    falsos.destino = tmp_path / "Área de trabalho 2" / "Petição (cópia).pdf"
    falsos.destino.parent.mkdir()
    status, _, corpo = chamar("POST", "/api/salvar-como", b"%PDF", {"X-Nome-Sugerido": quote("Petição (cópia)")})
    assert status == 200
    assert json.loads(corpo)["nome"] == "Petição (cópia).pdf"
    assert falsos.sugestoes == ["Petição (cópia)"]
    assert falsos.destino.read_bytes() == b"%PDF"


def test_salvar_como_cancelado(chamar, falsos):
    falsos.destino = None
    assert chamar("POST", "/api/salvar-como", b"%PDF")[0] == 204


def test_salvar_varios_numa_pasta_sem_sobrescrever(chamar, falsos, tmp_path):
    falsos.pasta = tmp_path / "Separados"
    falsos.pasta.mkdir()
    pasta = json.loads(chamar("POST", "/api/dialogo/pasta")[2])["id"]
    nome = quote("Procuração.pdf", safe="")
    assert json.loads(chamar("PUT", f"/api/pasta/{pasta}/{nome}", b"1")[2])["nome"] == "Procuração.pdf"
    assert json.loads(chamar("PUT", f"/api/pasta/{pasta}/{nome}", b"2")[2])["nome"] == "Procuração (2).pdf"
    assert chamar("PUT", f"/api/pasta/desconhecida/{nome}", b"3")[0] == 404


def test_rascunhos(chamar):
    assert chamar("PUT", "/api/rascunho/abc", b"%PDF r", {"X-Nome-Arquivo": quote("Petição.pdf")})[0] == 204
    lista = json.loads(chamar("GET", "/api/rascunhos")[2])
    assert [(r["chave"], r["nome"]) for r in lista] == [("abc", "Petição.pdf")]
    assert chamar("GET", "/api/rascunho/abc")[2] == b"%PDF r"
    assert chamar("DELETE", "/api/rascunho/abc")[0] == 204
    assert json.loads(chamar("GET", "/api/rascunhos")[2]) == []
    assert chamar("GET", "/api/rascunho/abc")[0] == 404
    assert chamar("PUT", f"/api/rascunho/{quote('a b')}", b"x")[0] == 400


def test_recentes_ignoram_arquivo_que_sumiu(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    chamar("GET", f"/api/arquivo/{ident}")
    assert [r["nome"] for r in json.loads(chamar("GET", "/api/recentes")[2])] == [pdf.name]
    pdf.unlink()
    assert json.loads(chamar("GET", "/api/recentes")[2]) == []


def test_imagem_da_assinatura(chamar):
    assert chamar("GET", "/api/assinatura-imagem")[0] == 404
    assert chamar("PUT", "/api/assinatura-imagem", b"\x89PNG teste")[0] == 204
    status, cabecalhos, corpo = chamar("GET", "/api/assinatura-imagem")
    assert status == 200 and corpo == b"\x89PNG teste" and cabecalhos["content-type"] == "image/png"


def test_erro_com_pdf_grande_no_pedido_ainda_entrega_a_resposta(chamar):
    # Sem ler o corpo antes de responder, o Windows derruba a conexão e a página vê "erro de rede" em vez da mensagem.
    corpo = b"x" * (4 * 1024 * 1024)
    status, _, dados = chamar("PUT", "/api/arquivo/desconhecido", corpo)
    assert status == 404
    assert "não encontrado" in dados.decode("utf-8")
    assert chamar("PUT", "/api/arquivo/desconhecido", corpo, segredo="errado")[0] == 403


def test_erro_de_disco_vira_mensagem_legivel(chamar, app, pdf):
    ident = _id_de(chamar, app, pdf)
    shutil.rmtree(pdf.parent)  # a pasta sumiu depois que o arquivo foi aberto
    status, _, corpo = chamar("PUT", f"/api/arquivo/{ident}", b"%PDF novo")
    assert status == 500
    assert "Não foi possível acessar o disco" in json.loads(corpo)["erro"]


def test_imprimir_grava_copia_temporaria_e_entrega(chamar, app, falsos):
    assert chamar("POST", "/api/imprimir", b"%PDF imprimir")[0] == 204
    assert len(falsos.impressos) == 1
    assert falsos.impressos[0].parent == app.dados / "impressao"
    assert falsos.impressos[0].read_bytes() == b"%PDF imprimir"
