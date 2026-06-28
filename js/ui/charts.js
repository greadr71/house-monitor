import { HISTORY_PERIODS } from '../config.js';
import { fetchHistory } from '../api/read.js';
import { getDeviceList } from '../storage/devices.js';

/** @type {import('chart.js').Chart | null} */
let chartInstance = null;

export function initCharts(root) {
  root.innerHTML = `
    <section class="charts-panel">
      <header class="panel-header">
        <div>
          <p class="eyebrow">История замеров</p>
          <h2 class="panel-title">Графики</h2>
        </div>
      </header>

      <div class="charts-controls">
        <div class="period-tabs" role="tablist" aria-label="Период">
          ${Object.entries(HISTORY_PERIODS)
            .map(
              ([key, { label }], i) =>
                `<button type="button" class="period-tab ${i === 0 ? 'is-active' : ''}" data-period="${key}" role="tab">${label}</button>`,
            )
            .join('')}
        </div>
        <div class="device-filters" id="device-filters"></div>
      </div>

      <div class="chart-status" id="chart-status" role="status"></div>

      <div class="charts-stack" id="charts-stack">
        <div class="skeleton-chart"></div>
        <div class="skeleton-chart"></div>
      </div>
    </section>
  `;

  const periodTabs = root.querySelectorAll('.period-tab');
  const filtersEl = root.querySelector('#device-filters');
  const stackEl = root.querySelector('#charts-stack');
  const statusEl = root.querySelector('#chart-status');

  let period = '7d';
  /** @type {Set<string>} */
  let selectedDevices = new Set();

  function renderFilters() {
    const devices = getDeviceList();
    const names = devices.length
      ? devices.map((d) => d.name)
      : ['Дом', 'Улица'];

    if (!selectedDevices.size) names.forEach((n) => selectedDevices.add(n));

    filtersEl.innerHTML = names
      .map(
        (name) => `
      <label class="filter-chip">
        <input type="checkbox" value="${escapeHtml(name)}" ${selectedDevices.has(name) ? 'checked' : ''} />
        <span>${escapeHtml(name)}</span>
      </label>`,
      )
      .join('');

    filtersEl.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', () => {
        if (input.checked) selectedDevices.add(input.value);
        else selectedDevices.delete(input.value);
        loadCharts();
      });
    });
  }

  async function loadCharts() {
    statusEl.textContent = 'Загрузка…';
    statusEl.dataset.type = 'info';
    stackEl.innerHTML = '<div class="skeleton-chart"></div><div class="skeleton-chart"></div>';

    try {
      const data = await fetchHistory({
        period,
        devices: [...selectedDevices],
      });

      if (data.cached) {
        statusEl.textContent = `Кэш от ${formatDate(data.cachedAt)} (офлайн)`;
        statusEl.dataset.type = 'warn';
      } else {
        statusEl.textContent = `${data.records?.length || 0} точек`;
        statusEl.dataset.type = 'success';
      }

      renderCharts(stackEl, data.records || [], [...selectedDevices]);
    } catch (err) {
      statusEl.textContent = err.message;
      statusEl.dataset.type = 'error';
      stackEl.innerHTML = `
        <div class="empty-state">
          <p class="empty-title">Не удалось загрузить данные</p>
          <p class="empty-desc">${escapeHtml(err.message)}</p>
        </div>`;
    }
  }

  periodTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      periodTabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      period = tab.dataset.period;
      loadCharts();
    });
  });

  renderFilters();
  loadCharts();
}

/**
 * @param {HTMLElement} container
 * @param {Array<{ timestamp: string, device_name: string, temperature: number, humidity: number }>} records
 * @param {string[]} devices
 */
function renderCharts(container, records, devices) {
  container.innerHTML = '';

  if (!records.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">Нет записей за период</p>
        <p class="empty-desc">Сделайте первый замер на вкладке «Замер».</p>
      </div>`;
    return;
  }

  const palette = ['#059669', '#0284c7', '#b45309', '#be123c'];

  devices.forEach((deviceName, idx) => {
    const deviceRecords = records
      .filter((r) => r.device_name === deviceName)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    if (!deviceRecords.length) return;

    const wrap = document.createElement('div');
    wrap.className = 'chart-card';
    wrap.style.setProperty('--index', String(idx));
    wrap.innerHTML = `
      <h3 class="chart-card-title">${escapeHtml(deviceName)}</h3>
      <div class="chart-canvas-wrap">
        <canvas aria-label="График ${escapeHtml(deviceName)}"></canvas>
      </div>`;
    container.appendChild(wrap);

    const canvas = wrap.querySelector('canvas');
    const color = palette[idx % palette.length];

    new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Температура, °C',
            data: deviceRecords.map((r) => ({ x: r.timestamp, y: r.temperature })),
            borderColor: color,
            backgroundColor: `${color}18`,
            yAxisID: 'yTemp',
            tension: 0.35,
            pointRadius: 2,
            fill: true,
          },
          {
            label: 'Влажность, %',
            data: deviceRecords.map((r) => ({ x: r.timestamp, y: r.humidity })),
            borderColor: '#64748b',
            backgroundColor: 'transparent',
            yAxisID: 'yHum',
            tension: 0.35,
            pointRadius: 2,
            borderDash: [4, 4],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
        },
        scales: {
          x: {
            type: 'time',
            time: { tooltipFormat: 'dd MMM HH:mm', displayFormats: { hour: 'HH:mm', day: 'dd MMM' } },
            grid: { color: 'rgba(148,163,184,0.15)' },
          },
          yTemp: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: '°C' },
            grid: { color: 'rgba(148,163,184,0.15)' },
          },
          yHum: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            title: { display: true, text: '%' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
  });
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function teardownCharts() {
  chartInstance?.destroy();
  chartInstance = null;
}
