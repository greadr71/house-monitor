const STORAGE_KEY = 'house_monitor_devices';

/** @typedef {{ deviceId: string, name: string, bleName: string, placement?: string }} SavedDevice */

/** @returns {Record<string, SavedDevice>} */
export function getDevices() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** @param {Record<string, SavedDevice>} devices */
export function saveDevices(devices) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
}

/** @param {SavedDevice} device */
export function addDevice(device) {
  const devices = getDevices();
  const key = device.deviceId || crypto.randomUUID();
  devices[key] = { ...device, deviceId: key, placement: device.placement || '' };
  saveDevices(devices);
  return key;
}

/** @param {string} deviceId @param {Partial<SavedDevice>} patch */
export function updateDevice(deviceId, patch) {
  const devices = getDevices();
  if (!devices[deviceId]) return false;
  devices[deviceId] = { ...devices[deviceId], ...patch };
  saveDevices(devices);
  return true;
}

export function getDeviceById(deviceId) {
  return getDevices()[deviceId];
}

export function removeDevice(deviceId) {
  const devices = getDevices();
  delete devices[deviceId];
  saveDevices(devices);
}

export function getDeviceList() {
  return Object.values(getDevices());
}

/** @param {Array<{ device_name: string, device_id?: string, placement: string }>} remote */
export function mergeRemotePlacements(remote) {
  if (!remote?.length) return;
  const devices = getDevices();
  let changed = false;

  for (const row of remote) {
    const match = Object.values(devices).find(
      (d) => d.deviceId === row.device_id || d.name === row.device_name,
    );
    if (match && row.placement !== undefined && match.placement !== row.placement) {
      devices[match.deviceId].placement = row.placement;
      changed = true;
    }
  }

  if (changed) saveDevices(devices);
}
