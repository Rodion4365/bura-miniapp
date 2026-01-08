# Инструкция по развертыванию Bura MiniApp на сервере с Traefik

Данная инструкция описывает развертывание приложения Bura на сервере, где уже работает другое приложение с Traefik.

## Архитектура

Приложение состоит из трех сервисов:
- **bura-backend** - FastAPI backend (Python)
- **bura-frontend** - Vite + React frontend (Node.js + Nginx)
- **bura-postgres** - PostgreSQL 16 база данных

Все сервисы изолированы и подключены к существующей сети `web` с Traefik reverse proxy.

## Предварительные требования

1. На сервере уже развернут Traefik reverse proxy
2. Существует Docker сеть `web` (используется для всех приложений)
3. DNS записи для доменов настроены и указывают на ваш сервер
4. Docker и Docker Compose установлены

## Шаг 1: Подготовка доменов

Определите домены для вашего приложения. Например:
- Frontend: `bura.callwith.ru` или `bura.example.com`
- Backend: `api.bura.callwith.ru` или `api.bura.example.com`

Убедитесь, что DNS A-записи для этих доменов указывают на IP вашего сервера.

## Шаг 2: Клонирование репозитория

```bash
# Перейдите в директорию с проектами
cd /opt/app/projects

# Клонируйте репозиторий
git clone <repository-url> bura-miniapp
cd bura-miniapp
```

## Шаг 3: Настройка переменных окружения

### 3.1 Корневой .env файл

```bash
# Скопируйте example файл
cp .env.example .env

# Отредактируйте файл
nano .env
```

Укажите ваши домены и безопасный пароль для PostgreSQL:

```env
# Domain Configuration
FRONTEND_HOST=bura.callwith.ru
BACKEND_HOST=api.bura.callwith.ru

# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_very_secure_password_123
POSTGRES_DB=bura
```

### 3.2 Backend .env файл

```bash
# Скопируйте example файл
cp backend/.env.example backend/.env

# Отредактируйте файл
nano backend/.env
```

Обновите следующие параметры:

```env
BOT_TOKEN=<ваш_telegram_bot_token>
ORIGIN=https://bura.callwith.ru
DATABASE_URL=postgresql+asyncpg://postgres:your_very_secure_password_123@bura-postgres:5432/bura
```

**Важно**: Пароль в `DATABASE_URL` должен совпадать с `POSTGRES_PASSWORD` из корневого `.env`

## Шаг 4: Проверка Docker сети

Убедитесь, что сеть `web` существует:

```bash
docker network ls | grep web
```

Если сети нет, создайте её:

```bash
docker network create web
```

## Шаг 5: Сборка и запуск контейнеров

```bash
# Сборка образов
docker-compose build

# Запуск контейнеров в фоновом режиме
docker-compose up -d

# Проверка статуса
docker-compose ps
```

Вы должны увидеть 3 запущенных контейнера:
- `bura-backend`
- `bura-frontend`
- `bura-postgres`

## Шаг 6: Проверка логов

```bash
# Просмотр логов всех сервисов
docker-compose logs -f

# Просмотр логов конкретного сервиса
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

## Шаг 7: Проверка Traefik маршрутизации

Проверьте что Traefik зарегистрировал новые маршруты:

```bash
# Откройте Traefik dashboard
# По умолчанию доступен на http://your-server-ip:8080

# Или проверьте через Docker
docker logs infra-reverse-proxy-1 | grep bura
```

Вы должны увидеть роутеры `bura-frontend` и `bura-backend`.

## Шаг 8: Проверка работы приложения

1. Откройте в браузере ваш frontend домен: `https://bura.callwith.ru`
2. Проверьте что SSL сертификат автоматически получен от Let's Encrypt
3. Проверьте что API доступно: `https://api.bura.callwith.ru/docs`

## Шаг 9: Инициализация базы данных

Если вашему приложению нужны миграции базы данных:

```bash
# Войдите в контейнер backend
docker exec -it bura-backend bash

# Выполните миграции (если используете Alembic)
alembic upgrade head

# Или другие команды инициализации БД
```

