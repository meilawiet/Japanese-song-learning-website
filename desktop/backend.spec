from PyInstaller.utils.hooks import collect_all
from pathlib import Path

root = Path(SPECPATH).parent
datas, binaries, hiddenimports = [], [], []
for package in ('sudachipy', 'sudachidict_core'):
    package_datas, package_binaries, package_imports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_imports

a = Analysis([str(root / 'server' / 'desktop_api.py')], pathex=[str(root / 'server')],
             binaries=binaries, datas=datas, hiddenimports=hiddenimports,
             excludes=['tkinter', 'pytest', 'zeroconf', 'zstandard', 'IPython'],
             noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='uta-backend',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='uta-backend')
