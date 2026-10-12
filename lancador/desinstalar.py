"""Desfaz o que instalar.py fez: tira o editor do "Abrir com" e apaga o atalho."""

from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import winreg
from pathlib import Path

PASTA = Path(__file__).resolve().parent
sys.path.insert(0, str(PASTA))

from editor_pdf.registro import NOME, chaves_a_remover, valores_a_remover  # noqa: E402

APAGAR_ATALHO = (
    "$d=[Environment]::GetFolderPath('Desktop');"
    "$a=Join-Path $d ($env:ED_NOME+'.lnk');if(Test-Path $a){Remove-Item $a}"
)


def main() -> None:
    for chave, nome in valores_a_remover():
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, chave, 0, winreg.KEY_SET_VALUE) as aberta:
                winreg.DeleteValue(aberta, nome)
        except FileNotFoundError:
            pass
    for chave in chaves_a_remover():
        try:
            winreg.DeleteKey(winreg.HKEY_CURRENT_USER, chave)
        except FileNotFoundError:
            pass
    subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", APAGAR_ATALHO],
        check=True,
        env={**os.environ, "ED_NOME": NOME},
    )
    ctypes.windll.shell32.SHChangeNotify(0x08000000, 0, None, None)
    print(f'"{NOME}" saiu do "Abrir com" e o atalho foi apagado.')


if __name__ == "__main__":
    main()
