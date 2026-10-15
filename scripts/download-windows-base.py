"""Download the most recent older Windows full ZIP into work/update-base.

This is build-time only. It never extracts user data or writes outside work/.
"""
from pathlib import Path, PurePosixPath
import json
import hashlib
import os
import re
import shutil
import urllib.request
import zipfile

root = Path(__file__).resolve().parents[1]
current = json.loads((root / 'package.json').read_text(encoding='utf-8'))['version']
work = (root / 'work' / 'update-base').resolve()
if work.parent != (root / 'work').resolve():
    raise SystemExit('Unsafe update baseline folder')
if work.exists():
    shutil.rmtree(work)
work.mkdir(parents=True, exist_ok=True)
headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'UTA-Windows-Release-Builder'}
if os.environ.get('GITHUB_TOKEN'):
    headers['Authorization'] = f"Bearer {os.environ['GITHUB_TOKEN']}"
api = 'https://api.github.com/repos/meilawiet/Japanese-song-learning-website/releases?per_page=100'
with urllib.request.urlopen(urllib.request.Request(api, headers=headers), timeout=30) as response:
    releases = json.load(response)

def order(version):
    return tuple(map(int, version.split('.')))

candidates = []
for release in releases:
    match = re.fullmatch(r'windows-v(\d+\.\d+\.\d+)', release.get('tag_name', ''))
    if not match or release.get('draft') or release.get('prerelease') or order(match[1]) >= order(current):
        continue
    filename = f"UTA-{match[1]}-Windows-x64.zip"
    asset = next((asset for asset in release.get('assets', []) if asset.get('name') == filename), None)
    if asset:
        candidates.append((order(match[1]), release, asset))
if not candidates:
    raise SystemExit('No older Windows full ZIP was found; specify a local baseline manually.')
_, previous_release, asset = max(candidates, key=lambda item: item[0])
download = work / 'baseline.zip'
with urllib.request.urlopen(urllib.request.Request(asset['browser_download_url'], headers={'User-Agent': 'UTA-Windows-Release-Builder'}), timeout=120) as source, download.open('wb') as target:
    while chunk := source.read(1024 * 1024):
        target.write(chunk)
checksum_asset = next((item for item in previous_release.get('assets', [])
                       if item.get('name') == asset['name'] + '.sha256'), None)
if not checksum_asset:
    raise SystemExit('Previous Windows release has no SHA-256 file')
with urllib.request.urlopen(urllib.request.Request(checksum_asset['browser_download_url'], headers={'User-Agent': 'UTA-Windows-Release-Builder'}), timeout=30) as source:
    checksum_line = source.read(1024).decode('ascii').strip()
match = re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?([^\s]+)', checksum_line)
if not match or match[2] != asset['name']:
    raise SystemExit('Previous Windows checksum file is invalid')
with download.open('rb') as source:
    digest = hashlib.file_digest(source, 'sha256').hexdigest()
if digest != match[1].lower():
    raise SystemExit('Previous Windows ZIP failed SHA-256 verification')

with zipfile.ZipFile(download) as archive:
    for entry in archive.infolist():
        if entry.is_dir():
            continue
        name = PurePosixPath(entry.filename)
        if name.is_absolute() or '..' in name.parts or not name.parts or name.parts[0] != 'UTA-Windows-x64' or \
                len(name.parts) < 2 or name.parts[1] == 'uta-data' or '\\' in entry.filename:
            raise SystemExit(f'Unsafe baseline entry: {entry.filename}')
        destination = work.joinpath(*name.parts)
        destination.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(entry) as source, destination.open('wb') as target:
            while chunk := source.read(1024 * 1024):
                target.write(chunk)
print(f"Previous Windows baseline: {work / 'UTA-Windows-x64'}")
