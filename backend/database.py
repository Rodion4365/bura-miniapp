"""
База данных для хранения статистики игроков и истории матчей.
Использует SQLite с aiosqlite для асинхронной работы.
"""
from __future__ import annotations

import os
import aiosqlite
from typing import Optional, List, Dict
from datetime import datetime


# Получаем путь к БД из переменной окружения
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/bura.db")
DB_PATH = DATABASE_URL.replace("sqlite:///", "")


async def init_database():
    """Инициализация базы данных при старте приложения"""
    # Создаём директорию data, если её нет
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

    async with aiosqlite.connect(DB_PATH) as db:
        # Создаём таблицы
        await db.execute("""
            CREATE TABLE IF NOT EXISTS players (
                player_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                avatar_url TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS player_stats (
                player_id TEXT PRIMARY KEY,
                total_matches INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                rating INTEGER DEFAULT 1000,
                FOREIGN KEY (player_id) REFERENCES players(player_id)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS matches (
                match_id TEXT PRIMARY KEY,
                room_id TEXT,
                variant_key TEXT,
                started_at TIMESTAMP,
                finished_at TIMESTAMP,
                winner_id TEXT,
                total_rounds INTEGER
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS match_participants (
                match_id TEXT,
                player_id TEXT,
                final_score INTEGER,
                is_winner BOOLEAN,
                FOREIGN KEY (match_id) REFERENCES matches(match_id),
                FOREIGN KEY (player_id) REFERENCES players(player_id),
                PRIMARY KEY (match_id, player_id)
            )
        """)

        # Создаём индексы для быстрого поиска
        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_player_stats_rating
            ON player_stats(rating DESC)
        """)

        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_matches_finished
            ON matches(finished_at DESC)
        """)

        await db.commit()
        print("[Database] Initialized successfully at:", DB_PATH)


