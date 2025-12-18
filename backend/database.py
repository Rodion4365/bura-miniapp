"""
База данных для хранения статистики игроков и истории матчей.
Использует PostgreSQL с asyncpg и SQLAlchemy для асинхронной работы.
"""
from __future__ import annotations

import os
from typing import Optional, List, Dict
from datetime import datetime

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import String, Integer, Float, Boolean, DateTime, select, desc, func
from sqlalchemy.sql import text


# Получаем URL БД из переменной окружения
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/bura")

# Создаём async engine
engine = create_async_engine(DATABASE_URL, echo=False)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PlayerStats(Base):
    __tablename__ = "player_stats"

    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    total_matches: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    rating: Mapped[int] = mapped_column(Integer, default=1000)


class Match(Base):
    __tablename__ = "matches"

    match_id: Mapped[str] = mapped_column(String, primary_key=True)
    room_id: Mapped[str] = mapped_column(String, nullable=False)
    variant_key: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    finished_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    winner_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    total_rounds: Mapped[int] = mapped_column(Integer, nullable=False)


class MatchParticipant(Base):
    __tablename__ = "match_participants"

    match_id: Mapped[str] = mapped_column(String, primary_key=True)
    player_id: Mapped[str] = mapped_column(String, primary_key=True)
    final_score: Mapped[int] = mapped_column(Integer, nullable=False)
    is_winner: Mapped[bool] = mapped_column(Boolean, nullable=False)


async def init_database():
    """Инициализация базы данных при старте приложения"""
    async with engine.begin() as conn:
        # Создаём таблицы
        await conn.run_sync(Base.metadata.create_all)

        # Создаём индексы
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_player_stats_rating
            ON player_stats(rating DESC)
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_matches_finished
            ON matches(finished_at DESC)
        """))

        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_match_participants_player
            ON match_participants(player_id)
        """))

    print("[Database] PostgreSQL initialized successfully")


async def upsert_player(player_id: str, name: str, avatar_url: Optional[str] = None):
    """Создать или обновить игрока"""
    async with async_session_maker() as session:
        # Проверяем, существует ли игрок
        result = await session.execute(
            select(Player).where(Player.player_id == player_id)
        )
        existing_player = result.scalar_one_or_none()

        if existing_player:
            # Обновляем существующего игрока
            existing_player.name = name
            existing_player.avatar_url = avatar_url
            existing_player.last_seen = datetime.utcnow()
        else:
            # Создаём нового игрока
            new_player = Player(
                player_id=player_id,
                name=name,
                avatar_url=avatar_url
            )
            session.add(new_player)

        # Создаём статистику, если её нет
        result = await session.execute(
            select(PlayerStats).where(PlayerStats.player_id == player_id)
        )
        existing_stats = result.scalar_one_or_none()

        if not existing_stats:
            new_stats = PlayerStats(player_id=player_id)
            session.add(new_stats)

        await session.commit()


