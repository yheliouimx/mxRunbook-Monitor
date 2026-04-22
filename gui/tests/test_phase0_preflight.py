"""
Phase 0 pre-flight checks.

These tests verify that:
  1. adapter/convert.py can be imported without openpyxl (the template_generator fix).
  2. NiceGUI exposes every UI element the wizard depends on.

Run with:  pytest gui/tests/test_phase0_preflight.py -v
"""
import sys
import types
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent


def test_adapter_imports_without_openpyxl(monkeypatch):
    """convert.py must be importable even when openpyxl is absent."""
    # Temporarily hide openpyxl from the import system
    real_openpyxl = sys.modules.get("openpyxl")
    monkeypatch.setitem(sys.modules, "openpyxl", None)  # type: ignore[arg-type]

    # Remove cached adapter modules so they re-import
    for key in list(sys.modules):
        if key.startswith(("template_generator", "convert", "adapter")):
            monkeypatch.delitem(sys.modules, key, raising=False)

    sys.path.insert(0, str(REPO_ROOT / "adapter"))
    try:
        import importlib
        mod = importlib.import_module("template_generator")
        assert mod.HAS_OPENPYXL is False
        assert mod.HEADER_REQUIRED_FILL is None

        convert_mod = importlib.import_module("convert")
        assert hasattr(convert_mod, "convert")
        assert hasattr(convert_mod, "detect_format")
    finally:
        sys.path.remove(str(REPO_ROOT / "adapter"))
        if real_openpyxl is not None:
            monkeypatch.setitem(sys.modules, "openpyxl", real_openpyxl)


def test_adapter_imports_normally():
    """convert.py must import cleanly in the normal (openpyxl present) environment."""
    sys.path.insert(0, str(REPO_ROOT / "adapter"))
    try:
        import importlib
        convert_mod = importlib.import_module("convert")
        assert hasattr(convert_mod, "convert")
        assert hasattr(convert_mod, "detect_format")
    finally:
        sys.path.remove(str(REPO_ROOT / "adapter"))


def test_nicegui_api_surface():
    """All NiceGUI elements used by the wizard must be present."""
    import nicegui
    from nicegui import ui

    required = ["stepper", "upload", "table", "card", "select", "expansion", "notify"]
    missing = [name for name in required if not hasattr(ui, name)]
    assert not missing, f"Missing NiceGUI ui elements: {missing} (version {nicegui.__version__})"
