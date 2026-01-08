-- Инициализация данных для базы Bura
-- Вставка игроков и их статистики

-- Очистка существующих данных (опционально, раскомментируйте если нужно)
-- TRUNCATE TABLE match_participants CASCADE;
-- TRUNCATE TABLE matches CASCADE;
-- TRUNCATE TABLE player_stats CASCADE;
-- TRUNCATE TABLE players CASCADE;

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

-- Проверка вставленных данных
SELECT 'Players inserted:' as status;
SELECT * FROM players;

SELECT 'Player stats inserted:' as status;
SELECT * FROM player_stats;
