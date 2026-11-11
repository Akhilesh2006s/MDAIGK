import { createApp } from './app';
import { env } from './config/env';
import { connectDb, supportsTransactions } from './db/connect';
import { syncIndexes } from './db/indexes';

async function main() {
  const config = env();
  await connectDb(config.MONGO_URI);
  await syncIndexes();
  console.log(`MongoDB connected (transactions: ${(await supportsTransactions()) ? 'yes' : 'no'})`);
  const app = createApp();
  app.listen(config.PORT, () => {
    console.log(`Mango Dude API listening on http://localhost:${config.PORT}`);
    console.log(`API docs: http://localhost:${config.PORT}/api/docs`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
