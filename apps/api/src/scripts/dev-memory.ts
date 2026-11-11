/**
 * Local development without Atlas: starts an in-memory MongoDB replica set
 * (transactions supported), seeds demo data and serves the API on PORT.
 * Data is discarded when the process stops.
 */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { connectDb } from '../db/connect';

async function main() {
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_URI = repl.getUri('mango_dude_dev');
  const { env } = await import('../config/env');
  const { seedAll } = await import('./seed');
  const { createApp } = await import('../app');
  await connectDb(env().MONGO_URI);
  await seedAll();
  createApp().listen(env().PORT, () => {
    console.log(`Mango Dude API (in-memory MongoDB) on http://localhost:${env().PORT}  docs: /api/docs`);
  });
  const stop = async () => {
    await repl.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
