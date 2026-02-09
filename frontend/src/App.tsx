import { useEffect, useMemo, useState } from "react";
import { createGame, fetchGame, submitGuess } from "./api";
import type { Game, GuessResult, Hint } from "./types";
import "./styles.css";

const COLOR_OPTIONS = [
  { id: "1", label: "Blue" },
  { id: "2", label: "Red" },
  { id: "3", label: "White" },
  { id: "4", label: "Black" },
  { id: "5", label: "Yellow" },
  { id: "6", label: "Green" }
];

const DEFAULT_CODE_LENGTH = 4;
const DEFAULT_MAX_ATTEMPTS = 10;

type PegValue = string | null;

type HintPegState = "exact" | "color" | "empty";

function buildHintPegs(hint: Hint | undefined, length: number): HintPegState[] {
  if (!hint) {
    return Array.from({ length }, () => "empty");
  }

  const pegs: HintPegState[] = [];
  for (let i = 0; i < hint.exact; i += 1) {
    pegs.push("exact");
  }
  for (let i = 0; i < hint.colorOnly; i += 1) {
    pegs.push("color");
  }
  while (pegs.length < length) {
    pegs.push("empty");
  }
  return pegs.slice(0, length);
}

function guessToPegs(guess: string, length: number): PegValue[] {
  return Array.from({ length }, (_, index) => guess[index] ?? null);
}

