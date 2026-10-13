from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

from editor_pdf import dialogos, janela

LANCADOR = Path(__file__).resolve().parents[1]


def test_janela_propria_carrega_o_editor_com_o_segredo_e_devolve_o_controle_ao_fechar(servidor, web):
    # A janela abre oculta: nada aparece na tela durante o teste.
    (web / "index.html").write_text(
        "<html><head><title>carregando</title></head><body><script>"
        "const segredo = document.querySelector('meta[name=editor-segredo]').content;"
        "fetch('/api/pendentes', { headers: { 'X-Editor-Segredo': segredo } })"
        ".then((r) => r.json()).then((lista) => { document.title = 'ok ' + lista.length; });"
        "</script></body></html>",
        encoding="utf-8",
    )
    titulos = []

    def ao_abrir(aberta):
        fim = time.monotonic() + 20
        while time.monotonic() < fim:
            titulo = aberta.evaluate_js("document.title") or ""
            if titulo.startswith("ok"):
                titulos.append(titulo)
                break
            time.sleep(0.2)
        aberta.destroy()

    inicio = time.monotonic()
    janela.abrir_janela(f"http://127.0.0.1:{servidor.porta}/", "Editor PDF", ao_abrir=ao_abrir, oculta=True)
    assert titulos == ["ok 0"]
    assert time.monotonic() - inicio < 25


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
