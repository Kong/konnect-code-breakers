import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyCors from "@fastify/cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GameStore, GameStoreError } from "./gameStore.js";

const server = Fastify({
  logger: true
});

const store = new GameStore();

const REQUIRE_AUTH = process.env.REQUIRE_AUTH === "true";
const PORT = Number(process.env.PORT ?? 8000);
const HOST = process.env.HOST ?? "0.0.0.0";
const FRONTEND_DIST = process.env.FRONTEND_DIST ?? "../frontend/dist";
const SERVE_STATIC = process.env.SERVE_STATIC === "true";

await server.register(fastifyCors, {
  origin: true
});

function getOwnerId(request: FastifyRequest): string {
  const headerValue = request.headers["x-consumer-id"];
  const ownerId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!ownerId) {
    if (REQUIRE_AUTH) {
      throw new GameStoreError("unauthorized", "Missing or invalid credentials.", 401);
    }
    return "anonymous";
  }

  return ownerId;
}

server.get("/health", async () => ({ status: "ok" }));

server.post("/games", async (request, reply) => {
  try {
    const ownerId = getOwnerId(request);
    const game = store.createGame(ownerId);
    return reply.code(201).send(game);
  } catch (error) {
    return handleError(reply, error);
  }
});

server.get("/games/:gameId", async (request, reply) => {
  try {
    const ownerId = getOwnerId(request);
    const gameId = Number((request.params as { gameId: string }).gameId);
    const game = store.getGame(gameId, ownerId);
    if (!game) {
      return reply.code(404).send({ code: "not_found", message: "Game not found." });
    }
    return reply.send(game);
  } catch (error) {
    return handleError(reply, error);
  }
});

server.post("/games/:gameId/guesses", async (request, reply) => {
  try {
    const ownerId = getOwnerId(request);
    const gameId = Number((request.params as { gameId: string }).gameId);
    const body = request.body as { guess?: string } | undefined;
    const guess = body?.guess ?? "";

    const result = store.createGuess(gameId, ownerId, guess);
    return reply.code(201).send(result);
  } catch (error) {
    return handleError(reply, error);
  }
});

if (SERVE_STATIC) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const distPath = path.resolve(__dirname, FRONTEND_DIST);

  server.register(fastifyStatic, {
    root: distPath,
    prefix: "/"
  });

  server.setNotFoundHandler((request, reply) => {
    if (request.raw.method === "GET") {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ code: "not_found", message: "Resource not found." });
  });
}

function handleError(reply: FastifyReply, error: unknown) {
  if (error instanceof GameStoreError) {
    return reply.code(error.statusCode).send({ code: error.code, message: error.message });
  }

  server.log.error(error);
  return reply.code(500).send({ code: "internal_error", message: "Unexpected server error." });
}

server.listen({ port: PORT, host: HOST }).catch((error) => {
  server.log.error(error);
  process.exit(1);
});