export default function App() {
  const [game, setGame] = useState<Game | null>(null);
  const [currentGuess, setCurrentGuess] = useState<PegValue[]>(
    Array.from({ length: DEFAULT_CODE_LENGTH }, () => null)
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [result, setResult] = useState<GuessResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const codeLength = game?.codeLength ?? DEFAULT_CODE_LENGTH;
  const maxAttempts = game?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  const remainingAttempts = useMemo(() => {
    if (!game) return null;
    return game.maxAttempts - game.attemptsUsed;
  }, [game]);

  const guessesByAttempt = useMemo(() => {
    if (!game) return new Map<number, Game["guesses"][number]>();
    return new Map(game.guesses.map((guess) => [guess.attemptNumber, guess]));
  }, [game]);

  const boardRows = useMemo(
    () => Array.from({ length: maxAttempts }, (_, index) => maxAttempts - index),
    [maxAttempts]
  );

  const activeAttempt = game && game.status === "active" ? game.attemptsUsed + 1 : null;
  const isGuessComplete = currentGuess.every(Boolean);
  const canSubmit = Boolean(game && game.status === "active" && isGuessComplete && !isLoading);
  const canResetRow = Boolean(
    game && game.status === "active" && game.attemptsUsed > 0 && game.guesses.length > 0
  );

  useEffect(() => {
    if (!game) return;
    setCurrentGuess(Array.from({ length: game.codeLength }, () => null));
  }, [game?.id, game?.codeLength]);

  const handleStartGame = async () => {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      const newGame = await createGame();
      setGame(newGame);
      setResult(null);
      setCurrentGuess(Array.from({ length: newGame.codeLength }, () => null));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to start game.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitGuess = async () => {
    if (!game || game.status !== "active") return;

    if (!isGuessComplete) {
      setStatusMessage("Choose four colors in order before submitting.");
      return;
    }

    const guessDigits = currentGuess.map((peg) => peg ?? "").join("");

    setIsLoading(true);
    setStatusMessage(null);
    try {
      const guessResult = await submitGuess(game.id, guessDigits);
      const updatedGame = await fetchGame(game.id);
      setResult(guessResult);
      setGame(updatedGame);
      setCurrentGuess(guessToPegs(guessResult.guess, updatedGame.codeLength));
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to submit guess.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetRow = () => {
    if (!game) return;
    if (game.attemptsUsed > 0 && game.guesses.length > 0) {
      const previous = game.guesses[game.guesses.length - 1];
      setCurrentGuess(guessToPegs(previous.guess, codeLength));
    }
    setStatusMessage(null);
  };

  const colorOrder = COLOR_OPTIONS.map((option) => option.id);

  const getNextColor = (value: PegValue): PegValue => {
    if (colorOrder.length === 0) return value;
    if (!value) {
      return colorOrder[0];
    }
    const currentIndex = colorOrder.indexOf(value);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + 1) % colorOrder.length;
    return colorOrder[nextIndex];
  };

  const handlePegClick = (index: number) => {
    if (!game || game.status !== "active") return;
    setCurrentGuess((prev) => {
      const next = [...prev];
      next[index] = getNextColor(prev[index]);
      return next;
    });
  };

  return (
    <div className="app">
      <header className="hero">
        <p className="eyebrow">Code Breakers</p>
        <h1>Crack the hidden color code</h1>
        <p className="subtitle">
          Select four colors in order. Duplicates allowed. You have {maxAttempts} attempts.
        </p>
      </header>

      <div className="layout">
        <section className="panel board">
          <div className="board-header">
            <div>
              <h2>Board</h2>
              <p>Fill the highlighted row, then submit your guess.</p>
            </div>
            {game && <span className={`status-chip status-${game.status}`}>{game.status}</span>}
          </div>

          {game ? (
            <div className="board-grid">
              {boardRows.map((attemptNumber) => {
                const entry = guessesByAttempt.get(attemptNumber);
                const isActive = attemptNumber === activeAttempt;
                const pegValues = entry
                  ? guessToPegs(entry.guess, codeLength)
                  : isActive
                  ? currentGuess
                  : Array.from({ length: codeLength }, () => null);
                const hintPegs = buildHintPegs(entry?.hint, codeLength);

                return (
                  <div
                    key={attemptNumber}
                    className={`board-row${isActive ? " active" : ""}${entry ? " filled" : ""}`}
                  >
                    <div className="row-index">{attemptNumber}</div>
                    <div className="row-pegs">
                      {pegValues.map((peg, index) => (
                        <button
                          key={`${attemptNumber}-${index}`}
                          type="button"
                          className={`peg ${peg ? `color-${peg}` : "empty"}`}
                          aria-label={
                            peg
                              ? `Color ${peg} in slot ${index + 1}`
                              : `Empty slot ${index + 1}`
                          }
                          onClick={() => handlePegClick(index)}
                          disabled={!isActive || !game || game.status !== "active"}
                        />
                      ))}
                    </div>
                    <div className="row-hints" aria-label="Hint pegs">
                      {hintPegs.map((state, index) => (
                        <span key={`${attemptNumber}-hint-${index}`} className={`hint-peg ${state}`} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty-board">
              <p>Start a game to reveal the board.</p>
            </div>
          )}

          <div className="board-actions">
            {canResetRow && (
              <button type="button" className="ghost" onClick={handleResetRow}>
                Reset row
              </button>
            )}
            <button type="button" onClick={handleSubmitGuess} disabled={!canSubmit}>
              Submit guess
            </button>
          </div>
        </section>

        <section className="panel controls">
          <div className="panel-header">
            <h2>Control Desk</h2>
            <button type="button" onClick={handleStartGame} disabled={isLoading}>
              Start new game
            </button>
          </div>

          {game ? (
            <div className="meta-grid">
              <div>
                <span>Status</span>
                <strong>{game.status}</strong>
              </div>
              <div>
                <span>Attempts used</span>
                <strong>{game.attemptsUsed}</strong>
              </div>
              <div>
                <span>Remaining</span>
                <strong>{remainingAttempts}</strong>
              </div>
            </div>
          ) : (
            <p className="empty-state">Start a game to begin guessing.</p>
          )}

          <div className="helper-card">
            <h3>How to play</h3>
            <p>Tap any slot in the active row to cycle through the six colors.</p>
            <p>Once a slot has a color, it never returns to empty.</p>
            <p>Each new row starts with your previous guess for quick tweaks.</p>
          </div>

          {statusMessage && <p className="status-message">{statusMessage}</p>}

          {result && (
            <div className="result-card">
              <h3>Latest result</h3>
              <div className="result-grid">
                <div>
                  <span>Exact</span>
                  <strong>{result.hint.exact}</strong>
                </div>
                <div>
                  <span>Color only</span>
                  <strong>{result.hint.colorOnly}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="hint-legend">
            <div className="hint-legend-title">Hint pegs</div>
            <p className="hint-legend-note">
              Each row shows how close your guess is. Pegs do not map to specific positions.
            </p>
            <div>
              <span className="hint-peg exact" />
              Exact color + position
            </div>
            <div>
              <span className="hint-peg color" />
              Correct color, wrong spot
            </div>
          </div>

          <div className="color-legend">
            <div className="color-legend-title">Colors</div>
            <div className="color-legend-grid">
              {COLOR_OPTIONS.map((color) => (
                <div key={color.id} className="color-legend-item">
                  <span className={`swatch color-${color.id}`} aria-hidden="true" />
                  <span>{color.label}</span>
                </div>
              ))}
            </div>
          </div>

          {game?.status === "lost" && game.revealedCode && (
            <div className="secret-reveal">
              <div className="secret-title">Secret code</div>
              <div className="secret-pegs" aria-label="Secret code">
                {guessToPegs(game.revealedCode, codeLength).map((peg, index) => (
                  <span
                    key={`secret-${index}`}
                    className={`peg ${peg ? `color-${peg}` : "empty"}`}
                    aria-label={peg ? `Color ${peg}` : "Empty"}
                  />
                ))}
              </div>
              <p className="secret-note">Game over. The hidden code is revealed above.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
