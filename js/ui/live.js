import { DEMO_MODE } from '../config.js';
import {
  getReadings,
  injectDemoReadings,
  readOnceViaGatt,
  startScan,
  stopScan,
  subscribe,
} from '../ble/scanner.js';
import { getDeviceList, addDevice, removeDevice, updateDevice, getDeviceById } from '../storage/devices.js';
import {
  flushQueue,
  getPendingCount,
  queueMeasurement,
  saveMeasurement,
} from '../api/write.js';
import { syncPlacements } from '../api/placements.js';

const els = {
  sensorGrid: null,
  comment: null,
  saveBtn: null,
  queueBadge: null,
  statusBar: null,
  scanBtn: null,
  gattBtn: null,
  demoBtn: null,
  settingsPanel: null,
  deviceList: null,
  addDeviceBtn: null,
};

export function initLive(root) {
  root.innerHTML = `
    <section class="live-panel">
      <header class="panel-header">
        <div>
          <p class="eyebrow">Текущие показания</p>
          <h2 class="panel-title">Датчики</h2>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="scan-btn">Сканировать</button>
          <button type="button" class="btn btn-ghost btn-sm" id="gatt-btn">Подключить</button>
          ${DEMO_MODE ? '<button type="button" class="btn btn-ghost btn-sm" id="demo-btn">Демо</button>' : ''}
        </div>
      </header>

      <div class="status-bar" id="status-bar" role="status"></div>
      <div class="queue-badge hidden" id="queue-badge"></div>

      <div class="sensor-grid" id="sensor-grid">
        <div class="empty-state" id="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
          </svg>
          <p class="empty-title">Нет данных</p>
          <p class="empty-desc">Запустите сканирование или добавьте датчики в настройках.</p>
        </div>
      </div>

      <div class="record-block">
        <label class="field-label" for="comment-input">Комментарий</label>
        <textarea id="comment-input" class="field-input" rows="2" placeholder="Например: утренний замер после проветривания"></textarea>
      </div>

      <button type="button" class="btn btn-primary btn-full" id="save-btn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Записать
      </button>

      <details class="settings-fold" id="settings-panel">
        <summary>Настройка датчиков</summary>
        <div class="settings-body">
          <ul class="device-list" id="device-list"></ul>
          <button type="button" class="btn btn-ghost btn-sm" id="add-device-btn">Привязать текущий датчик</button>
        </div>
      </details>
    </section>
  `;

  els.sensorGrid = root.querySelector('#sensor-grid');
  els.comment = root.querySelector('#comment-input');
  els.saveBtn = root.querySelector('#save-btn');
  els.queueBadge = root.querySelector('#queue-badge');
  els.statusBar = root.querySelector('#status-bar');
  els.scanBtn = root.querySelector('#scan-btn');
  els.gattBtn = root.querySelector('#gatt-btn');
  els.demoBtn = root.querySelector('#demo-btn');
  els.settingsPanel = root.querySelector('#settings-panel');
  els.deviceList = root.querySelector('#device-list');
  els.addDeviceBtn = root.querySelector('#add-device-btn');

  els.scanBtn.addEventListener('click', onScan);
  els.gattBtn.addEventListener('click', onGatt);
  els.demoBtn?.addEventListener('click', onDemo);
  els.saveBtn.addEventListener('click', onSave);
  els.addDeviceBtn.addEventListener('click', onAddDevice);

  subscribe(renderSensors);
  renderDeviceList();
  updateQueueBadge();

  window.addEventListener('online', () => {
    flushQueue().then(updateQueueBadge);
  });
}

function setStatus(message, type = 'info') {
  els.statusBar.textContent = message;
  els.statusBar.dataset.type = type;
}

async function onScan() {
  setStatus('Запуск сканирования…');
  const result = await startScan();
  if (result.ok) {
    setStatus('Сканирование активно', 'success');
  } else {
    setStatus(result.message, 'error');
  }
}

async function onGatt() {
  setStatus('Выберите датчик…');
  const result = await readOnceViaGatt();
  setStatus(result.ok ? 'Показания обновлены' : result.message, result.ok ? 'success' : 'error');
}

function onDemo() {
  injectDemoReadings();
  setStatus('Демо-данные загружены', 'success');
}

