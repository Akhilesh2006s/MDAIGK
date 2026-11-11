import dns from 'node:dns';
import mongoose from 'mongoose';

mongoose.set('strictQuery', true);

export async function connectDb(uri: string) {
  // Some Windows setups make Node use 127.0.0.1 as resolver, which breaks
  // mongodb+srv:// SRV lookups. DNS_SERVERS lets us point Node at a working resolver.
  if (process.env.DNS_SERVERS) {
    dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  }
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

let txSupport: boolean | null = null;

/** True when the connected deployment supports multi-document transactions (replica set / Atlas). */
export async function supportsTransactions(): Promise<boolean> {
  if (txSupport !== null) return txSupport;
  try {
    const hello = await mongoose.connection.db!.admin().command({ hello: 1 });
    txSupport = Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    txSupport = false;
  }
  return txSupport;
}

/**
 * Run `fn` inside a transaction when the deployment supports it (Atlas does),
 * otherwise run it directly. Callers must pass the session to every query.
 */
export async function withTransaction<T>(fn: (session: mongoose.ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!(await supportsTransactions())) return fn(undefined);
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
