const path = require('node:path');

const APP_ORIGIN = 'uta://app';

function resolveAssetPath(root, requestUrl) {
  const url = new URL(requestUrl);
  if (url.origin !== 'null' && url.origin !== APP_ORIGIN) throw new Error('Invalid origin');
  if (url.protocol !== 'uta:' || url.host !== 'app' || url.username || url.password) throw new Error('Invalid origin');
  const decoded = decodeURIComponent(url.pathname);
  if (decoded.includes('\\') || decoded.includes('\0')) throw new Error('Invalid asset path');
  const target = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid asset path');
  return target;
}

function isExternalUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

module.exports = { APP_ORIGIN, resolveAssetPath, isExternalUrl };
