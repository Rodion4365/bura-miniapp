# Быстрый старт с Docker на production сервере

## Для сервера с существующим Traefik

### Шаг 1: Настройка доменов

```bash
# Создайте .env файлы
cp .env.example .env
cp backend/.env.example backend/.env

# Отредактируйте .env - укажите ваши домены
nano .env
```

Пример `.env`:
```env
FRONTEND_HOST=bura.callwith.ru
BACKEND_HOST=api.bura.callwith.ru
POSTGRES_PASSWORD=your_secure_password
```

Пример `backend/.env`:
```env
BOT_TOKEN=<your_telegram_bot_token>
ORIGIN=https://bura.callwith.ru
DATABASE_URL=postgresql+asyncpg://postgres:your_secure_password@bura-postgres:5432/bura
```

### Шаг 2: Убедитесь что сеть web существует

```bash
docker network ls | grep web
# Если нет - создайте:
docker network create web
```

### Шаг 3: Запуск

```bash
docker-compose build
docker-compose up -d
```

### Основные команды

```bash
# Просмотр статуса
docker-compose ps

# Просмотр логов
docker-compose logs -f

# Перезапуск
docker-compose restart

# Остановка
docker-compose down

# Обновление
git pull
docker-compose up -d --build
```

## Особенности конфигурации

✅ **Изоляция**: Уникальные имена контейнеров (bura-*)
✅ **SSL**: Автоматически через Let's Encrypt
✅ **Роутинг**: Через существующий Traefik
✅ **БД**: Отдельная PostgreSQL 16
✅ **Сеть**: Общая сеть `web` с другими приложениями

## Полная документация

См. [DEPLOYMENT.md](./DEPLOYMENT.md) для подробной информации.
