"""ZIP the portable folder, always excluding private runtime data."""
from pathlib import Path
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
source = root / 'release' / 'UTA-Windows-x64'
target = root / 'release' / f'UTA-{version}-Windows-x64.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
    for file in source.rglob('*'):
        relative = file.relative_to(source)
        if file.is_file() and relative.parts[0] != 'uta-data':
            archive.write(file, Path(source.name) / relative)
with target.open('rb') as file:
    checksum = hashlib.file_digest(file, 'sha256').hexdigest()
target.with_suffix('.zip.sha256').write_text(f'{checksum}  {target.name}\n', encoding='utf-8')
print(f'{target} ({target.stat().st_size / 1048576:.1f} MB)\nSHA-256: {checksum}')
