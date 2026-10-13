"""Entradas do registro do Windows para o editor aparecer no "Abrir com" dos PDFs.

Tudo fica em HKEY_CURRENT_USER, sem administrador, e o leitor padrão de PDF não muda.
"""

from __future__ import annotations

from pathlib import Path

PROGID = "EditorPDF.Documento"
NOME = "Editor PDF"
BASE = r"Software\Classes"


def entradas(pythonw: Path, script: Path) -> list[tuple[str, str, str]]:
    comando = f'"{pythonw}" "{script}" "%1"'
    return [
        (rf"{BASE}\{PROGID}", "", f"Documento PDF ({NOME})"),
        (rf"{BASE}\{PROGID}\shell\open", "FriendlyAppName", NOME),
        (rf"{BASE}\{PROGID}\shell\open\command", "", comando),
        (rf"{BASE}\.pdf\OpenWithProgids", PROGID, ""),
    ]


def chaves_a_remover() -> list[str]:
    return [
        rf"{BASE}\{PROGID}\shell\open\command",
        rf"{BASE}\{PROGID}\shell\open",
        rf"{BASE}\{PROGID}\shell",
        rf"{BASE}\{PROGID}",
    ]


def valores_a_remover() -> list[tuple[str, str]]:
    return [(rf"{BASE}\.pdf\OpenWithProgids", PROGID)]
