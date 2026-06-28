export const CLIENT_VERSION = '1.4.1';

/** Заполнить после деплоя Apps Script Web App */
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzQcvwU4s-HCeK7Do8s2_-aX5S00jVpYVT-32JHEAwcC21I4kGaPZq8bkF83GqT3K8/exec';

/** Для GitHub Pages: '/house-monitor/' или '/' для user.github.io */
export const BASE_PATH = '/house-monitor/';

/** Разрешённый origin для backend (проверяется на сервере) */
export const ALLOWED_ORIGIN = 'https://greadr71.github.io';

export const BLE_STALE_MS = 30_000;

export const HISTORY_PERIODS = {
  '7d': { label: '7 дней', days: 7 },
  '30d': { label: '30 дней', days: 30 },
  all: { label: 'Всё', days: null },
};
