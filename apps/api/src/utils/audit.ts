import type { Request } from 'express';
import type { ClientSession, Types } from 'mongoose';
import { AuditLog, Notification } from '../models';

export async function audit(
  req: Request,
  entry: {
    action: string;
    entityType: string;
    entityId?: Types.ObjectId;
    schoolId?: Types.ObjectId;
    summary?: string;
    before?: unknown;
    after?: unknown;
  },
  session?: ClientSession,
) {
  await AuditLog.create(
    [
      {
        actorId: req.auth?.userId,
        actorRole: req.auth?.role,
        ip: req.ip,
        ...entry,
      },
    ],
    { session },
  );
}

export async function notify(
  userIds: Types.ObjectId[],
  n: { title: string; body?: string; type?: string; link?: string; schoolId?: Types.ObjectId },
) {
  if (!userIds.length) return;
  await Notification.insertMany(userIds.map((userId) => ({ userId, ...n })));
}
