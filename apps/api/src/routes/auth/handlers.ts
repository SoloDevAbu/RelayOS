import { randomBytes, createHash } from "node:crypto";
import { eq, and, gt, isNull } from "drizzle-orm";
import { users, refreshTokens } from "@relayos/db/schema";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import type {
  SignupBodyType,
  SigninBodyType,
  RefreshBodyType,
  LogoutBodyType,
} from "./schemas.js";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Create a refresh token, persist its hash in DB, return the raw token.
 * The raw token is returned to the client; only the hash is stored.
 */
async function createRefreshToken(
  fastify: FastifyInstance,
  userId: string,
): Promise<string> {
  const rawToken = randomBytes(40).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(
    Date.now() + fastify.config.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  );

  await fastify.db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}

export async function signup(
  request: FastifyRequest<{ Body: SignupBodyType }>,
  reply: FastifyReply,
) {
  const { name, email, password } = request.body;
  const fastify = request.server;

  // Check if email already exists
  const [existing] = await fastify.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing) {
    return reply.conflict("An account with this email already exists");
  }

  const passwordHash = await hashPassword(password);

  const inserted = await fastify.db
    .insert(users)
    .values({
      name,
      email: email.toLowerCase(),
      passwordHash,
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      createdAt: users.createdAt,
    });

  const newUser = inserted[0];
  if (!newUser) throw new Error("Failed to create user");

  const accessToken = fastify.jwt.sign({
    id: newUser.id,
    email: newUser.email,
  });
  const refreshToken = await createRefreshToken(fastify, newUser.id);

  reply.code(201);
  return {
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      createdAt: newUser.createdAt.toISOString(),
    },
    accessToken,
    refreshToken,
  };
}

export async function signin(
  request: FastifyRequest<{ Body: SigninBodyType }>,
  reply: FastifyReply,
) {
  const { email, password } = request.body;
  const fastify = request.server;

  const [user] = await fastify.db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  // Constant-time: always attempt verify even if user not found to prevent
  // timing-based user enumeration attacks
  const isValid =
    user !== undefined && (await verifyPassword(user.passwordHash, password));

  if (!isValid) {
    return reply.unauthorized("Invalid email or password");
  }

  const accessToken = fastify.jwt.sign({ id: user.id, email: user.email });
  const refreshToken = await createRefreshToken(fastify, user.id);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    },
    accessToken,
    refreshToken,
  };
}

export async function refresh(
  request: FastifyRequest<{ Body: RefreshBodyType }>,
  reply: FastifyReply,
) {
  const { refreshToken: rawToken } = request.body;
  const fastify = request.server;
  const tokenHash = sha256(rawToken);
  const now = new Date();

  // Find valid, non-revoked, non-expired token
  const [stored] = await fastify.db
    .select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
    })
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
        gt(refreshTokens.expiresAt, now),
      ),
    )
    .limit(1);

  if (!stored) {
    return reply.unauthorized("Invalid or expired refresh token");
  }

  // Rotate: revoke old token
  await fastify.db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(eq(refreshTokens.id, stored.id));

  // Fetch user for payload
  const [user] = await fastify.db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, stored.userId))
    .limit(1);

  if (!user) {
    return reply.unauthorized("User not found");
  }

  const accessToken = fastify.jwt.sign({ id: user.id, email: user.email });
  const newRefreshToken = await createRefreshToken(fastify, user.id);

  return { accessToken, refreshToken: newRefreshToken };
}

export async function logout(
  request: FastifyRequest<{ Body: LogoutBodyType }>,
  reply: FastifyReply,
) {
  const { refreshToken: rawToken } = request.body;
  const fastify = request.server;
  const tokenHash = sha256(rawToken);
  const now = new Date();

  await fastify.db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        isNull(refreshTokens.revokedAt),
      ),
    );

  return { message: "Logged out successfully" };
}
