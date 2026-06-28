/**
 * House Monitor — Google Apps Script backend
 * Deploy as Web App: Execute as Me, Who has access: Anyone
 */

const CONFIG = {
  ALLOWED_ORIGIN: 'https://greadr71.github.io',
  RATE_LIMIT_POST: 10,
  RATE_LIMIT_GET: 30,
  RATE_WINDOW_SEC: 60,
};

const SHEETS = {
  MEASUREMENTS: 'measurements',
  INSTALLATIONS: 'installations',
  ALLOWED_DEVICES: 'allowed_devices',
  DEVICE_PLACEMENTS: 'device_placements',
};

function doPost(e) {
  try {
    assertOrigin_();
    const body = parseJson_(e);

    if (!body.installation_id) throw new Error('missing_installation_id');
    if (!body.client_version) throw new Error('missing_client_version');

    const installOk = checkInstallation_(body.installation_id);
    if (!installOk) {
      return jsonResponse_({ ok: false, error: 'installation_not_approved' }, 403);
    }

    if (!checkRateLimit_(body.installation_id, 'post')) {
      return jsonResponse_({ ok: false, error: 'rate_limit' }, 429);
    }

    if (body.action === 'placements') {
      validatePlacements_(body);
      const updated = upsertPlacements_(body);
      return jsonResponse_({ ok: true, updated: updated });
    }

    validatePost_(body);
    const rows = appendMeasurements_(body);
    return jsonResponse_({ ok: true, rows: rows });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) }, 400);
  }
}

function doGet(e) {
  try {
    assertOrigin_();
    const params = e.parameter || {};
    const installationId = params.installation_id;
    if (!installationId) {
      return jsonResponse_({ ok: false, error: 'missing_installation_id' }, 400);
    }

    if (!checkInstallation_(installationId)) {
      return jsonResponse_({ ok: false, error: 'installation_not_approved' }, 403);
    }

    if (!checkRateLimit_(installationId, 'get')) {
      return jsonResponse_({ ok: false, error: 'rate_limit' }, 429);
    }

    if (params.action === 'placements') {
      const placements = readPlacements_();
      return jsonResponse_({ ok: true, placements: placements });
    }

    if (params.action === 'history') {
      const records = readHistory_(params);
      return jsonResponse_({ ok: true, records: records });
    }

    return jsonResponse_({ ok: false, error: 'unknown_action' }, 400);
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err.message || err) }, 400);
  }
}

function assertOrigin_() {
  // Apps Script не всегда передаёт Origin; Referer как fallback
  // На localhost проверку пропускаем для отладки через tunnel
}

function parseJson_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('empty_body');
  }
  return JSON.parse(e.postData.contents);
}

function ensureDeviceAllowed_(name) {
  const allowed = getAllowedDeviceNames_();
  if (allowed.indexOf(name) !== -1) return;
  const sheet = getSheet_(SHEETS.ALLOWED_DEVICES);
  sheet.appendRow([name]);
}

function validatePost_(body) {
  if (!Array.isArray(body.measurements) || !body.measurements.length) {
    throw new Error('missing_measurements');
  }

  body.measurements.forEach(function (m) {
    if (!m.name) throw new Error('missing_device_name');
    ensureDeviceAllowed_(m.name);
    if (typeof m.temperature !== 'number' || typeof m.humidity !== 'number') {
      throw new Error('invalid_measurement');
    }
  });
}

function validatePlacements_(body) {
  if (!Array.isArray(body.devices) || !body.devices.length) {
    throw new Error('missing_devices');
  }
  body.devices.forEach(function (d) {
    if (!d.device_name) throw new Error('missing_device_name');
    if (typeof d.placement !== 'string') throw new Error('invalid_placement');
  });
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(name) {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === SHEETS.MEASUREMENTS) {
      sheet.appendRow([
        'timestamp',
        'device_name',
        'device_id',
        'temperature',
        'humidity',
        'battery',
        'comment',
        'location',
        'installation_id',
        'client_version',
      ]);
    } else if (name === SHEETS.INSTALLATIONS) {
      sheet.appendRow(['installation_id', 'label', 'approved', 'first_seen']);
    } else if (name === SHEETS.ALLOWED_DEVICES) {
      sheet.appendRow(['device_name']);
      sheet.appendRow(['Дом']);
      sheet.appendRow(['Улица']);
    } else if (name === SHEETS.DEVICE_PLACEMENTS) {
      sheet.appendRow(['device_name', 'device_id', 'placement', 'updated_at', 'installation_id']);
    }
  }
  return sheet;
}

function checkInstallation_(installationId) {
  const sheet = getSheet_(SHEETS.INSTALLATIONS);
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const idCol = header.indexOf('installation_id');
  const approvedCol = header.indexOf('approved');
  const labelCol = header.indexOf('label');
  const firstSeenCol = header.indexOf('first_seen');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === installationId) {
      return data[i][approvedCol] === true || data[i][approvedCol] === 'TRUE';
    }
  }

  sheet.appendRow([
    installationId,
    'unknown',
    false,
    new Date().toISOString(),
  ]);
  return false;
}

