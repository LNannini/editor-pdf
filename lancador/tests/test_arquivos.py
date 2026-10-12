from __future__ import annotations

import os
import sys
import time
from datetime import datetime
from pathlib import Path

import pytest

from editor_pdf.arquivos import ArquivoEmUso, caminho_livre, limpar_antigos, nome_seguro, salvar_atomico


def test_cria_arquivo_novo_sem_backup(tmp_path: Path):
    destino = tmp_path / "novo.pdf"
    assert salvar_atomico(destino, b"conteudo", tmp_path / "versoes") is None
    assert destino.read_bytes() == b"conteudo"


def test_guarda_a_versao_anterior_com_data_no_nome(pdf: Path, tmp_path: Path):
    versoes = tmp_path / "versoes"
    copia = salvar_atomico(pdf, b"%PDF novo", versoes, agora=datetime(2026, 10, 12, 9, 30, 0))
    assert pdf.read_bytes() == b"%PDF novo"
    assert copia == versoes / "2026-10-12_09-30-00 Petição Inicial (cópia).pdf"
    assert copia.read_bytes() == b"%PDF-1.7 original"


def test_backup_de_arquivo_antigo_nao_e_apagado_na_limpeza(pdf: Path, tmp_path: Path):
    antigo = time.time() - 400 * 86400
    os.utime(pdf, (antigo, antigo))
    copia = salvar_atomico(pdf, b"%PDF novo", tmp_path / "versoes")
    assert copia is not None
    assert limpar_antigos(tmp_path / "versoes", 30) == 0
    assert copia.exists()


@pytest.mark.skipif(sys.platform != "win32", reason="trava de arquivo do Windows")
def test_arquivo_aberto_em_outro_programa(pdf: Path, tmp_path: Path):
    versoes = tmp_path / "versoes"
    with open(pdf, "rb"):
        with pytest.raises(ArquivoEmUso) as erro:
            salvar_atomico(pdf, b"%PDF novo", versoes)
    assert "Petição Inicial (cópia).pdf" in str(erro.value)
    assert pdf.read_bytes() == b"%PDF-1.7 original"
    assert [p.name for p in pdf.parent.iterdir()] == [pdf.name]
    assert not versoes.exists() or list(versoes.iterdir()) == []


def test_limpa_so_o_que_passou_do_prazo(tmp_path: Path):
    velho, novo = tmp_path / "velho.pdf", tmp_path / "novo.pdf"
    velho.write_bytes(b"1")
    novo.write_bytes(b"2")
    antigo = time.time() - 31 * 86400
    os.utime(velho, (antigo, antigo))
    assert limpar_antigos(tmp_path, 30) == 1
    assert not velho.exists() and novo.exists()
    assert limpar_antigos(tmp_path / "nao-existe", 30) == 0


def test_nome_seguro():
    assert nome_seguro('Procuração: "João"/2026?.pdf') == "Procuração_ _João__2026_.pdf"
    assert nome_seguro("Contestação") == "Contestação.pdf"
    assert nome_seguro("CON") == "_CON.pdf"
    assert nome_seguro("   ") == "documento.pdf"
    assert nome_seguro(" nome. ") == "nome.pdf"


def test_caminho_livre(tmp_path: Path):
    assert caminho_livre(tmp_path, "a.pdf") == tmp_path / "a.pdf"
    (tmp_path / "a.pdf").write_bytes(b"")
    assert caminho_livre(tmp_path, "a.pdf") == tmp_path / "a (2).pdf"
    (tmp_path / "a (2).pdf").write_bytes(b"")
    assert caminho_livre(tmp_path, "a.pdf") == tmp_path / "a (3).pdf"