async def save_match(
    match_id: str,
    room_id: str,
    variant_key: str,
    winner_id: Optional[str],
    participants: List[Dict],
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
    async with async_session_maker() as session:
        # Вычисляем приблизительное время старта (3 минуты на раунд)
        started_at = datetime.utcnow()
        # Используем timedelta для корректного вычисления
        from datetime import timedelta
        started_at = started_at - timedelta(minutes=total_rounds * 3)

        # Сохраняем матч
        match = Match(
            match_id=match_id,
            room_id=room_id,
            variant_key=variant_key,
            started_at=started_at,
            finished_at=datetime.utcnow(),
            winner_id=winner_id,
            total_rounds=total_rounds
        )
        session.add(match)

        # Сохраняем участников
        for participant in participants:
            player_id = participant["player_id"]
            player_name = participant.get("player_name", "Unknown")
            final_score = participant["final_score"]
            is_winner = participant["is_winner"]

            # Обновляем или создаём игрока
            await upsert_player(player_id, player_name)

            # Сохраняем участника матча
            match_participant = MatchParticipant(
                match_id=match_id,
                player_id=player_id,
                final_score=final_score,
                is_winner=is_winner
            )
            session.add(match_participant)

            # Обновляем статистику игрока
            result = await session.execute(
                select(PlayerStats).where(PlayerStats.player_id == player_id)
            )
            stats = result.scalar_one()

            stats.total_matches += 1
            if is_winner:
                stats.wins += 1
            else:
                stats.losses += 1

        # Обновляем рейтинг (упрощённая Elo система)
        if winner_id and len(participants) == 2:
            # Для 2 игроков используем Elo
            winner = next((p for p in participants if p["is_winner"]), None)
            loser = next((p for p in participants if not p["is_winner"]), None)

            if winner and loser:
                await _update_elo_ratings(session, winner["player_id"], loser["player_id"])

        await session.commit()
        print(f"[Database] Saved match {match_id} with {len(participants)} participants")


async def _update_elo_ratings(session: AsyncSession, winner_id: str, loser_id: str, k: int = 32):
    """Обновить рейтинг игроков по системе Elo"""
    # Получаем текущие рейтинги
    result = await session.execute(
        select(PlayerStats).where(PlayerStats.player_id == winner_id)
    )
    winner_stats = result.scalar_one()
    winner_rating = winner_stats.rating

    result = await session.execute(
        select(PlayerStats).where(PlayerStats.player_id == loser_id)
    )
    loser_stats = result.scalar_one()
    loser_rating = loser_stats.rating

    # Рассчитываем ожидаемые результаты
    expected_winner = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    expected_loser = 1 / (1 + 10 ** ((winner_rating - loser_rating) / 400))

    # Рассчитываем изменения рейтинга
    winner_change = int(k * (1 - expected_winner))
    loser_change = int(k * (0 - expected_loser))

    # Обновляем рейтинги (минимум 100)
    winner_stats.rating = max(100, winner_rating + winner_change)
    loser_stats.rating = max(100, loser_rating + loser_change)

    print(f"[Database] Updated Elo: {winner_id} {winner_rating} -> {winner_stats.rating}, "
          f"{loser_id} {loser_rating} -> {loser_stats.rating}")


async def get_leaderboard(limit: int = 50) -> List[Dict]:
    """Получить топ игроков по рейтингу"""
    async with async_session_maker() as session:
        query = (
            select(
                Player.player_id,
                Player.name,
                Player.avatar_url,
                PlayerStats.rating,
                PlayerStats.total_matches,
                PlayerStats.wins,
                PlayerStats.losses,
                (func.cast(PlayerStats.wins, Float) / func.nullif(PlayerStats.total_matches, 0) * 100).label("win_rate")
            )
            .join(PlayerStats, Player.player_id == PlayerStats.player_id)
            .where(PlayerStats.total_matches > 0)
            .order_by(desc(PlayerStats.rating), desc(PlayerStats.wins))
            .limit(limit)
        )

        result = await session.execute(query)
        rows = result.all()

        return [
            {
                "rank": idx + 1,
                "playerId": row.player_id,
                "name": row.name,
                "avatarUrl": row.avatar_url,
                "rating": row.rating,
                "totalMatches": row.total_matches,
                "wins": row.wins,
                "losses": row.losses,
                "winRate": round(row.win_rate, 1) if row.win_rate else 0
            }
            for idx, row in enumerate(rows)
        ]


async def get_player_stats(player_id: str) -> Optional[Dict]:
    """Получить статистику конкретного игрока"""
    async with async_session_maker() as session:
        query = (
            select(
                Player.player_id,
                Player.name,
                Player.avatar_url,
                PlayerStats.rating,
                PlayerStats.total_matches,
                PlayerStats.wins,
                PlayerStats.losses,
                (func.cast(PlayerStats.wins, Float) / func.nullif(PlayerStats.total_matches, 0) * 100).label("win_rate")
            )
            .join(PlayerStats, Player.player_id == PlayerStats.player_id)
            .where(Player.player_id == player_id)
        )

        result = await session.execute(query)
        row = result.first()

        if not row:
            return None

        return {
            "playerId": row.player_id,
            "name": row.name,
            "avatarUrl": row.avatar_url,
            "rating": row.rating,
            "totalMatches": row.total_matches,
            "wins": row.wins,
            "losses": row.losses,
            "winRate": round(row.win_rate, 1) if row.win_rate else 0
        }


async def get_player_history(player_id: str, limit: int = 20) -> List[Dict]:
    """Получить историю матчей игрока"""
    async with async_session_maker() as session:
        query = (
            select(
                Match.match_id,
                Match.room_id,
                Match.variant_key,
                Match.finished_at,
                MatchParticipant.final_score,
                MatchParticipant.is_winner
            )
            .join(MatchParticipant, Match.match_id == MatchParticipant.match_id)
            .where(MatchParticipant.player_id == player_id)
            .order_by(desc(Match.finished_at))
            .limit(limit)
        )

        result = await session.execute(query)
        rows = result.all()

        return [
            {
                "matchId": row.match_id,
                "roomId": row.room_id,
                "variantKey": row.variant_key,
                "finishedAt": row.finished_at.isoformat(),
                "finalScore": row.final_score,
                "isWinner": row.is_winner
            }
            for row in rows
        ]
