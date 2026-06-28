import { BLE_STALE_MS } from '../config.js';
import { extractServiceData } from './parsers.js';
import { getDeviceList } from '../storage/devices.js';

/** @typedef {{ deviceId: string, name: string, bleName: string, temperature?: number, humidity?: number, battery?: number, lastSeen?: number, stale?: boolean }} LiveReading */

/** @type {Map<string, LiveReading>} */
const readings = new Map();
/** @type {BluetoothLEScan | null} */
let activeScan = null;
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

function handleAdvert(event) {
  const parsed = extractServiceData(event);
  if (!parsed) return;

  const deviceId = event.device.id;
  const bleName = event.device.name || deviceId.slice(0, 8);
  const saved = getDeviceList().find((d) => d.deviceId === deviceId);
  const name = saved?.name || bleName;

  readings.set(deviceId, {
    deviceId,
    name,
    bleName,
    temperature: parsed.temperature,
    humidity: parsed.humidity,
    battery: parsed.battery,
    lastSeen: Date.now(),
    stale: false,
  });
  emit();
}

export async function startScan() {
  if (activeScan) return { ok: true };

  if (!navigator.bluetooth?.requestLEScan) {
    return { ok: false, error: 'scan_unsupported', message: 'Сканирование недоступно в этом браузере. Используйте Chrome на Android или демо-режим.' };
  }

  try {
    activeScan = await navigator.bluetooth.requestLEScan({
      acceptAllAdvertisements: true,
      keepRepeatedDevices: true,
    });
    navigator.bluetooth.addEventListener('advertisementreceived', handleAdvert);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: 'scan_denied', message: err.message };
  }
}

export async function stopScan() {
  if (activeScan) {
    activeScan.stop();
    activeScan = null;
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvert);
  }
}

/** Fallback: однократное подключение через requestDevice */
export async function readOnceViaGatt() {
  if (!navigator.bluetooth?.requestDevice) {
    return { ok: false, message: 'Web Bluetooth недоступен' };
  }

  try {
    // acceptAllDevices — как на pvvx.github.io: показывает все BLE-устройства в радиусе.
    // Жёсткие namePrefix-фильтры скрывают датчики с именами вроде "Mitemp nostick".
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        'environmental_sensing',
        'battery_service',
        'device_information',
        'fe95', // Xiaomi custom
        0xfe95,
      ],
    });

    const server = await device.gatt.connect();
    let temperature;
    let humidity;
    let battery;

    try {
      const env = await server.getPrimaryService('environmental_sensing');
      const tempChar = await env.getCharacteristic('temperature');
      const humChar = await env.getCharacteristic('humidity');
      const tempVal = await tempChar.readValue();
      const humVal = await humChar.readValue();
      temperature = tempVal.getInt16(0, true) / 100;
      humidity = humVal.getUint16(0, true) / 100;
    } catch {
      /* GATT layout varies */
    }

    try {
      const batSvc = await server.getPrimaryService('battery_service');
      const batChar = await batSvc.getCharacteristic('battery_level');
      const batVal = await batChar.readValue();
      battery = batVal.getUint8(0);
    } catch {
      /* optional */
    }

    device.gatt.disconnect();

    const deviceId = device.id;
    readings.set(deviceId, {
      deviceId,
      name: device.name || deviceId.slice(0, 8),
      bleName: device.name || '',
      temperature,
      humidity,
      battery,
      lastSeen: Date.now(),
      stale: false,
    });
    emit();
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

/** Демо-данные для localhost */
export function injectDemoReadings() {
  const now = Date.now();
  const demo = [
    { deviceId: 'demo-dom', name: 'Дом', bleName: 'ATC_A4B2', temperature: 22.4, humidity: 53, battery: 95 },
    { deviceId: 'demo-ulica', name: 'Улица', bleName: 'ATC_C1D3', temperature: 28.1, humidity: 47, battery: 91 },
  ];
  for (const d of demo) {
    readings.set(d.deviceId, { ...d, lastSeen: now, stale: false });
  }
  emit();
}

export function clearReadings() {
  readings.clear();
  emit();
}
