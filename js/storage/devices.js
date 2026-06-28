const STORAGE_KEY = 'house_monitor_devices';

/** @typedef {{ deviceId: string, name: string, bleName: string }} SavedDevice */

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
  devices[key] = { ...device, deviceId: key };
  saveDevices(devices);
  return key;
}

export function removeDevice(deviceId) {
  const devices = getDevices();
  delete devices[deviceId];
  saveDevices(devices);
}

export function getDeviceList() {
  return Object.values(getDevices());
}