async def upsert_player(player_id: str, name: str, avatar_url: Optional[str] = None):
    """Создать или обновить игрока"""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            INSERT INTO players (player_id, name, avatar_url, last_seen)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(player_id) DO UPDATE SET
                name = excluded.name,
                avatar_url = excluded.avatar_url,
                last_seen = CURRENT_TIMESTAMP
        """, (player_id, name, avatar_url))

        # Создаём статистику, если её нет
        await db.execute("""
            INSERT OR IGNORE INTO player_stats (player_id)
            VALUES (?)
        """, (player_id,))

        await db.commit()


async def save_match(
    match_id: str,
    room_id: str,
    variant_key: str,
    winner_id: Optional[str],
    participants: List[Dict[str, any]],
    total_rounds: int
):
    """
    Сохранить результаты матча

    participants: список словарей вида:
        {
            "player_id": "123",
            "player_name": "Иван",
            "final_score": 12,
            "is_winner": False
        }
    """
    async with aiosqlite.connect(DB_PATH) as db:
        # Сохраняем матч
        await db.execute("""
            INSERT INTO matches (match_id, room_id, variant_key, started_at, finished_at, winner_id, total_rounds)
            VALUES (?, ?, ?, datetime('now', '-' || ? || ' minutes'), CURRENT_TIMESTAMP, ?, ?)
        """, (match_id, room_id, variant_key, total_rounds * 3, winner_id, total_rounds))

        # Сохраняем участников
        for participant in participants:
            player_id = participant["player_id"]
            player_name = participant.get("player_name", "Unknown")
            final_score = participant["final_score"]
            is_winner = participant["is_winner"]

            # Обновляем или создаём игрока
            await upsert_player(player_id, player_name)

            # Сохраняем участника матча
            await db.execute("""
                INSERT INTO match_participants (match_id, player_id, final_score, is_winner)
                VALUES (?, ?, ?, ?)
            """, (match_id, player_id, final_score, is_winner))

            # Обновляем статистику игрока
            if is_winner:
                await db.execute("""
                    UPDATE player_stats
                    SET total_matches = total_matches + 1,
                        wins = wins + 1
                    WHERE player_id = ?
                """, (player_id,))
            else:
                await db.execute("""
                    UPDATE player_stats
                    SET total_matches = total_matches + 1,
                        losses = losses + 1
                    WHERE player_id = ?
                """, (player_id,))

        # Обновляем рейтинг (упрощённая Elo система)
        if winner_id and len(participants) == 2:
            # Для 2 игроков используем Elo
            winner = next((p for p in participants if p["is_winner"]), None)
            loser = next((p for p in participants if not p["is_winner"]), None)

            if winner and loser:
                await _update_elo_ratings(db, winner["player_id"], loser["player_id"])

        await db.commit()
        print(f"[Database] Saved match {match_id} with {len(participants)} participants")


async def _update_elo_ratings(db: aiosqlite.Connection, winner_id: str, loser_id: str, k: int = 32):
    """Обновить рейтинг игроков по системе Elo"""
    # Получаем текущие рейтинги
    async with db.execute("SELECT rating FROM player_stats WHERE player_id = ?", (winner_id,)) as cursor:
        row = await cursor.fetchone()
        winner_rating = row[0] if row else 1000

    async with db.execute("SELECT rating FROM player_stats WHERE player_id = ?", (loser_id,)) as cursor:
        row = await cursor.fetchone()
        loser_rating = row[0] if row else 1000

    # Рассчитываем ожидаемые результаты
    expected_winner = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    expected_loser = 1 / (1 + 10 ** ((winner_rating - loser_rating) / 400))

    # Рассчитываем изменения рейтинга
    winner_change = int(k * (1 - expected_winner))
    loser_change = int(k * (0 - expected_loser))

    # Обновляем рейтинги
    new_winner_rating = max(100, winner_rating + winner_change)  # Минимум 100
    new_loser_rating = max(100, loser_rating + loser_change)

    await db.execute("UPDATE player_stats SET rating = ? WHERE player_id = ?", (new_winner_rating, winner_id))
    await db.execute("UPDATE player_stats SET rating = ? WHERE player_id = ?", (new_loser_rating, loser_id))

    print(f"[Database] Updated Elo: {winner_id} {winner_rating} -> {new_winner_rating}, {loser_id} {loser_rating} -> {new_loser_rating}")


async def get_leaderboard(limit: int = 50) -> List[Dict]:
    """Получить топ игроков по рейтингу"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT
                p.player_id,
                p.name,
                p.avatar_url,
                s.rating,
                s.total_matches,
                s.wins,
                s.losses,
                ROUND(CAST(s.wins AS FLOAT) / NULLIF(s.total_matches, 0) * 100, 1) as win_rate
            FROM player_stats s
            JOIN players p ON s.player_id = p.player_id
            WHERE s.total_matches > 0
            ORDER BY s.rating DESC, s.wins DESC
            LIMIT ?
        """, (limit,)) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "rank": idx + 1,
                    "playerId": row["player_id"],
                    "name": row["name"],
                    "avatarUrl": row["avatar_url"],
                    "rating": row["rating"],
                    "totalMatches": row["total_matches"],
                    "wins": row["wins"],
                    "losses": row["losses"],
                    "winRate": row["win_rate"] or 0
                }
                for idx, row in enumerate(rows)
            ]


async def get_player_stats(player_id: str) -> Optional[Dict]:
    """Получить статистику конкретного игрока"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT
                p.player_id,
                p.name,
                p.avatar_url,
                s.rating,
                s.total_matches,
                s.wins,
                s.losses,
                ROUND(CAST(s.wins AS FLOAT) / NULLIF(s.total_matches, 0) * 100, 1) as win_rate
            FROM player_stats s
            JOIN players p ON s.player_id = p.player_id
            WHERE p.player_id = ?
        """, (player_id,)) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return {
                "playerId": row["player_id"],
                "name": row["name"],
                "avatarUrl": row["avatar_url"],
                "rating": row["rating"],
                "totalMatches": row["total_matches"],
                "wins": row["wins"],
                "losses": row["losses"],
                "winRate": row["win_rate"] or 0
            }


async def get_player_history(player_id: str, limit: int = 20) -> List[Dict]:
    """Получить историю матчей игрока"""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        async with db.execute("""
            SELECT
                m.match_id,
                m.room_id,
                m.variant_key,
                m.finished_at,
                mp.final_score,
                mp.is_winner
            FROM match_participants mp
            JOIN matches m ON mp.match_id = m.match_id
            WHERE mp.player_id = ?
            ORDER BY m.finished_at DESC
            LIMIT ?
        """, (player_id, limit)) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "matchId": row["match_id"],
                    "roomId": row["room_id"],
                    "variantKey": row["variant_key"],
                    "finishedAt": row["finished_at"],
                    "finalScore": row["final_score"],
                    "isWinner": bool(row["is_winner"])
                }
                for row in rows
            ]
