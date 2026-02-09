export type GameStatus = "active" | "won" | "lost";

export interface Hint {
  exact: number;
  colorOnly: number;
}

export interface Guess {
  attemptNumber: number;
  guess: string;
  hint: Hint;
  createdAt: string;
}

export interface Game {
  id: number;
  status: GameStatus;
  codeLength: number;
  symbols: string[];
  maxAttempts: number;
  attemptsUsed: number;
  guesses: Guess[];
  revealedCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuessResult {
  gameId: number;
  attemptNumber: number;
  guess: string;
  hint: Hint;
  statusAfterGuess: GameStatus;
  remainingAttempts: number;
}

export interface GameRecord {
  ownerId: string;
  secretCode: string;
  game: Game;
}
