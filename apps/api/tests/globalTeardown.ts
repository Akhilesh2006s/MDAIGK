import type { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function globalTeardown() {
  await (globalThis as { __MONGO_REPL__?: MongoMemoryReplSet }).__MONGO_REPL__?.stop();
}
