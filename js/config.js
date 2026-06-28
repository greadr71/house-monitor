/** @typedef {'apps_script' | 'demo'} DataBackend */

/** @type {DataBackend} */
export const DATA_BACKEND = 'apps_script';

export const CLIENT_VERSION = '1.0.0';

/** Заполнить после деплоя Apps Script Web App */
export const APPS_SCRIPT_URL = '';

/** Для GitHub Pages: '/house-monitor/' или '/' для user.github.io */
export const BASE_PATH = '/';

/** Разрешённый origin для backend (проверяется на сервере) */
export const ALLOWED_ORIGIN = 'https://YOUR_USERNAME.github.io';

export const BLE_STALE_MS = 30_000;
export const SCAN_REFRESH_MS = 2_000;

export const HISTORY_PERIODS = {
  '7d': { label: '7 дней', days: 7 },
  '30d': { label: '30 дней', days: 30 },
  all: { label: 'Всё', days: null },
};

/** Демо-режим для локальной отладки без BLE и Google */
export const DEMO_MODE =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
