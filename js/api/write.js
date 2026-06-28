import { APPS_SCRIPT_URL, CLIENT_VERSION } from '../config.js';
import { getInstallationId } from '../storage/installation.js';
import { enqueue, getAllQueued, getQueueCount, removeQueued } from '../storage/queue.js';

/** @param {object} payload */
function buildPayload(payload) {
  return {
    installation_id: getInstallationId(),
    client_version: CLIENT_VERSION,
    timestamp: new Date().toISOString(),
    ...payload,
  };
}

async function postToAppsScript(body) {
  if (!APPS_SCRIPT_URL) {
    throw new Error('APPS_SCRIPT_URL не настроен. См. docs/SETUP.md');
  }

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

/** @param {object} payload */
export async function saveMeasurement(payload) {
  return postToAppsScript(buildPayload(payload));
}

/** @param {object} payload */
export async function queueMeasurement(payload) {
  await enqueue(buildPayload(payload));
}

export async function flushQueue() {
  const items = await getAllQueued();
  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      await postToAppsScript(item.payload);
      await removeQueued(item.id);
      sent += 1;
    } catch {
      failed += 1;
      break;
    }
  }

  return { sent, failed };
}

export async function getPendingCount() {
  return getQueueCount();
}

export { buildPayload };