function renderSensors(map) {
  const saved = getDeviceList();
  const entries = saved.length
    ? saved.map((d) => {
        const r = map.get(d.deviceId) || { ...d, stale: true };
        return { ...r, name: d.name, placement: d.placement || '' };
      })
    : [...map.values()];

  if (!entries.length) {
    els.sensorGrid.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        <p class="empty-title">Нет данных</p>
        <p class="empty-desc">Запустите сканирование или нажмите «Подключить» и выберите датчик в списке.${DEMO_MODE ? ' На localhost доступна кнопка «Демо».' : ''}</p>
      </div>`;
    return;
  }

  els.sensorGrid.innerHTML = entries
    .map(
      (r, i) => `
    <article class="sensor-row ${r.stale ? 'is-stale' : ''}" style="--index:${i}">
      <div class="sensor-meta">
        <span class="status-dot ${r.stale ? 'is-stale' : 'is-live'}" aria-hidden="true"></span>
        <div>
          <h3 class="sensor-name">${escapeHtml(r.name)}</h3>
          <p class="sensor-ble">${escapeHtml(r.bleName || r.deviceId.slice(0, 12))}</p>
          <p class="sensor-placement">${r.placement ? escapeHtml(r.placement) : '<span class="placement-empty">Позиция не задана</span>'}</p>
        </div>
      </div>
      <div class="sensor-actions">
        <button type="button" class="btn btn-ghost btn-sm btn-placement" data-device-id="${escapeHtml(r.deviceId)}">Позиция</button>
      </div>
      <dl class="sensor-metrics">
        <div class="metric">
          <dt>Темп.</dt>
          <dd class="metric-value">${fmt(r.temperature, '°')}</dd>
        </div>
        <div class="metric">
          <dt>Влажн.</dt>
          <dd class="metric-value">${fmt(r.humidity, '%')}</dd>
        </div>
        <div class="metric">
          <dt>Батарея</dt>
          <dd class="metric-value">${fmt(r.battery, '%')}</dd>
        </div>
      </dl>
    </article>`,
    )
    .join('');

  els.sensorGrid.querySelectorAll('.btn-placement').forEach((btn) => {
    btn.addEventListener('click', () => onEditPlacement(btn.dataset.deviceId));
  });
}

function renderDeviceList() {
  const devices = getDeviceList();
  if (!devices.length) {
    els.deviceList.innerHTML = '<li class="device-empty">Нет привязанных датчиков</li>';
    return;
  }
  els.deviceList.innerHTML = devices
    .map(
      (d) => `
    <li class="device-item">
      <div class="device-item-info">
        <span>${escapeHtml(d.name)} <small>${escapeHtml(d.bleName)}</small></span>
        <span class="device-item-placement">${d.placement ? escapeHtml(d.placement) : '—'}</span>
      </div>
      <div class="device-item-actions">
        <button type="button" class="btn btn-ghost btn-sm btn-placement" data-device-id="${escapeHtml(d.deviceId)}">Позиция</button>
        <button type="button" class="btn-icon" data-remove="${escapeHtml(d.deviceId)}" aria-label="Удалить">×</button>
      </div>
    </li>`,
    )
    .join('');

  els.deviceList.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      removeDevice(btn.dataset.remove);
      renderDeviceList();
    });
  });

  els.deviceList.querySelectorAll('.btn-placement').forEach((btn) => {
    btn.addEventListener('click', () => onEditPlacement(btn.dataset.deviceId));
  });
}

async function onEditPlacement(deviceId) {
  const device = getDeviceById(deviceId);
  if (!device) return;

  const placement = prompt(
    'Позиция датчика в доме\n(например: 1 этаж, гостиная у окна)',
    device.placement || '',
  );
  if (placement === null) return;

  updateDevice(deviceId, { placement: placement.trim() });
  renderDeviceList();
  renderSensors(getReadings());

  try {
    await syncPlacements([{ ...device, placement: placement.trim() }]);
    setStatus('Позиция сохранена', 'success');
  } catch (err) {
    setStatus(`Позиция сохранена локально. Синхронизация: ${err.message}`, 'warn');
  }
}

async function onAddDevice() {
  const readings = getReadings();
  if (!readings.size) {
    setStatus('Сначала получите показания (сканирование или подключение)', 'error');
    return;
  }
  const first = [...readings.values()][0];
  const name = prompt('Имя датчика (Дом, Улица…)', first.name);
  if (!name) return;
  const placement = prompt('Позиция в доме (необязательно)', '') || '';
  const device = {
    deviceId: first.deviceId,
    name: name.trim(),
    bleName: first.bleName,
    placement: placement.trim(),
  };
  addDevice(device);
  renderDeviceList();
  setStatus(`Датчик «${name}» сохранён`, 'success');
  if (device.placement) {
    syncPlacements([device]).catch(() => {});
  }
}

async function onSave() {
  const readings = getReadings();
  const saved = getDeviceList();
  const source = saved.length
    ? saved.map((d) => readings.get(d.deviceId)).filter(Boolean)
    : [...readings.values()].filter((r) => !r.stale);

  if (!source.length) {
    setStatus('Нет актуальных показаний для записи', 'error');
    return;
  }

  const payload = {
    comment: els.comment.value.trim(),
    measurements: source.map((r) => {
      const saved = getDeviceById(r.deviceId);
      return {
        name: r.name,
        mac: r.deviceId,
        location: saved?.placement || '',
        temperature: r.temperature,
        humidity: r.humidity,
        battery: r.battery,
      };
    }),
  };

  els.saveBtn.disabled = true;
  els.saveBtn.classList.add('is-loading');

  try {
    if (!navigator.onLine) throw new Error('offline');
    await saveMeasurement(payload);
    els.comment.value = '';
    setStatus('Запись сохранена', 'success');
    await flushQueue();
  } catch (err) {
    if (!navigator.onLine || err.message === 'offline') {
      await queueMeasurement(payload);
      setStatus('Офлайн: запись добавлена в очередь', 'warn');
    } else {
      setStatus(err.message || 'Ошибка записи', 'error');
    }
  } finally {
    els.saveBtn.disabled = false;
    els.saveBtn.classList.remove('is-loading');
    updateQueueBadge();
  }
}

async function updateQueueBadge() {
  const count = await getPendingCount();
  if (count > 0) {
    els.queueBadge.textContent = `${count} ${plural(count, 'запись', 'записи', 'записей')} ожидает отправки`;
    els.queueBadge.classList.remove('hidden');
  } else {
    els.queueBadge.classList.add('hidden');
  }
}

function fmt(val, suffix) {
  if (val === undefined || val === null || Number.isNaN(val)) return '—';
  return `${Number.isInteger(val) ? val : val.toFixed(1)}${suffix}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

export async function teardownLive() {
  await stopScan();
}
