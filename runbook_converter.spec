# runbook_converter.spec
# PyInstaller spec for the Runbook Converter GUI.
#
# Build with:
#   pip install pyinstaller>=6.0
#   pyinstaller runbook_converter.spec
#
# Output: dist/RunbookConverter.exe  (Windows)
#         dist/RunbookConverter       (Mac/Linux)

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

REPO_ROOT = Path(SPEC).parent          # directory containing this .spec file
NICEGUI_DIR = Path(
    __import__("importlib.util", fromlist=["find_spec"])
    .find_spec("nicegui").origin
).parent

# ── Data files ────────────────────────────────────────────
datas = [
    # NiceGUI bundles its own static web assets (JS, CSS, fonts, Vue).
    # All of them must travel with the exe.
    (str(NICEGUI_DIR), "nicegui"),
]

# ── Hidden imports ────────────────────────────────────────
# Static analysis misses dynamically-loaded modules.
hiddenimports = [
    # gui package — all page and component modules
    "gui",
    "gui.state",
    "gui.bridge",
    "gui.theme",
    "gui.pages",
    "gui.pages.step1_import",
    "gui.pages.step2_mapping",
    "gui.pages.step3_preview",
    "gui.pages.step4_export",
    "gui.components",
    "gui.components.glass_card",
    "gui.components.status_badge",
    "gui.components.step_header",
    # adapter package (imported at runtime via sys.path in bridge.py)
    "adapter",
    "adapter.convert",
    "adapter.schema",
    "adapter.quality",
    "adapter.autodetect",
    # NiceGUI / web server internals
    "nicegui",
    "uvicorn",
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "fastapi",
    "starlette",
    "starlette.routing",
    # pywebview (native window)
    "webview",
    # file-format libs
    "openpyxl",
    "yaml",
    # standard libs sometimes missed on Windows
    "multiprocessing",
    "multiprocessing.freeze_support",
]
hiddenimports += collect_submodules("nicegui")
hiddenimports += collect_submodules("adapter")

# ── Analysis ──────────────────────────────────────────────
a = Analysis(
    [str(REPO_ROOT / "gui" / "app.py")],
    pathex=[
        str(REPO_ROOT),
        str(REPO_ROOT / "adapter"),
    ],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "unittest", "pytest"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="RunbookConverter",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # no terminal window on Windows
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(REPO_ROOT / "assets" / "icon.ico"),
)
