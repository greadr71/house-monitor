import { BASE_PATH, CLIENT_VERSION, DEMO_MODE } from './config.js';
import { getInstallationId } from './storage/installation.js';
import { initLive, teardownLive } from './ui/live.js';
import { initCharts, teardownCharts } from './ui/charts.js';
import { flushQueue } from './api/write.js';

const liveRoot = document.getElementById('tab-live');
const chartsRoot = document.getElementById('tab-charts');
const tabs = document.querySelectorAll('.tab-btn');
const installIdEl = document.getElementById('install-id');
const versionEl = document.getElementById('app-version');

let activeTab = 'live';
let liveReady = false;
let chartsReady = false;

function switchTab(name) {
  activeTab = name;
  tabs.forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  liveRoot.hidden = name !== 'live';
  chartsRoot.hidden = name !== 'charts';

  if (name === 'live' && !liveReady) {
    initLive(liveRoot);
    liveReady = true;
  }
  if (name === 'charts' && !chartsReady) {
    initCharts(chartsRoot);
    chartsReady = true;
  }
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

installIdEl.textContent = getInstallationId().slice(0, 8) + '…';
versionEl.textContent = `v${CLIENT_VERSION}${DEMO_MODE ? ' · demo' : ''}`;

switchTab('live');

if ('serviceWorker' in navigator) {
  const swPath = `${BASE_PATH}sw.js`.replace('//', '/');
  navigator.serviceWorker.register(swPath).catch(() => {});
}

window.addEventListener('online', () => flushQueue());

if (DEMO_MODE) {
  console.info('House Monitor: localhost demo mode — BLE может быть недоступен, используйте кнопку «Демо».');
}
