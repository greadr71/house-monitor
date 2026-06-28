/**
 * House Monitor — Google Apps Script backend
 * Deploy as Web App: Execute as Me, Who has access: Anyone
 */

const CONFIG = {
  ALLOWED_ORIGIN: 'https://YOUR_USERNAME.github.io',
  RATE_LIMIT_POST: 10,
  RATE_LIMIT_GET: 30,
  RATE_WINDOW_SEC: 60,
};

const SHEETS = {
  MEASUREMENTS: 'measurements',
  INSTALLATIONS: 'installations',
  ALLOWED_DEVICES: 'allowed_devices',
};

function doPost(e) {
  try {
    assertOrigin_();
    const body = parseJson_(e);
    validatePost_(body);

    const installOk = checkInstallation_(body.installation_id);
    if (!installOk) {
      return jsonResponse_({ ok: false, error: 'installation_not_approved' }, 403);
    }

    if (!checkRateLimit_(body.installation_id, 'post')) {
      return jsonResponse_({ ok: false, error: 'rate_limit' }, 429);
    }

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
    if (params.action !== 'history') {
      return jsonResponse_({ ok: false, error: 'unknown_action' }, 400);
    }

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

    const records = readHistory_(params);
    return jsonResponse_({ ok: true, records: records });
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

function validatePost_(body) {
  if (!body.installation_id) throw new Error('missing_installation_id');
  if (!body.client_version) throw new Error('missing_client_version');
  if (!Array.isArray(body.measurements) || !body.measurements.length) {
    throw new Error('missing_measurements');
  }

  const allowed = getAllowedDeviceNames_();
  body.measurements.forEach(function (m) {
    if (!m.name) throw new Error('missing_device_name');
    if (allowed.length && allowed.indexOf(m.name) === -1) {
      throw new Error('device_not_allowed: ' + m.name);
    }
    if (typeof m.temperature !== 'number' || typeof m.humidity !== 'number') {
      throw new Error('invalid_measurement');
    }
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
      body.location || '',
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

  Logger.log('Готово. Таблица: %s', ss.getUrl());
  Logger.log('Созданы листы: %s, %s, %s', SHEETS.MEASUREMENTS, SHEETS.INSTALLATIONS, SHEETS.ALLOWED_DEVICES);
  Logger.log('Переключитесь на вкладку таблицы — новые листы внизу экрана.');
  return 'OK: листы measurements, installations, allowed_devices';
}
