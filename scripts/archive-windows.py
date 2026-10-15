"""ZIP the portable folder, always excluding private runtime data."""
from pathlib import Path
import hashlib
import json
import zipfile
import os

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
source = Path(os.environ.get('UTA_PACKAGE_SOURCE', root / 'release' / 'UTA-Windows-x64')).resolve()
target = Path(os.environ.get('UTA_ARCHIVE_TARGET', root / 'release' / f'UTA-{version}-Windows-x64.zip')).resolve()
current = json.loads((source / 'current.json').read_text(encoding='utf-8'))['version']
if current != version:
    raise SystemExit('Packaged version does not match package.json')
target.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in source.rglob('*'):
        relative = file.relative_to(source)
        if file.is_file() and relative.parts[0] != 'uta-data' and \
                not (relative.parts[0] == 'versions' and len(relative.parts) > 1 and relative.parts[1] != version):
            archive.write(file, Path('UTA-Windows-x64') / relative)
with target.open('rb') as file:
    checksum = hashlib.file_digest(file, 'sha256').hexdigest()
target.with_suffix('.zip.sha256').write_text(f'{checksum}  {target.name}\n', encoding='utf-8')
print(f'{target} ({target.stat().st_size / 1048576:.1f} MB)\nSHA-256: {checksum}')
