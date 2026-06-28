import { APPS_SCRIPT_URL } from '../config.js';
import { getInstallationId } from '../storage/installation.js';
import { cacheHistory, getCachedHistory } from '../storage/queue.js';

/**
 * @param {{ period?: string, devices?: string[] }} params
 */
export async function fetchHistory(params = {}) {
  const { period = '7d', devices = [] } = params;

  if (!APPS_SCRIPT_URL) {
    const cached = getCachedHistory();
    if (cached) return { ...cached.data, cached: true, cachedAt: cached.cachedAt };
    throw new Error('APPS_SCRIPT_URL не настроен');
  }

  const qs = new URLSearchParams({
    action: 'history',
    installation_id: getInstallationId(),
    period,
  });
  if (devices.length) qs.set('devices', devices.join(','));

  const url = `${APPS_SCRIPT_URL}?${qs}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    const cached = getCachedHistory();
    if (cached) return { ...cached.data, cached: true, cachedAt: cached.cachedAt };
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  cacheHistory(data);
  return data;
}
