import {
  APPS_SCRIPT_URL,
  DATA_BACKEND,
  DEMO_MODE,
} from '../config.js';
import { getInstallationId } from '../storage/installation.js';
import { cacheHistory, getCachedHistory } from '../storage/queue.js';

function demoHistory(period) {
  const now = Date.now();
  const days = period === '7d' ? 7 : period === '30d' ? 30 : 14;
  const records = [];
  const sensors = ['Дом', 'Улица'];

  for (let d = days; d >= 0; d -= 1) {
    for (let h = 8; h <= 20; h += 4) {
      for (const name of sensors) {
        const base = name === 'Дом' ? 21 : 26;
        records.push({
          timestamp: new Date(now - d * 86400000 + h * 3600000).toISOString(),
          device_name: name,
          temperature: +(base + Math.sin(d + h) * 2.3 + Math.random()).toFixed(1),
          humidity: +(48 + Math.cos(d) * 6 + Math.random() * 3).toFixed(0),
          battery: +(90 + Math.random() * 8).toFixed(0),
          comment: d === 0 && h === 8 ? 'Утренний замер' : '',
        });
      }
    }
  }
  return { records };
}

/**
 * @param {{ period?: string, devices?: string[] }} params
 */
export async function fetchHistory(params = {}) {
  const { period = '7d', devices = [] } = params;

  if (DATA_BACKEND === 'demo' || (DEMO_MODE && !APPS_SCRIPT_URL)) {
    const data = demoHistory(period);
    cacheHistory(data);
    return data;
  }

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
