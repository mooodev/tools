# Связи — Deployment & Usage Guide

Руководство по запуску игры локально и деплою на VPS сервер с HTTPS и Telegram ботом.

---

## Содержание

1. [Требования](#требования)
2. [Локальный запуск](#локальный-запуск)
3. [Создание Telegram бота](#создание-telegram-бота)
4. [Деплой на VPS сервер](#деплой-на-vps-сервер)
5. [Настройка HTTPS с Nginx](#настройка-https-с-nginx)
6. [Systemd сервис](#systemd-сервис)
7. [Подключение Telegram WebApp](#подключение-telegram-webapp)
8. [Переменные окружения](#переменные-окружения)
9. [Обслуживание](#обслуживание)
10. [Решение проблем](#решение-проблем)

---

## Требования

- **Node.js** v18 или новее
- **npm** (идёт с Node.js)
- **Git**
- **Telegram аккаунт** (для создания бота через @BotFather)

Проверка установки:

```bash
node --version    # Должно быть v18.x.x или новее
npm --version
git --version
```

---

## Локальный запуск

### Шаг 1 — Клонирование

```bash
git clone <your-repo-url>
cd wordgame
```

### Шаг 2 — Установка зависимостей

```bash
npm install
```

### Шаг 3 — Настройка переменных окружения

```bash
cp .env.example .env
```

Отредактируйте `.env`:

```
PORT=3000
BOT_TOKEN=ваш_токен_от_BotFather
WEBAPP_URL=https://your-domain.com
```

### Шаг 4 — Запуск

```bash
# Без Telegram бота
npm start

# С Telegram ботом (установите BOT_TOKEN в .env)
BOT_TOKEN=your_token WEBAPP_URL=https://your-domain.com npm start
```

### Шаг 5 — Открыть

Откройте `http://localhost:3000` в браузере.

---

## Создание Telegram бота

1. Откройте Telegram, найдите **@BotFather**
2. Отправьте `/newbot`
3. Выберите имя и юзернейм (должен заканчиваться на `bot`)
4. Скопируйте токен в `.env` как `BOT_TOKEN`
5. Настройте команды бота:

```
/setcommands
```

Отправьте BotFather следующий список:

```
start - Начать и подписаться на уведомления
daily - Ежедневный паззл
weekly - Еженедельный паззл
play - Открыть игру
notifications - Настройки уведомлений
stop - Отписаться от уведомлений
help - Помощь
```

6. Настройте кнопку Menu Button (для Mini App):
   - Отправьте `/setmenubutton` в @BotFather
   - Выберите вашего бота
   - Отправьте URL вашего приложения (например, `https://your-domain.com`)

---

## Деплой на VPS сервер

Подходит для любого Linux сервера (Ubuntu/Debian, DigitalOcean, Hetzner, AWS EC2, Linode и др.)

**Минимальные требования:** 512 MB RAM, 1 vCPU, 10 GB диск.

### Шаг 1 — Установка Node.js

```bash
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Шаг 2 — Клонирование проекта

```bash
sudo mkdir -p /opt/svyazi
sudo chown $USER:$USER /opt/svyazi
git clone <your-repo-url> /opt/svyazi
cd /opt/svyazi
```

### Шаг 3 — Установка зависимостей

```bash
npm install --production
```

### Шаг 4 — Настройка окружения

```bash
cp .env.example .env
nano .env
```

Заполните:

```
PORT=3000
BOT_TOKEN=ваш_токен
WEBAPP_URL=https://your-domain.com
```

### Шаг 5 — Создание директории данных

```bash
mkdir -p data
```

### Шаг 6 — Тестовый запуск

```bash
node server.js
```

Проверьте, что сервер запускается на `http://your-server-ip:3000`.

---

## Настройка HTTPS с Nginx

### Шаг 1 — Установка Nginx и Certbot

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Шаг 2 — Настройка домена

Направьте A-запись вашего домена на IP сервера.

### Шаг 3 — Конфигурация Nginx

```bash
sudo nano /etc/nginx/sites-available/svyazi
```

Вставьте:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Шаг 4 — Активация сайта

```bash
sudo ln -s /etc/nginx/sites-available/svyazi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Шаг 5 — Получение SSL сертификата

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot автоматически обновит конфигурацию Nginx для HTTPS.

### Шаг 6 — Автообновление сертификата

```bash
sudo systemctl enable certbot.timer
```

---

## Systemd сервис

### Шаг 1 — Создание файла сервиса

```bash
sudo nano /etc/systemd/system/svyazi.service
```

Вставьте:

```ini
[Unit]
Description=Svyazi Word Game Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/svyazi
EnvironmentFile=/opt/svyazi/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=svyazi

[Install]
WantedBy=multi-user.target
```

### Шаг 2 — Права на файлы

```bash
sudo chown -R www-data:www-data /opt/svyazi/data
```

### Шаг 3 — Запуск сервиса

```bash
sudo systemctl daemon-reload
sudo systemctl enable svyazi
sudo systemctl start svyazi
```

### Шаг 4 — Проверка

```bash
sudo systemctl status svyazi
sudo journalctl -u svyazi -f
```

---

## Подключение Telegram WebApp

После настройки HTTPS:

1. Обновите `WEBAPP_URL` в `.env` на ваш HTTPS URL:

```
WEBAPP_URL=https://your-domain.com
```

2. Перезапустите сервис:

```bash
sudo systemctl restart svyazi
```

3. В @BotFather настройте Menu Button:
   - `/setmenubutton`
   - Выберите бота
   - Отправьте HTTPS URL

4. Проверьте:
   - Откройте бота в Telegram
   - Отправьте `/start`
   - Нажмите кнопку «Играть в Связи»
   - Mini App должен открыться

**Важно:** Telegram WebApp работает **только через HTTPS**. HTTP не поддерживается.

---

## Переменные окружения

| Переменная | Обязательна | По умолчанию | Описание |
|-----------|-------------|-------------|----------|
| `PORT` | Нет | `3000` | Порт веб-сервера |
| `BOT_TOKEN` | Нет* | — | Токен Telegram бота от @BotFather |
| `WEBAPP_URL` | Нет* | `https://your-domain.com` | Публичный HTTPS URL для ссылок в боте |

*Обязательны только при использовании Telegram бота.

---

## Обслуживание

### Обновление приложения

```bash
cd /opt/svyazi
git pull
npm install --production
sudo systemctl restart svyazi
```

### Бэкап данных

```bash
cp /opt/svyazi/data/leaderboard.json /backup/leaderboard-$(date +%Y%m%d).json
cp /opt/svyazi/data/subscribers.json /backup/subscribers-$(date +%Y%m%d).json
```

### Автоматический бэкап (crontab)

```bash
crontab -e
```

Добавьте:

```
0 3 * * * cp /opt/svyazi/data/leaderboard.json /backup/leaderboard-$(date +\%Y\%m\%d).json
0 3 * * * cp /opt/svyazi/data/subscribers.json /backup/subscribers-$(date +\%Y\%m\%d).json
```

### Логи

```bash
# Логи приложения
sudo journalctl -u svyazi --since today

# Логи Nginx
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

---

## Решение проблем

### Бот не отвечает

- Проверьте `BOT_TOKEN` в `.env`
- Убедитесь, что `node-telegram-bot-api` установлен: `npm install node-telegram-bot-api`
- Проверьте логи: `sudo journalctl -u svyazi -f`

### WebApp не открывается в Telegram

- Telegram Mini App работает **только через HTTPS**
- Проверьте, что SSL сертификат валидный: `curl -I https://your-domain.com`
- Проверьте, что `WEBAPP_URL` содержит `https://`
- Убедитесь, что Menu Button настроен в @BotFather

### Порт уже занят

```bash
# Найти процесс на порту 3000
sudo lsof -i :3000
# Или использовать другой порт
PORT=3001 node server.js
```

### Ошибки прав доступа

```bash
sudo chown -R www-data:www-data /opt/svyazi/data
```

### Socket.io не подключается

- Убедитесь, что Nginx настроен на проксирование WebSocket (заголовки `Upgrade` и `Connection`)
- Проверьте, что путь `/socket.io/` проксируется корректно

### Нет уведомлений от бота

- Проверьте, что пользователь отправил `/start` боту
- Проверьте файл `data/subscribers.json`
- Логи покажут ошибки отправки: `sudo journalctl -u svyazi | grep notification`