## Управление приложением

### Остановка

```bash
docker-compose stop
```

### Запуск

```bash
docker-compose start
```

### Перезапуск

```bash
docker-compose restart
```

### Полная остановка с удалением контейнеров

```bash
docker-compose down
```

### Остановка с удалением данных (ОСТОРОЖНО!)

```bash
# Это удалит все данные из PostgreSQL!
docker-compose down -v
```

### Пересборка после изменений

```bash
# Пересборка и перезапуск
docker-compose up -d --build

# Пересборка конкретного сервиса
docker-compose up -d --build backend
```

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f backend

# Последние 100 строк
docker-compose logs --tail=100
```

## Обновление приложения

```bash
# 1. Получите последние изменения
git pull

# 2. Пересоберите образы
docker-compose build

# 3. Перезапустите контейнеры
docker-compose up -d

# 4. Проверьте что все работает
docker-compose ps
docker-compose logs -f
```

## Резервное копирование базы данных

```bash
# Создать бэкап
docker exec bura-postgres pg_dump -U postgres bura > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
cat backup_20240108_120000.sql | docker exec -i bura-postgres psql -U postgres bura
```

## Изоляция от других приложений

Ваше приложение Bura полностью изолировано от других приложений на сервере:

1. **Уникальные имена контейнеров**: `bura-*` префикс
2. **Уникальные volume**: `bura_postgres_data`
3. **Уникальные домены**: отдельные для frontend и backend
4. **Общая сеть**: все приложения используют одну сеть `web` с Traefik
5. **Нет конфликтов портов**: порты не публикуются наружу, весь трафик через Traefik

## Структура проекта после развертывания

```
/opt/app/projects/bura-miniapp/
├── backend/
│   ├── .env              # Backend environment variables
│   └── ...
├── frontend/
│   └── ...
├── .env                  # Root environment variables (domains, DB)
├── docker-compose.yml    # Main Docker Compose configuration
├── Dockerfile.backend    # Backend container build
├── Dockerfile.frontend   # Frontend container build
└── DEPLOYMENT.md        # This file
```

## Устранение неполадок

### Проблема: Контейнеры не запускаются

```bash
# Проверьте логи
docker-compose logs

# Проверьте что сеть web существует
docker network ls | grep web

# Пересоздайте контейнеры
docker-compose down
docker-compose up -d
```

### Проблема: SSL сертификат не получен

1. Проверьте что DNS записи указывают на сервер
2. Проверьте что порты 80 и 443 открыты
3. Проверьте логи Traefik:

```bash
docker logs infra-reverse-proxy-1
```

### Проблема: Backend не подключается к PostgreSQL

1. Проверьте что пароль в `backend/.env` совпадает с `.env`
2. Проверьте что используется правильный хост: `bura-postgres`
3. Проверьте что PostgreSQL запущен:

```bash
docker-compose ps postgres
docker-compose logs postgres
```

### Проблема: Frontend не может подключиться к Backend

1. Проверьте что домены правильно настроены в `.env`
2. Пересоберите frontend (домены встраиваются во время сборки):

```bash
docker-compose up -d --build frontend
```

## Мониторинг

### Проверка статуса контейнеров

```bash
docker-compose ps
```

### Проверка использования ресурсов

```bash
docker stats bura-backend bura-frontend bura-postgres
```

### Проверка дискового пространства

```bash
docker system df
```

## Безопасность

1. ✅ Используйте сильные пароли для PostgreSQL
2. ✅ Не коммитьте `.env` файлы в Git
3. ✅ SSL сертификаты автоматически управляются Traefik + Let's Encrypt
4. ✅ PostgreSQL доступен только внутри Docker сети
5. ✅ Регулярно обновляйте образы Docker

## Поддержка

При возникновении проблем:
1. Проверьте логи: `docker-compose logs -f`
2. Проверьте статус: `docker-compose ps`
3. Проверьте Traefik dashboard: `http://your-server:8080`
