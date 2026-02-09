import type { Hint } from "./types.js";

const SYMBOLS = ["1", "2", "3", "4", "5", "6"];
const CODE_LENGTH = 4;

export const GAME_RULES = {
  symbols: SYMBOLS,
  codeLength: CODE_LENGTH,
  maxAttempts: 10
};

export function generateSecretCode(): string {
  const choices = [] as string[];
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * SYMBOLS.length);
    choices.push(SYMBOLS[index]);
  }
  return choices.join("");
}

export function scoreGuess(secret: string, guess: string): Hint {
  let exact = 0;
  const secretCounts = new Map<string, number>();
  const guessCounts = new Map<string, number>();

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const secretSymbol = secret[i];
    const guessSymbol = guess[i];

    if (secretSymbol === guessSymbol) {
      exact += 1;
    } else {
      secretCounts.set(secretSymbol, (secretCounts.get(secretSymbol) ?? 0) + 1);
      guessCounts.set(guessSymbol, (guessCounts.get(guessSymbol) ?? 0) + 1);
    }
  }

  let colorOnly = 0;
  for (const [symbol, guessCount] of guessCounts.entries()) {
    const secretCount = secretCounts.get(symbol) ?? 0;
    colorOnly += Math.min(secretCount, guessCount);
  }

  return { exact, colorOnly };
}
