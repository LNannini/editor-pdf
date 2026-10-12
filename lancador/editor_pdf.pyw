"""Atalho para rodar o editor com pythonw.exe, sem janela de console."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from editor_pdf.principal import main  # noqa: E402

raise SystemExit(main(sys.argv))
