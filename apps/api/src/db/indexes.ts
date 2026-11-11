import mongoose from 'mongoose';
import '../models';

/** Create indexes declared on the schemas (idempotent). Run at startup and by the seed script. */
export async function syncIndexes() {
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection().catch(() => undefined);
    await model.syncIndexes();
  }
}
