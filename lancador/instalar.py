"""Põe o Editor PDF no "Abrir com" dos PDFs e cria o atalho na área de trabalho. Desfazer: desinstalar.py."""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import winreg
from pathlib import Path

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA))

from editor_pdf.registro import NOME, entradas  # noqa: E402

SCRIPT = PASTA / "editor_pdf.pyw"
CRIAR_ATALHO = (
    "$d=[Environment]::GetFolderPath('Desktop');"
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d ($env:ED_NOME+'.lnk')));"
    "$s.TargetPath=$env:ED_ALVO;$s.Arguments='\"'+$env:ED_SCRIPT+'\"';$s.WorkingDirectory=$env:ED_PASTA;$s.Save()"
)


def pythonw() -> Path:
    candidato = Path(sys.executable).with_name("pythonw.exe")
    return candidato if candidato.is_file() else Path(sys.executable)


def main() -> None:
    for chave, nome, dado in entradas(pythonw(), SCRIPT):
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, chave) as aberta:
            winreg.SetValueEx(aberta, nome, 0, winreg.REG_SZ, dado)
    # Os caminhos vão por variável de ambiente para não depender de aspas dentro do comando do PowerShell.
    ambiente = {**os.environ, "ED_NOME": NOME, "ED_ALVO": str(pythonw()), "ED_SCRIPT": str(SCRIPT), "ED_PASTA": str(PASTA)}
    subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", CRIAR_ATALHO], check=True, env=ambiente)
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)  # avisa o Explorer que as associações mudaram
    print(f'Pronto. "{NOME}" aparece no "Abrir com" dos PDFs e tem atalho na área de trabalho.')


if __name__ == "__main__":
    main()
