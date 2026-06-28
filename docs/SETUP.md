# House Monitor — настройка

## Локальное тестирование с компьютера

**Да, можно.** На `localhost` Web Bluetooth работает без HTTPS.

```bash
cd smart_home/house-monitor
npx serve -l 3000
```

Откройте **Chrome**: http://localhost:3000

### Что работает локально

| Функция | localhost |
|---------|-----------|
| Интерфейс, вкладки, PWA | да |
| Кнопка **Демо** (фейковые датчики) | да |
| Вкладка **Графики** (демо-данные) | да |
| Офлайн-очередь (DevTools → Offline) | да |
| BLE-сканирование `requestLEScan` | обычно **нет** на macOS/Windows |
| BLE через **Подключить** (`requestDevice`) | да, если рядом есть датчик и Chrome видит Bluetooth |
| Запись в Google Sheets | только после настройки Apps Script (ниже) |

На **Android Chrome** после деплоя на GitHub Pages — полный сценарий со сканированием.

---

## Google: пошагово

### 1. Google Таблица

1. [sheets.new](https://sheets.new) — новая таблица, название например «House Monitor».
2. **Расширения → Apps Script**.
3. Удалите содержимое `Code.gs`, вставьте код из [`apps-script/Code.gs`](apps-script/Code.gs).
4. В `CONFIG.ALLOWED_ORIGIN` укажите ваш GitHub Pages URL, например:
   `https://username.github.io`
5. Запустите функцию **`setupSheets`** (▶ Run) — создадутся листы:
   - `measurements` — все замеры
   - `installations` — whitelist телефонов
   - `allowed_devices` — whitelist датчиков (по умолчанию «Дом», «Улица»)

### 2. Деплой Web App

1. **Deploy → New deployment → Web app**
2. Execute as: **Me**
3. Who has access: **Anyone**
4. Скопируйте URL вида `https://script.google.com/macros/s/.../exec`

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

1. Нажмите **Демо** → **Записать**.
2. На листе `measurements` должны появиться строки.

---

## GitHub Pages

1. Repo `house-monitor`, залить содержимое папки.
2. **Settings → Pages →** branch `main`, folder `/ (root)`.
3. URL: `https://username.github.io/house-monitor/`
4. Обновите `BASE_PATH` и `ALLOWED_ORIGIN` в `config.js`.

---

## Структура JSON (POST)

```json
{
  "installation_id": "uuid",
  "client_version": "1.0.0",
  "timestamp": "2026-06-28T12:00:00+03:00",
  "comment": "утренний замер",
  "location": "Дом",
  "measurements": [
    {
      "name": "Дом",
      "mac": "device-id-from-ble",
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
