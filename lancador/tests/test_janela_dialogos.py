from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from editor_pdf import dialogos, janela

LANCADOR = Path(__file__).resolve().parents[1]


def test_comando_da_janela_sem_barra_e_com_perfil_proprio(tmp_path):
    edge = Path(r"C:\Edge\msedge.exe")
    comando = janela.comando_janela(edge, "http://127.0.0.1:5000/", tmp_path / "perfil")
    assert comando[0] == str(edge)
    assert "--app=http://127.0.0.1:5000/" in comando
    assert f"--user-data-dir={tmp_path / 'perfil'}" in comando
    assert "--no-first-run" in comando


def test_localiza_o_edge_pelas_pastas_do_windows(tmp_path, monkeypatch):
    falso = tmp_path / "Microsoft" / "Edge" / "Application" / "msedge.exe"
    falso.parent.mkdir(parents=True)
    falso.write_bytes(b"")
    monkeypatch.setenv("ProgramFiles(x86)", str(tmp_path / "nada"))
    monkeypatch.setenv("ProgramFiles", str(tmp_path))
    monkeypatch.setenv("LOCALAPPDATA", str(tmp_path / "nada"))
    assert janela.localizar_edge() == falso


def test_comando_de_imprimir():
    assert janela.comando_imprimir(Path("msedge.exe"), Path(r"C:\x\a b.pdf")) == ["msedge.exe", r"C:\x\a b.pdf"]


def test_dialogos_convertem_a_resposta_do_processo():
    assert dialogos.escolher_pdfs(executar=lambda acao, arg: [r"C:\x\Petição.pdf"]) == [Path(r"C:\x\Petição.pdf")]
    assert dialogos.escolher_pdfs(executar=lambda acao, arg: None) == []
    assert dialogos.escolher_destino("a", executar=lambda acao, arg: r"C:\x\a.pdf") == Path(r"C:\x\a.pdf")
    assert dialogos.escolher_destino("a", executar=lambda acao, arg: None) is None
    assert dialogos.escolher_pasta(executar=lambda acao, arg: None) is None


def test_processo_de_dialogo_recusa_acao_desconhecida_sem_abrir_janela():
    resultado = subprocess.run(
        [sys.executable, "-m", "editor_pdf.dialogos", "acao-que-nao-existe"], cwd=LANCADOR, capture_output=True, timeout=20
    )
    assert resultado.returncode == 2
