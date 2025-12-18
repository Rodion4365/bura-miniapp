# База данных PostgreSQL - Инструкция по настройке

## Локальная разработка

### Вариант 1: Docker (рекомендуется)

1. Запустить PostgreSQL в Docker:
```bash
docker-compose -f docker-compose.db.yml up -d
```

2. Настроить `.env` файл:
```bash
cp backend/.env.example backend/.env
```

3. В `backend/.env` установить:
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/bura
```

4. Запустить backend (БД создастся автоматически):
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Вариант 2: Локальный PostgreSQL

1. Установить PostgreSQL 16
2. Создать базу данных:
```sql
CREATE DATABASE bura;
```

3. Настроить `backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://your_user:your_password@localhost:5432/bura
```

## Production (Render, Railway, etc.)

### Render.com

1. Создать PostgreSQL instance в Render
2. Скопировать **Internal Database URL**
3. В Environment Variables добавить:
```
DATABASE_URL=<your_internal_database_url>
```

Формат: `postgresql+asyncpg://user:password@host:port/database`

### Railway.app

1. Добавить PostgreSQL из Marketplace
2. Railway автоматически создаст переменную `DATABASE_URL`
3. Убедиться, что формат содержит `+asyncpg`:
```
DATABASE_URL=postgresql+asyncpg://...
```

### Vercel + Neon/Supabase

1. Создать БД в Neon или Supabase
2. Получить connection string
3. Добавить в Vercel Environment Variables:
```
DATABASE_URL=postgresql+asyncpg://user:password@host/database
```

## Структура БД

Таблицы создаются автоматически при первом запуске:

### players
- `player_id` (PK) - ID игрока из Telegram
- `name` - имя игрока
- `avatar_url` - URL аватара
- `created_at` - дата регистрации
- `last_seen` - последняя активность

### player_stats
- `player_id` (PK) - ID игрока
- `total_matches` - количество матчей
- `wins` - количество побед
- `losses` - количество поражений
- `rating` - рейтинг Elo (начальный: 1000)

### matches
- `match_id` (PK) - UUID матча
- `room_id` - ID комнаты
- `variant_key` - вариант игры
- `started_at` - время начала
- `finished_at` - время окончания
- `winner_id` - ID победителя
- `total_rounds` - количество раундов

### match_participants
- `match_id` (PK) - ID матча
- `player_id` (PK) - ID игрока
- `final_score` - финальный счёт
- `is_winner` - победа (true/false)

## Миграции

При изменении схемы БД:

1. Обновить модели в `backend/database.py`
2. SQLAlchemy автоматически создаст новые таблицы/колонки при запуске

Для production рекомендуется использовать Alembic:
```bash
pip install alembic
alembic init migrations
```

## Индексы

Автоматически создаются индексы:
- `idx_player_stats_rating` - для быстрого получения рейтинга
- `idx_matches_finished` - для сортировки по времени
- `idx_match_participants_player` - для истории игрока

## Бэкапы

### Локально:
```bash
docker exec bura-postgres pg_dump -U postgres bura > backup.sql
```

### Восстановление:
```bash
docker exec -i bura-postgres psql -U postgres bura < backup.sql
```

### Production:
Используйте встроенные инструменты бэкапов вашего провайдера (Render, Railway, Neon, etc.)

## Мониторинг

Проверить статус БД:
```bash
docker exec bura-postgres psql -U postgres -c "SELECT count(*) FROM players;"
```

Посмотреть рейтинг:
```bash
docker exec bura-postgres psql -U postgres bura -c "SELECT name, rating FROM player_stats ORDER BY rating DESC LIMIT 10;"
```

## Troubleshooting

### Ошибка подключения
```
asyncpg.exceptions.InvalidCatalogNameError: database "bura" does not exist
```

**Решение**: Создать базу данных вручную:
```bash
docker exec bura-postgres psql -U postgres -c "CREATE DATABASE bura;"
```

### Порт 5432 занят
**Решение**: Изменить порт в `docker-compose.db.yml`:
```yaml
ports:
  - "5433:5432"  # изменить на свободный порт
```

И в `.env`:
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/bura
```

### SQLAlchemy версия несовместима
**Решение**: Убедиться что установлена версия 2.x:
```bash
pip install "sqlalchemy[asyncio]>=2.0.0"
```
