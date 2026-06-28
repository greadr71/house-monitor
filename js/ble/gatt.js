/**
 * GATT Connection Mode для ATC/PVVX.
 * @see https://github.com/pvvx/ATC_MiThermometer#bluetooth-connection-mode
 */

export const ATC_OPTIONAL_SERVICES = [
  'environmental_sensing',
  'battery_service',
  0x1f10,
  '00001f10-0000-1000-8000-00805f9b34fb',
];

/** @param {BluetoothRemoteGATTCharacteristic} char @param {(data: { temperature?: number, humidity?: number, battery?: number }) => void} onData */
export async function subscribeCharacteristic(char, onData) {
  const uuid = char.uuid.toLowerCase();

  const handler = (event) => {
    const v = event.target.value;
    if (!v) return;

    if (uuid.includes('00002a6e') || uuid.endsWith('2a6e')) {
      onData({ temperature: v.getInt16(0, true) / 100 });
      return;
    }
    if (uuid.includes('00002a1f') || uuid.endsWith('2a1f')) {
      onData({ temperature: v.getInt16(0, true) / 10 });
      return;
    }
    if (uuid.includes('00002a6f') || uuid.endsWith('2a6f')) {
      onData({ humidity: v.getUint16(0, true) / 100 });
      return;
    }
    if (uuid.includes('00002a19') || uuid.endsWith('2a19')) {
      onData({ battery: v.getUint8(0) });
      return;
    }
    if (uuid.includes('00001f1f') || uuid.endsWith('1f1f')) {
      onData(parseAtcCustomFrame(v));
    }
  };

  await char.startNotifications();
  char.addEventListener('characteristicvaluechanged', handler);
  return () => {
    char.removeEventListener('characteristicvaluechanged', handler);
    char.stopNotifications().catch(() => {});
  };
}

/** @param {DataView} view */
function parseAtcCustomFrame(view) {
  if (view.byteLength < 2) return {};
  const frameId = view.getUint8(0);
  if (frameId !== 0x33 || view.byteLength < 8) return {};
  return {
    temperature: view.getInt16(1, true) / 100,
    humidity: view.getUint16(3, true) / 100,
    battery: view.byteLength >= 7 ? view.getUint8(5) : undefined,
  };
}

/**
 * @param {BluetoothDevice} device
 * @param {(data: { temperature?: number, humidity?: number, battery?: number }) => void} onData
 */
export async function connectAndSubscribe(device, onData) {
  if (!device.gatt) throw new Error('GATT недоступен');

  const server = await device.gatt.connect();
  const unsubscribers = [];
  const merge = (partial) => onData(partial);

  async function tryChar(service, charId) {
    try {
      const svc = await server.getPrimaryService(service);
      const char = charId.includes('-')
        ? await svc.getCharacteristic(charId)
        : await svc.getCharacteristic(charId);
      unsubscribers.push(await subscribeCharacteristic(char, merge));
    } catch {
      /* характеристика может отсутствовать */
    }
  }

  await tryChar('environmental_sensing', 'temperature');
  await tryChar('environmental_sensing', '00002a1f-0000-1000-8000-00805f9b34fb');
  await tryChar('environmental_sensing', 'humidity');
  await tryChar('battery_service', 'battery_level');
  await tryChar('00001f10-0000-1000-8000-00805f9b34fb', '00001f1f-0000-1000-8000-00805f9b34fb');

  if (!unsubscribers.length) {
    device.gatt.disconnect();
    throw new Error('Не найдены GATT-характеристики ATC. Проверьте прошивку.');
  }

  return () => {
    unsubscribers.forEach((u) => u());
    if (device.gatt?.connected) device.gatt.disconnect();
  };
}
