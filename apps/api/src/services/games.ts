import type { Types } from 'mongoose';
import { ERROR_CODES } from '@mango/shared';
import { GameAttempt, GameDailyUsage } from '../models';
import { localDateKey, nextLocalMidnight } from '../utils/dates';
import { AppError } from '../utils/errors';

/**
 * Atomically reserve one of today's attempts for (student, game).
 * Uses a conditional upsert on a unique (studentId, gameId, localDateKey) counter:
 * when the counter is at the limit the filter does not match, the upsert's insert
 * collides with the unique index and we know the limit is reached. Concurrent
 * first-of-day inserts are retried so they are not misreported as over-limit.
 */
export async function reserveGameAttempt(params: {
  schoolId: Types.ObjectId;
  studentId: Types.ObjectId;
  classSectionId?: Types.ObjectId;
  gameId: Types.ObjectId;
  dailyLimit: number;
  timezone: string;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const key = localDateKey(now, params.timezone);
  const filter = { studentId: params.studentId, gameId: params.gameId, localDateKey: key };
  let usage: { count: number } | null = null;
  for (let i = 0; i < 3 && !usage; i++) {
    try {
      usage = await GameDailyUsage.findOneAndUpdate(
        { ...filter, count: { $lt: params.dailyLimit } },
        { $inc: { count: 1 } },
        { upsert: true, new: true },
      ).lean();
    } catch (e) {
      if ((e as { code?: number }).code !== 11000) throw e;
      const current = await GameDailyUsage.findOne(filter).lean();
      if (current && current.count >= params.dailyLimit) break;
    }
  }
  if (!usage) {
    throw new AppError(429, ERROR_CODES.DAILY_LIMIT_REACHED, `Daily limit of ${params.dailyLimit} attempts reached for this game`, {
      limit: params.dailyLimit,
      used: params.dailyLimit,
      remaining: 0,
      resetsAt: nextLocalMidnight(now, params.timezone).toISOString(),
    });
  }
  const attempt = await GameAttempt.create({
    schoolId: params.schoolId,
    studentId: params.studentId,
    gameId: params.gameId,
    classSectionId: params.classSectionId,
    localDateKey: key,
    seq: usage.count,
    startedAt: now,
  });
  return {
    attempt,
    usage: {
      limit: params.dailyLimit,
      used: usage.count,
      remaining: Math.max(0, params.dailyLimit - usage.count),
      resetsAt: nextLocalMidnight(now, params.timezone).toISOString(),
    },
  };
}

export async function dailyUsageFor(studentId: Types.ObjectId, games: Array<{ _id: Types.ObjectId; dailyLimit?: number | null }>, timezone: string) {
  const now = new Date();
  const key = localDateKey(now, timezone);
  const rows = await GameDailyUsage.find({ studentId, localDateKey: key, gameId: { $in: games.map((g) => g._id) } }).lean();
  const used = new Map(rows.map((r) => [r.gameId.toString(), r.count]));
  const resetsAt = nextLocalMidnight(now, timezone).toISOString();
  return new Map(
    games.map((g) => {
      const limit = g.dailyLimit ?? 2;
      const u = Math.min(used.get(g._id.toString()) ?? 0, limit);
      return [g._id.toString(), { limit, used: u, remaining: limit - u, resetsAt, dateKey: key }];
    }),
  );
}
