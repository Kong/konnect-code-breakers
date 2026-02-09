import { GAME_RULES, generateSecretCode, scoreGuess } from "./gameLogic.js";
import type { Game, GameRecord, Guess, GuessResult, GameStatus } from "./types.js";

const GUESS_PATTERN = /^[1-6]{4}$/;

export class GameStore {
  private readonly games = new Map<number, GameRecord>();
  private nextId = 1;

  private toPublicGame(record: GameRecord): Game {
    const base = {
      ...record.game,
      guesses: [...record.game.guesses]
    };

    if (record.game.status === "lost") {
      return { ...base, revealedCode: record.secretCode };
    }

    return base;
  }

  createGame(ownerId: string): Game {
    const now = new Date().toISOString();
    const game: Game = {
      id: this.nextId,
      status: "active",
      codeLength: GAME_RULES.codeLength,
      symbols: [...GAME_RULES.symbols],
      maxAttempts: GAME_RULES.maxAttempts,
      attemptsUsed: 0,
      guesses: [],
      createdAt: now,
      updatedAt: now
    };

    const record: GameRecord = {
      ownerId,
      secretCode: generateSecretCode(),
      game
    };

    this.games.set(this.nextId, record);
    this.nextId += 1;

    return this.toPublicGame(record);
  }

  getGame(gameId: number, ownerId: string): Game | undefined {
    const record = this.games.get(gameId);
    if (!record || record.ownerId !== ownerId) {
      return undefined;
    }
    return this.toPublicGame(record);
  }

  createGuess(gameId: number, ownerId: string, guessValue: string): GuessResult {
    const record = this.games.get(gameId);
    if (!record || record.ownerId !== ownerId) {
      throw new GameStoreError("not_found", "Game not found.", 404);
    }

    if (!GUESS_PATTERN.test(guessValue)) {
      throw new GameStoreError("invalid_guess", "Guess must match pattern ^[1-6]{4}$.", 422);
    }

    if (record.game.status !== "active") {
      throw new GameStoreError("game_finished", "Game is already finished.", 409);
    }

    const attemptNumber = record.game.attemptsUsed + 1;
    const hint = scoreGuess(record.secretCode, guessValue);
    const createdAt = new Date().toISOString();
    const guess: Guess = {
      attemptNumber,
      guess: guessValue,
      hint,
      createdAt
    };

    record.game.attemptsUsed = attemptNumber;
    record.game.guesses = [...record.game.guesses, guess];

    record.game.status = this.resolveStatus(hint.exact, attemptNumber);
    record.game.updatedAt = createdAt;

    return {
      gameId: record.game.id,
      attemptNumber,
      guess: guessValue,
      hint,
      statusAfterGuess: record.game.status,
      remainingAttempts: Math.max(record.game.maxAttempts - attemptNumber, 0)
    };
  }

  private resolveStatus(exactMatches: number, attemptNumber: number): GameStatus {
    if (exactMatches === GAME_RULES.codeLength) {
      return "won";
    }
    if (attemptNumber >= GAME_RULES.maxAttempts) {
      return "lost";
    }
    return "active";
  }
}

export class GameStoreError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
