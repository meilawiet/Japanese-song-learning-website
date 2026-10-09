"""Install the open dictionary locally, checking the pinned release hashes."""
from pathlib import Path
import hashlib
import shutil
import sqlite3
from urllib.request import urlopen, Request
import zstandard

root = Path(__file__).resolve().parents[1]
database = root / 'server' / 'data' / 'tomoshi-dict-open.db'
database.parent.mkdir(parents=True, exist_ok=True)

def validate(filename):
    with sqlite3.connect(f'{filename.as_uri()}?mode=ro', uri=True) as connection:
        for table in ('entries', 'forms', 'zh_defs', 'table_licenses'):
            connection.execute(f'SELECT 1 FROM {table} LIMIT 1').fetchone()

if database.exists():
    validate(database)
    print('Using existing local Tomoshi dictionary.')
else:
    compressed = database.with_suffix('.partial.zst')
    expanded = database.with_suffix('.partial.db')
    url = 'https://github.com/tomoshi-app/tomoshi-dict-data/releases/download/v2026-10-07/tomoshi-dict-open.db.zst'
    def digest(filename):
        with filename.open('rb') as file:
            return hashlib.file_digest(file, 'sha256').hexdigest()
    try:
        print('Downloading Tomoshi dictionary into server/data...')
        with urlopen(Request(url, headers={'User-Agent': 'UTA-Windows-Setup'}), timeout=120) as response, compressed.open('wb') as output:
            shutil.copyfileobj(response, output)
        if digest(compressed) != 'daa44935c654a4face33f873250484cca16a1bf846d700a8d7611b113953227f':
            raise ValueError('Compressed dictionary checksum mismatch')
        with compressed.open('rb') as source, expanded.open('wb') as output:
            zstandard.ZstdDecompressor().copy_stream(source, output)
        if digest(expanded) != '7c3479bcde859772403045da21cf975decd92e492142b50453354a0ad35ea7ed':
            raise ValueError('Dictionary checksum mismatch')
        validate(expanded)
        expanded.replace(database)
        print('Tomoshi dictionary installed and verified.')
    finally:
        compressed.unlink(missing_ok=True)
        expanded.unlink(missing_ok=True)
