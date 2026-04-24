# runbook_converter.spec
# PyInstaller spec for the Runbook Converter GUI.
#
# Build with:
#   pip install pyinstaller>=6.0
#   pyinstaller runbook_converter.spec --clean
#
# Output: dist/RunbookConverter.exe  (Windows)
#         dist/RunbookConverter       (Mac/Linux)
#
# Size budget (target ~60 MB):
#   Python runtime           ~15 MB
#   NiceGUI static + used elements  ~8 MB
#   uvicorn + fastapi        ~5 MB
#   pywebview                ~10-20 MB
#   openpyxl + pyyaml        ~5 MB
#   adapter + gui code       ~1 MB

import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules

REPO_ROOT  = Path(SPEC).parent
NICEGUI_DIR = Path(
    __import__("importlib.util", fromlist=["find_spec"])
    .find_spec("nicegui").origin
).parent

# ── Heavy NiceGUI element JS bundles we never use ─────────
# These are subdirectories inside nicegui/elements/ that ship
# large third-party JS frameworks (Plotly 15 MB, ECharts 10 MB,
# Mermaid 8.6 MB, CodeMirror 6 MB, AgGrid 4.4 MB …).
# Excluding them shaves ~55 MB from the final binary.
UNUSED_ELEMENT_DIRS = {
    "plotly", "echart", "mermaid", "codemirror", "aggrid",
    "json_editor", "scene", "leaflet", "xterm",
    "joystick", "anywidget",
}

# ── Data files (selective copy) ───────────────────────────
datas = []

for item in NICEGUI_DIR.iterdir():
    dest_prefix = f"nicegui/{item.name}"
    if item.name == "elements" and item.is_dir():
        # Copy element subdirs, skipping unused heavy ones
        for elem in item.iterdir():
            if elem.is_dir() and elem.name in UNUSED_ELEMENT_DIRS:
                continue
            datas.append((str(elem), f"nicegui/elements/{elem.name}"))
    elif item.name in ("testing", "tests", "__pycache__"):
        # Skip test infrastructure
        continue
    else:
        datas.append((str(item), dest_prefix))

# ── Hidden imports ────────────────────────────────────────
# We do NOT use collect_submodules("nicegui") — it forces
# analysis of all 230 NiceGUI .py files and is the primary
# cause of the 10-minute build time.
#
# Instead we list only:
#  (a) gui/* modules (dynamically imported via sys.path in the frozen exe)
#  (b) adapter/* modules (same reason)
#  (c) NiceGUI internals that NiceGUI loads dynamically at runtime
#      and that PyInstaller's static trace misses
#  (d) server/webview plumbing

hiddenimports = [
    # ── gui package ──────────────────────────────────────
    "gui", "gui.state", "gui.bridge", "gui.theme",
    "gui.pages", "gui.pages.step1_import",
    "gui.pages.step2_mapping", "gui.pages.step3_preview",
    "gui.pages.step4_export",
    "gui.components", "gui.components.glass_card",
    "gui.components.status_badge", "gui.components.step_header",

    # ── adapter package ──────────────────────────────────
    "adapter", "adapter.convert", "adapter.schema",
    "adapter.quality", "adapter.autodetect",

    # ── NiceGUI internals (dynamically loaded) ───────────
    # native / pywebview glue
    "nicegui.native", "nicegui.native.native_config",
    "nicegui.native.native_mode",
    # storage + persistence
    "nicegui.storage", "nicegui.persistence",
    "nicegui.json",
    # server plumbing
    "nicegui.server", "nicegui.core",
    "nicegui.background_tasks", "nicegui.outbox",
    "nicegui.observables", "nicegui.binding",
    "nicegui.app",
    # helpers
    "nicegui.functions", "nicegui.helpers",
    "nicegui.staticfiles",

    # ── uvicorn / ASGI ───────────────────────────────────
    "uvicorn", "uvicorn.logging",
    "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan", "uvicorn.lifespan.on",

    # ── web framework ────────────────────────────────────
    "fastapi", "starlette", "starlette.routing",
    "starlette.staticfiles", "starlette.middleware",
    "starlette.middleware.cors",
    "starlette.responses", "starlette.websockets",

    # ── pywebview ────────────────────────────────────────
    "webview",

    # ── file-format libs ─────────────────────────────────
    "openpyxl", "openpyxl.styles", "openpyxl.utils",
    "yaml",

    # ── stdlib sometimes missed by PyInstaller ───────────
    "multiprocessing", "multiprocessing.freeze_support",
    "importlib.metadata",
]

# ── Analysis ──────────────────────────────────────────────
a = Analysis(
    [str(REPO_ROOT / "gui" / "app.py")],
    pathex=[
        str(REPO_ROOT),          # lets PyInstaller find gui.*
        str(REPO_ROOT / "adapter"),
    ],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        # test infrastructure
        "tkinter", "_tkinter", "unittest", "pytest", "doctest",
        # heavy NiceGUI element Python modules we'll never call
        "nicegui.elements.plotly",
        "nicegui.elements.echart",
        "nicegui.elements.mermaid",
        "nicegui.elements.codemirror",
        "nicegui.elements.aggrid",
        "nicegui.elements.json_editor",
        "nicegui.elements.scene",
        "nicegui.elements.leaflet",
        "nicegui.elements.xterm",
        "nicegui.elements.joystick",
        "nicegui.elements.anywidget",
        # charting/plotting element .py files
        "nicegui.elements.altair",
        "nicegui.elements.pyplot",
        "nicegui.elements.line_plot",
        "nicegui.elements.highchart",
        # media
        "nicegui.elements.video",
        "nicegui.elements.audio",
        # NiceGUI test helpers
        "nicegui.testing",
        # data-science stack (not installed here, but guard against
        # accidental pulls from a non-clean environment)
        "matplotlib", "numpy", "pandas", "scipy",
        "PIL", "Pillow", "cv2", "sklearn",
        "IPython", "jupyter", "docutils",
    ],
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
    # UPX shrinks the exe by ~20% but adds several minutes to build.
    # Set env var UPX=1 to enable: UPX=1 pyinstaller runbook_converter.spec
    upx=os.environ.get("UPX", "0") == "1",
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(REPO_ROOT / "assets" / "icon.ico"),
)
