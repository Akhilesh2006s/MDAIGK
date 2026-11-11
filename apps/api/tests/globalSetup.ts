import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalSetup() {
  // Replica set so transaction code paths run exactly as on Atlas.
  const repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  (globalThis as { __MONGO_REPL__?: MongoMemoryReplSet }).__MONGO_REPL__ = repl;
  process.env.TEST_MONGO_BASE_URI = repl.getUri();
}
