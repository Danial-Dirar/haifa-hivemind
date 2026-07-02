# PyInstaller spec — bundles the backend so the client needs no Python.
#
#   pip install pyinstaller
#   pyinstaller hivemind-backend.spec
#
# Output (onedir): backend/dist/hivemind-backend/hivemind-backend[.exe]
# onedir (not onefile) => much faster + more reliable startup, and no temp
# extraction on every launch (which antivirus tends to slow down or block).
# The Electron shell auto-detects this path.

from PyInstaller.utils.hooks import collect_all, collect_submodules

datas, binaries, hiddenimports = [], [], []
for pkg in (
    "chromadb", "onnxruntime", "tokenizers", "pypdf", "docx",
    "fastapi", "starlette", "uvicorn", "pydantic", "pydantic_settings",
    "httpx", "anyio", "sniffio", "h11", "multipart",
):
    d, b, h = collect_all(pkg)
    datas += d; binaries += b; hiddenimports += h

# Extra modules PyInstaller's static analysis often misses.
hiddenimports += collect_submodules("chromadb")
hiddenimports += [
    "hnswlib",
    "uvicorn.logging", "uvicorn.loops", "uvicorn.loops.auto",
    "uvicorn.protocols", "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto", "uvicorn.lifespan.on",
    "app", "app.main",
]

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
    pyz, a.scripts, [], exclude_binaries=True,
    name="hivemind-backend",
    console=True,
    disable_windowed_traceback=False,
)
coll = COLLECT(
    exe, a.binaries, a.datas,
    strip=False, upx=False,
    name="hivemind-backend",
)
