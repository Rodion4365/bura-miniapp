# Инициализация базы данных с существующими данными

## Способ 1: Автоматический (рекомендуемый)

Выполните на сервере после запуска контейнеров:

```bash
# Перейдите в директорию проекта
cd /opt/app/projects/bura-miniapp

# Выполните SQL скрипт
docker exec -i bura-postgres psql -U postgres -d bura < init_data.sql
```

## Способ 2: Интерактивный

```bash
# Войдите в контейнер PostgreSQL
docker exec -it bura-postgres psql -U postgres -d bura

# В psql терминале выполните команды:
```

```sql
-- Вставка игроков
INSERT INTO players (player_id, name, avatar_url, created_at, last_seen)
VALUES
    ('315206497', 'Rodion', NULL, '2025-12-18 17:55:19.308901', '2026-01-08 09:58:21.136068'),
    ('330087366', 'Julia', NULL, '2025-12-18 17:55:21.260611', '2026-01-08 09:58:21.723488')
ON CONFLICT (player_id) DO UPDATE SET
    name = EXCLUDED.name,
    last_seen = EXCLUDED.last_seen;

-- Вставка статистики игроков
INSERT INTO player_stats (player_id, total_matches, wins, losses, rating)
VALUES
    ('315206497', 63, 36, 27, 1081),
    ('330087366', 63, 27, 36, 919)
ON CONFLICT (player_id) DO UPDATE SET
    total_matches = EXCLUDED.total_matches,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    rating = EXCLUDED.rating;

-- Проверка данных
SELECT * FROM players;
SELECT * FROM player_stats;

-- Выход из psql
\q
```

## Способ 3: Одной командой

```bash
docker exec -i bura-postgres psql -U postgres -d bura <<'EOF'
INSERT INTO players (player_id, name, avatar_url, created_at, last_seen)
VALUES
    ('315206497', 'Rodion', NULL, '2025-12-18 17:55:19.308901', '2026-01-08 09:58:21.136068'),
    ('330087366', 'Julia', NULL, '2025-12-18 17:55:21.260611', '2026-01-08 09:58:21.723488')
ON CONFLICT (player_id) DO UPDATE SET
    name = EXCLUDED.name,
    last_seen = EXCLUDED.last_seen;

INSERT INTO player_stats (player_id, total_matches, wins, losses, rating)
VALUES
    ('315206497', 63, 36, 27, 1081),
    ('330087366', 63, 27, 36, 919)
ON CONFLICT (player_id) DO UPDATE SET
    total_matches = EXCLUDED.total_matches,
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    rating = EXCLUDED.rating;

SELECT 'Data inserted successfully!' as status;
EOF
```

## Проверка результата

```bash
# Проверить данные в таблице players
docker exec -it bura-postgres psql -U postgres -d bura -c "SELECT * FROM players;"

# Проверить данные в таблице player_stats
docker exec -it bura-postgres psql -U postgres -d bura -c "SELECT * FROM player_stats;"
```

## Примечания

- Используется `ON CONFLICT DO UPDATE` - если данные уже есть, они обновятся
- Если нужно полностью пересоздать БД, сначала очистите таблицы (раскомментируйте TRUNCATE в init_data.sql)
- Команды безопасны для повторного выполнения
