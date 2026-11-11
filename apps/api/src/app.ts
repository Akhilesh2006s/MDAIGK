import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { ERROR_CODES } from '@mango/shared';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { openApiSpec } from './openapi';
import { analyticsRouter } from './routes/analytics';
import { authRouter } from './routes/auth';
import { contentRouter } from './routes/content';
import { engagementRouter, publicRouter } from './routes/engagement';
import { platformRouter } from './routes/platform';
import { schoolsRouter } from './routes/schools';
import { studentRouter } from './routes/student';
import { teacherRouter } from './routes/teacher';

export function createApp() {
  const app = express();
  const isTest = env().NODE_ENV === 'test';

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = env().CORS_ORIGINS.split(',').map((o) => o.trim());
  app.use(
    cors({
      // Mobile apps send no Origin header; browsers must match the allow-list.
      origin: (origin, cb) => cb(null, !origin || origins.includes(origin)),
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  if (!isTest) app.use(morgan(env().NODE_ENV === 'production' ? 'combined' : 'dev'));

  const limited = (max: number) =>
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: max,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: () => isTest,
      handler: (_req, res) => res.status(429).json({ error: { code: ERROR_CODES.RATE_LIMITED, message: 'Too many requests, please slow down' } }),
    });

  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'Mango Dude API' }));
  app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec));

  const v1 = express.Router();
  v1.use('/auth', limited(50), authRouter);
  v1.use('/public', limited(100), publicRouter);
  v1.use(limited(3000));
  v1.use('/schools', schoolsRouter);
  v1.use('/teacher', teacherRouter);
  v1.use('/student', studentRouter);
  v1.use(platformRouter); // includes GET /analytics/platform
  v1.use('/analytics', analyticsRouter);
  v1.use(contentRouter);
  v1.use(engagementRouter);
  app.use('/api/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
