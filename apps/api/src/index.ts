import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { healthRoutes } from './routes/health';
import { userRoutes } from './routes/users';

const fastify = Fastify({
  logger: true,
});

async function start() {
  // Register plugins
  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  });
  await fastify.register(sensible);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/api' });
  await fastify.register(userRoutes, { prefix: '/api/users' });

  // Start server
  const port = Number(process.env.PORT) || 4000;
  const host = process.env.HOST ?? '0.0.0.0';

  try {
    await fastify.listen({ port, host });
    console.log(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
