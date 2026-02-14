import type { FastifyPluginAsync } from 'fastify';
import { UserSchema, LoginRequestSchema, z } from '@chadder/shared/schemas';

export const userRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/users/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;

    // Validate UUID format
    const result = z.string().uuid().safeParse(id);
    if (!result.success) {
      return reply.badRequest('Invalid user ID format');
    }

    // TODO: Replace with actual database lookup
    const mockUser = {
      id,
      email: 'user@example.com',
      name: 'Example User',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Validate response matches schema
    const validatedUser = UserSchema.parse(mockUser);

    return {
      success: true,
      data: validatedUser,
    };
  });

  // POST /api/users/login
  fastify.post('/login', async (request, reply) => {
    const parseResult = LoginRequestSchema.safeParse(request.body);

    if (!parseResult.success) {
      return reply.badRequest(parseResult.error.message);
    }

    // TODO: Replace with actual authentication
    return {
      success: true,
      data: {
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        expiresIn: 3600,
      },
    };
  });
};
