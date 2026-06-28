import { BLE_STALE_MS } from '../config.js';
import { ATC_OPTIONAL_SERVICES, connectAndSubscribe } from './gatt.js';
import {
  addDevice,
  getDeviceById,
  getDeviceList,
  removeDevice,
  updateDevice,
} from '../storage/devices.js';

/** @typedef {{ deviceId: string, name: string, bleName: string, temperature?: number, humidity?: number, battery?: number, lastSeen?: number, stale?: boolean }} LiveReading */

/** @type {Map<string, LiveReading>} */
const readings = new Map();
/** @type {Map<string, () => void>} */
const disconnectHandlers = new Map();
/** @type {((map: Map<string, LiveReading>) => void) | null} */
let onUpdate = null;

export function getReadings() {
  const now = Date.now();
  for (const [id, r] of readings) {
    r.stale = !r.lastSeen || now - r.lastSeen > BLE_STALE_MS;
    readings.set(id, r);
  }
  return new Map(readings);
}

export function subscribe(fn) {
  onUpdate = fn;
  fn(getReadings());
}

function emit() {
  onUpdate?.(getReadings());
}

function updateReading(deviceId, bleName, partial) {
  const saved = getDeviceList().find((d) => d.deviceId === deviceId);
  const prev = readings.get(deviceId);
  readings.set(deviceId, {
    deviceId,
    name: saved?.name || prev?.name || bleName || deviceId.slice(0, 8),
    bleName: bleName || prev?.bleName || '',
    temperature: partial.temperature ?? prev?.temperature,
    humidity: partial.humidity ?? prev?.humidity,
    battery: partial.battery ?? prev?.battery,
    lastSeen: Date.now(),
    stale: false,
  });
  emit();
}

function rememberDevice(deviceId, bleName) {
  const existing = getDeviceById(deviceId);
  if (existing) {
    updateDevice(deviceId, { bleName: bleName || existing.bleName });
  } else {
    addDevice({
      deviceId,
      name: bleName || deviceId.slice(0, 8),
      bleName: bleName || '',
      placement: '',
    });
  }
}

/** @param {BluetoothDevice} device */
async function attachDevice(device) {
  const deviceId = device.id;
  const bleName = device.name || deviceId.slice(0, 8);

  disconnectHandlers.get(deviceId)?.();
  disconnectHandlers.delete(deviceId);

  const teardown = await connectAndSubscribe(device, (partial) => {
    updateReading(deviceId, bleName, partial);
  });

  disconnectHandlers.set(deviceId, teardown);

  device.addEventListener('gattserverdisconnected', () => {
    const entry = readings.get(deviceId);
    if (entry) {
      readings.set(deviceId, { ...entry, stale: true });
      emit();
    }
  });

  rememberDevice(deviceId, bleName);
  updateReading(deviceId, bleName, {});
  return { deviceId, deviceName: getDeviceById(deviceId)?.name || bleName };
}

/** Новый датчик — диалог выбора. */
export async function connectDevice() {
  if (!navigator.bluetooth?.requestDevice) {
    return { ok: false, message: 'Web Bluetooth недоступен' };
  }

  try {
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ATC_OPTIONAL_SERVICES,
    });
    const { deviceName } = await attachDevice(device);
    return { ok: true, deviceName };
  } catch (err) {
    if (err.name === 'NotFoundError') {
      return { ok: false, message: 'Датчик не выбран' };
    }
    return { ok: false, message: err.message };
  }
}

/** Сохранённый датчик — короткий список в picker (filter по BLE-имени). */
export async function connectSavedDevice(deviceId) {
  const saved = getDeviceById(deviceId);
  if (!saved) {
    return { ok: false, message: 'Датчик не сохранён' };
  }

  if (!navigator.bluetooth?.requestDevice) {
    return { ok: false, message: 'Web Bluetooth недоступен' };
  }

  try {
    const filters = [];
    if (saved.bleName) filters.push({ name: saved.bleName });
    if (saved.name && saved.name !== saved.bleName) {
      filters.push({ name: saved.name });
    }

    const device = await navigator.bluetooth.requestDevice({
      filters: filters.length ? filters : undefined,
      acceptAllDevices: !filters.length,
      optionalServices: ATC_OPTIONAL_SERVICES,
    });

    if (device.id !== deviceId) {
      removeDevice(deviceId);
      addDevice({
        deviceId: device.id,
        name: saved.name,
        bleName: device.name || saved.bleName,
        placement: saved.placement || '',
      });
    }

    const { deviceName } = await attachDevice(device);
    return { ok: true, deviceName };
  } catch (err) {
    if (err.name === 'NotFoundError') {
      return { ok: false, message: 'Датчик не выбран' };
    }
    return { ok: false, message: err.message };
  }
}

/**
 * Автоподключение без picker — navigator.bluetooth.getDevices().
 * Chrome 159+ Android/desktop; раньше — только с experimental flag.
 */
export async function reconnectSavedDevices() {
  const saved = getDeviceList();
  if (!saved.length) {
    return { ok: true, connected: 0, total: 0, mode: 'none' };
  }

  if (typeof navigator.bluetooth?.getDevices !== 'function') {
    return {
      ok: false,
      connected: 0,
      total: saved.length,
      mode: 'manual',
      message: 'Автоподключение недоступно — нажмите «Подключить» у сохранённого датчика',
    };
  }

  const permitted = await navigator.bluetooth.getDevices();
  let connected = 0;
  const failed = [];

  for (const s of saved) {
    const bt = permitted.find((d) => d.id === s.deviceId);
    if (!bt) continue;
    try {
      await attachDevice(bt);
      connected += 1;
    } catch {
      failed.push(s.name);
    }
  }

  const notPermitted = saved.length - permitted.filter((d) =>
    saved.some((s) => s.deviceId === d.id),
  ).length;

  return {
    ok: true,
    connected,
    total: saved.length,
    mode: 'auto',
    notPermitted,
    failed,
    message:
      connected > 0
        ? `Автоподключено ${connected} из ${saved.length}`
        : notPermitted > 0
          ? 'Нужно один раз подключить датчики через «Подключить датчик»'
          : 'Сохранённые датчики не в радиусе',
  };
}

export function isDeviceConnected(deviceId) {
  const r = readings.get(deviceId);
  return Boolean(r && !r.stale && disconnectHandlers.has(deviceId));
}

export async function teardownConnections() {
  for (const teardown of disconnectHandlers.values()) {
    teardown();
  }
  disconnectHandlers.clear();
}
