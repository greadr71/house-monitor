import { APPS_SCRIPT_URL, CLIENT_VERSION } from '../config.js';
import { getInstallationId } from '../storage/installation.js';
import { getDeviceList } from '../storage/devices.js';

function basePayload() {
  return {
    installation_id: getInstallationId(),
    client_version: CLIENT_VERSION,
  };
}

/** @param {Array<{ deviceId: string, name: string, placement?: string }>} devices */
export async function syncPlacements(devices) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL не настроен');
  }

  const payload = {
    ...basePayload(),
    action: 'placements',
    devices: devices.map((d) => ({
      device_id: d.deviceId,
      device_name: d.name,
      placement: d.placement || '',
    })),
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchPlacements() {
  if (!APPS_SCRIPT_URL) {
    return { placements: [] };
  }

  const qs = new URLSearchParams({
    action: 'placements',
    installation_id: getInstallationId(),
  });

  const res = await fetch(`${APPS_SCRIPT_URL}?${qs}`);
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

export async function syncAllPlacements() {
  const devices = getDeviceList().filter((d) => d.placement);
  if (!devices.length) return { ok: true, skipped: true };
  return syncPlacements(devices);
}
