// Pure reader state and URL boundaries. Storage is deliberately accessed lazily.
export function parsePageHash(hash, totalPages) {
  if (typeof hash !== 'string' || !/^#p=[1-9]\d*$/.test(hash)) return null;
  const page = Number(hash.slice(3));
  return validPage(page, totalPages) ? page : null;
}

function validPage(page, totalPages) {
  return Number.isSafeInteger(page) && page >= 1 && page <= totalPages;
}

function validPosition(position, totalPages) {
  return position && validPage(position.page, totalPages) &&
    typeof position.offset === 'number' && Number.isFinite(position.offset) &&
    position.offset >= 0 && position.offset <= 1;
}

export function clampPage(page, totalPages) {
  return typeof page === 'number' && Number.isFinite(page)
    ? Math.min(totalPages, Math.max(1, Math.trunc(page))) : 1;
}

export function chooseStart(hash, saved, totalPages) {
  if (hash) return { page: parsePageHash(hash, totalPages) ?? 1, offset: 0 };
  return validPosition(saved, totalPages)
    ? { page: saved.page, offset: saved.offset } : { page: 1, offset: 0 };
}

export function readProgress(getStorage, key, version, totalPages) {
  try {
    const saved = JSON.parse(getStorage()?.getItem(key) ?? 'null');
    return saved?.version === version && validPosition(saved, totalPages)
      ? { page: saved.page, offset: saved.offset } : null;
  } catch { return null; }
}

export function writeProgress(getStorage, key, version, position, totalPages) {
  try {
    if (!validPage(position?.page, totalPages) || typeof position.offset !== 'number' || !Number.isFinite(position.offset)) return false;
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify({ version, page: position.page, offset: Math.max(0, Math.min(1, position.offset)) }));
    return true;
  } catch { return false; }
}

export function assetURL(relative, documentURL) {
  try {
    if (relative === 'https://github.com/kawauso9991/orukan-manga/releases/download/v13/p039-hq.webp' ||
        relative === 'https://github.com/kawauso9991/orukan-manga/releases/download/v13/p041-hq.webp') return relative;
    if (typeof relative !== 'string' || !relative || /[\s\\]/.test(relative) || relative.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(relative)) return null;
    const base = new URL('.', documentURL);
    const url = new URL(relative, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}

export function externalURL(value) {
  try {
    if (typeof value !== 'string' || /[\s\\]/.test(value)) return null;
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? value : null;
  } catch { return null; }
}
