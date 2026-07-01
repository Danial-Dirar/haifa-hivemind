# PyInstaller spec — bundles the backend into a single self-contained binary
# so the client doesn't need Python installed.
#
#   pip install pyinstaller
#   pyinstaller hivemind-backend.spec
#
# Output: backend/dist/hivemind-backend[.exe]  (the Electron shell auto-detects it)

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []
for pkg in ("chromadb", "chromadb.telemetry", "onnxruntime", "tokenizers",
            "pypdf", "docx"):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hiddenimports += h

hiddenimports += ["uvicorn.logging", "uvicorn.protocols", "uvicorn.lifespan.on",
                  "uvicorn.protocols.http.auto", "uvicorn.protocols.websockets.auto"]

a = Analysis(
    ["run.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, a.binaries, a.datas, [],
    name="hivemind-backend",
    console=True,
    disable_windowed_traceback=False,
    upx=True,
)
