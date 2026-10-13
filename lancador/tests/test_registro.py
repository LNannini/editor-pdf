from __future__ import annotations

from pathlib import Path

from editor_pdf.registro import NOME, PROGID, chaves_a_remover, entradas, valores_a_remover


def test_entradas_do_abrir_com():
    pythonw = Path(r"C:\Users\lucas\AppData\Local\Programs\Python\Python313\pythonw.exe")
    script = Path(r"C:\Users\lucas\Downloads\editor-pdf\lancador\editor_pdf.pyw")
    lista = entradas(pythonw, script)
    comando = f'"{pythonw}" "{script}" "%1"'
    assert (rf"Software\Classes\{PROGID}\shell\open\command", "", comando) in lista
    assert (rf"Software\Classes\{PROGID}\shell\open", "FriendlyAppName", NOME) in lista
    assert (r"Software\Classes\.pdf\OpenWithProgids", PROGID, "") in lista
    assert all(chave.startswith("Software\\Classes\\") for chave, _, _ in lista)


def test_caminho_com_espaco_e_acento_fica_entre_aspas():
    lista = entradas(Path(r"C:\Program Files\Python\pythonw.exe"), Path(r"C:\Área de trabalho\editor_pdf.pyw"))
    comando = next(dado for chave, _, dado in lista if chave.endswith(r"\command"))
    assert comando == r'"C:\Program Files\Python\pythonw.exe" "C:\Área de trabalho\editor_pdf.pyw" "%1"'


def test_remocao_apaga_so_o_que_e_do_editor():
    chaves = chaves_a_remover()
    assert chaves[0].endswith(r"\shell\open\command")
    assert chaves[-1] == rf"Software\Classes\{PROGID}"
    assert valores_a_remover() == [(r"Software\Classes\.pdf\OpenWithProgids", PROGID)]