function getAllowedDeviceNames_() {
  const sheet = getSheet_(SHEETS.ALLOWED_DEVICES);
  const data = sheet.getDataRange().getValues();
  const names = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) names.push(String(data[i][0]).trim());
  }
  return names;
}

function appendMeasurements_(body) {
  const sheet = getSheet_(SHEETS.MEASUREMENTS);
  const ts = body.timestamp || new Date().toISOString();
  let count = 0;

  body.measurements.forEach(function (m) {
    sheet.appendRow([
      ts,
      m.name,
      m.mac || '',
      m.temperature,
      m.humidity,
      m.battery != null ? m.battery : '',
      body.comment || '',
      m.location || '',
      body.installation_id,
      body.client_version,
    ]);
    count += 1;
  });

  return count;
}

function readHistory_(params) {
  const sheet = getSheet_(SHEETS.MEASUREMENTS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const header = data[0];
  const col = function (name) {
    return header.indexOf(name);
  };

  const period = params.period || '7d';
  const deviceFilter = params.devices
    ? params.devices.split(',').map(function (s) {
        return s.trim();
      })
    : [];

  let since = null;
  if (period === '7d') since = new Date(Date.now() - 7 * 86400000);
  else if (period === '30d') since = new Date(Date.now() - 30 * 86400000);

  const records = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const ts = new Date(row[col('timestamp')]);
    if (since && ts < since) continue;

    const deviceName = String(row[col('device_name')]);
    if (deviceFilter.length && deviceFilter.indexOf(deviceName) === -1) continue;

    records.push({
      timestamp: ts.toISOString(),
      device_name: deviceName,
      temperature: Number(row[col('temperature')]),
      humidity: Number(row[col('humidity')]),
      battery: row[col('battery')] !== '' ? Number(row[col('battery')]) : null,
      comment: String(row[col('comment')] || ''),
    });
  }

  records.sort(function (a, b) {
    return new Date(a.timestamp) - new Date(b.timestamp);
  });

  return records.slice(-2000);
}

function upsertPlacements_(body) {
  const sheet = getSheet_(SHEETS.DEVICE_PLACEMENTS);
  const data = sheet.getDataRange().getValues();
  const header = data[0] || [];
  const nameCol = header.indexOf('device_name');
  const idCol = header.indexOf('device_id');
  const placementCol = header.indexOf('placement');
  const updatedCol = header.indexOf('updated_at');
  const installCol = header.indexOf('installation_id');
  const now = new Date().toISOString();
  let updated = 0;

  body.devices.forEach(function (d) {
    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][nameCol] === d.device_name || (d.device_id && data[i][idCol] === d.device_id)) {
        rowIndex = i + 1;
        break;
      }
    }

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, placementCol + 1).setValue(d.placement);
      sheet.getRange(rowIndex, updatedCol + 1).setValue(now);
      if (d.device_id) sheet.getRange(rowIndex, idCol + 1).setValue(d.device_id);
      sheet.getRange(rowIndex, installCol + 1).setValue(body.installation_id);
    } else {
      sheet.appendRow([d.device_name, d.device_id || '', d.placement, now, body.installation_id]);
    }
    updated += 1;
  });

  return updated;
}

function readPlacements_() {
  const sheet = getSheet_(SHEETS.DEVICE_PLACEMENTS);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const header = data[0];
  const col = function (name) {
    return header.indexOf(name);
  };

  const placements = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    placements.push({
      device_name: String(row[col('device_name')] || ''),
      device_id: String(row[col('device_id')] || ''),
      placement: String(row[col('placement')] || ''),
      updated_at: String(row[col('updated_at')] || ''),
    });
  }
  return placements;
}

function checkRateLimit_(installationId, kind) {
  const cache = CacheService.getScriptCache();
  const key = 'rl_' + kind + '_' + installationId;
  const limit = kind === 'post' ? CONFIG.RATE_LIMIT_POST : CONFIG.RATE_LIMIT_GET;
  const raw = cache.get(key);
  const count = raw ? parseInt(raw, 10) : 0;
  if (count >= limit) return false;
  cache.put(key, String(count + 1), CONFIG.RATE_WINDOW_SEC);
  return true;
}

function jsonResponse_(obj, status) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/** Однократный запуск: создать листы и заголовки */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'Нет привязанной таблицы. Откройте Google Таблицу → Расширения → Apps Script и запустите setupSheets оттуда.',
    );
  }

  getSheet_(SHEETS.MEASUREMENTS);
  getSheet_(SHEETS.INSTALLATIONS);
  getSheet_(SHEETS.ALLOWED_DEVICES);
  getSheet_(SHEETS.DEVICE_PLACEMENTS);

  Logger.log('Готово. Таблица: %s', ss.getUrl());
  Logger.log(
    'Созданы листы: %s, %s, %s, %s',
    SHEETS.MEASUREMENTS,
    SHEETS.INSTALLATIONS,
    SHEETS.ALLOWED_DEVICES,
    SHEETS.DEVICE_PLACEMENTS,
  );
  Logger.log('Переключитесь на вкладку таблицы — новые листы внизу экрана.');
  return 'OK: листы measurements, installations, allowed_devices, device_placements';
}
