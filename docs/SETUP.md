# House Monitor — настройка

## Локальное тестирование с компьютера

**Да, можно.** На `localhost` Web Bluetooth работает без HTTPS.

```bash
cd smart_home/house-monitor
npx serve -l 3000
```

Откройте **Chrome**: http://localhost:3000

### Что работает локально

| Функция | localhost / Android Chrome |
|---------|---------------------------|
| Интерфейс, вкладки, PWA | да |
| **Подключить датчик** (GATT notify) | да, если Chrome видит Bluetooth |
| Офлайн-очередь (DevTools → Offline) | да |
| Запись в Google Sheets | после настройки Apps Script |
| Графики | после первых записей в Sheets |

BLE: `requestDevice` → GATT notify (ATC Connection Mode). Нужен **Chrome на Android**.

### Сохранённые датчики

После первого «Подключить датчик» устройство запоминается в приложении (имя, BLE-id, позиция).

- **Chrome 159+** — при открытии PWA сохранённые датчики подключаются **автоматически** (`getDevices`, без picker).
- **Chrome 149 и раньше** — в «Настройка датчиков» кнопка **«Подключить»** у каждого сохранённого: picker покажет только этот датчик (не весь список BLE).
- Имена («Дом», «Улица») задаются через «Привязать текущий датчик» или при первом подключении (можно переименовать в настройках).

---

## Google: пошагово

### 1. Google Таблица

1. [sheets.new](https://sheets.new) — новая таблица, название например «House Monitor».
2. **Расширения → Apps Script** — откроется **новая вкладка** с редактором. Это нормально: код пишется там, таблица остаётся на предыдущей вкладке.
3. На вкладке Apps Script: удалите содержимое `Code.gs`, вставьте код из [`apps-script/Code.gs`](../apps-script/Code.gs).
4. **Project Settings** (шестерёнка) → **Time zone** → `(GMT+03:00) Moscow` — все метки времени в таблице пишутся в московском поясе.
5. В `CONFIG.ALLOWED_ORIGIN` укажите ваш GitHub Pages URL, например:
   `https://username.github.io`
6. Запустите функцию **`setupSheets`**:
   - в редакторе Apps Script выберите `setupSheets` в выпадающем списке функций;
   - нажмите **▶ Выполнить**;
   - при **первом** запуске подтвердите доступ («Разрешить»).
7. **Переключитесь обратно на вкладку с таблицей** и нажмите F5.

#### Где результат

**Не в журнале выполнения** — там только «Выполнение начато / завершено». Это нормально.

Результат смотрите **в самой Google Таблице** (вкладка браузера с таблицей, не Apps Script):

- внизу появятся **новые листы** (вкладки):
  - `measurements` — заголовки: timestamp, device_name, temperature…
  - `installations` — installation_id, label, approved, first_seen
  - `allowed_devices` — device_name (+ строки «Дом», «Улица»)

Если листов нет:

1. Убедитесь, что скрипт **привязан к таблице**: открыли [sheets.new](https://sheets.new) → **Расширения → Apps Script**, а не script.google.com отдельно.
2. Обновите страницу таблицы (F5).
3. В Apps Script: **Выполнение → Журнал выполнения** — после обновления кода будет строка `Готово. Таблица: https://...`.

Создадутся листы:
   - `measurements` — все замеры
   - `installations` — whitelist телефонов
   - `allowed_devices` — whitelist датчиков (по умолчанию «Дом», «Улица»)

### 2. Деплой Web App

1. **Deploy → New deployment → Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Скопируйте URL вида `https://script.google.com/macros/s/.../exec`

После изменения `Code.gs` создайте **новую версию**: **Deploy → Manage deployments → Edit (карандаш) → Version: New version → Deploy**. URL Web App при этом не меняется.

### 3. Клиент

В [`js/config.js`](js/config.js):

```javascript
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/ВАШ_ID/exec';
export const ALLOWED_ORIGIN = 'https://username.github.io';
export const BASE_PATH = '/house-monitor/'; // или '/' для user.github.io
```

### 4. Первый запуск приложения

1. Откройте PWA — в шапке виден **installation id** (первые 8 символов).
2. В таблице на листе `installations` появится строка с `approved = FALSE`.
3. Поставьте **`TRUE`** в колонке `approved` — запросы начнут проходить.
4. При необходимости добавьте имена датчиков на лист `allowed_devices`.

### 5. Проверка записи

1. Подключите датчик → **Записать**.
2. На листе `measurements` должны появиться строки.

---

## GitHub Pages

1. Repo `house-monitor`, залить содержимое папки.
2. **Settings → Pages →** branch `main`, folder `/ (root)`.
3. URL: `https://username.github.io/house-monitor/`
4. Обновите `BASE_PATH` и `ALLOWED_ORIGIN` в `config.js`.

---

## Структура JSON (POST)

Клиент может присылать `timestamp` в UTC (`...Z`); сервер нормализует и **записывает в таблицу московское время** в формате ISO с суффиксом `+03:00`.

```json
{
  "installation_id": "uuid",
  "client_version": "1.0.0",
  "timestamp": "2026-06-28T12:00:00+03:00",
  "comment": "утренний замер",
  "measurements": [
    {
      "name": "Дом",
      "mac": "device-id-from-ble",
      "location": "1 этаж, гостиная",
      "temperature": 22.4,
      "humidity": 53,
      "battery": 95
    }
  ]
}
```

---

## Безопасность

- Секретов в JavaScript нет.
- Apps Script принимает только известные `installation_id` и имена датчиков.
- Rate limit: 10 POST / мин, 30 GET / мин.
- URL Web App не публикуйте открыто — это не пароль, но снижает риск спама.

---

## Миграция на Home Assistant

Позже меняется только `js/api/write.js` и `read.js` — UI остаётся прежним.
