/**
 * Парсинг BLE advertising для ATC / PVVX / BTHome.
 * @param {DataView} view
 * @returns {{ temperature?: number, humidity?: number, battery?: number } | null}
 */
export function parseAdvertising(view) {
  return (
    parseBTHome(view) ||
    parseEnvironmental181A(view) ||
    parseAtcLegacy(view)
  );
}

function parseBTHome(view) {
  if (view.byteLength < 3) return null;
  const info = view.getUint8(0);
  const hasBattery = (info & 0x04) !== 0;
  let offset = 1;
  let temperature;
  let humidity;
  let battery;

  while (offset < view.byteLength) {
    const header = view.getUint8(offset++);
    const objId = header >> 5;
    const len = header & 0x1f;

    if (offset + len > view.byteLength) break;

    switch (objId) {
      case 0x01:
        if (len === 1) temperature = view.getInt8(offset);
        else if (len === 2) temperature = view.getInt16(offset, true) / 100;
        break;
      case 0x02:
        if (len === 1) humidity = view.getUint8(offset);
        else if (len === 2) humidity = view.getUint16(offset, true) / 100;
        break;
      case 0x0c:
        if (len === 1) battery = view.getUint8(offset);
        break;
      default:
        break;
    }
    offset += len;
  }

  if (hasBattery && battery === undefined && view.byteLength >= 2) {
    battery = view.getUint8(view.byteLength - 1);
  }

  if (temperature === undefined && humidity === undefined) return null;
  return { temperature, humidity, battery };
}

function parseEnvironmental181A(view) {
  if (view.byteLength < 4) return null;
  const temp = view.getInt16(0, true) / 100;
  const hum = view.getUint16(2, true) / 100;
  if (!Number.isFinite(temp) || !Number.isFinite(hum)) return null;
  if (temp < -50 || temp > 80 || hum < 0 || hum > 100) return null;
  const battery = view.byteLength >= 5 ? view.getUint8(4) : undefined;
  return { temperature: temp, humidity: hum, battery };
}

function parseAtcLegacy(view) {
  if (view.byteLength < 6) return null;
  const temp = view.getInt16(0, true) / 10;
  const hum = view.getUint8(2);
  const battery = view.getUint8(3);
  if (temp < -50 || temp > 80 || hum > 100) return null;
  return { temperature: temp, humidity: hum, battery };
}

/** @param {BluetoothAdvertisingEvent} event */
export function extractServiceData(event) {
  if (!event.serviceData) return null;

  const bthome = event.serviceData.get('fcd2') || event.serviceData.get('FCD2');
  if (bthome) return parseAdvertising(new DataView(bthome.buffer));

  const env = event.serviceData.get('181a') || event.serviceData.get('181A');
  if (env) return parseEnvironmental181A(new DataView(env.buffer));

  const xiaomi = event.serviceData.get('fe95') || event.serviceData.get('FE95');
  if (xiaomi) return parseAtcLegacy(new DataView(xiaomi.buffer));

  for (const [, value] of event.serviceData) {
    const parsed = parseAdvertising(new DataView(value.buffer));
    if (parsed) return parsed;
  }
  return null;
}
