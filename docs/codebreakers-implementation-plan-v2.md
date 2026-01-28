# Codebreakers API Example - Implementation Plan (handoff)

## 1) Summary

Build a small, user-authenticated Mastermind-style game API ("Codebreakers") intended for Kong examples.

Players start a game, then submit guesses to break a hidden code. The server returns a hint after each guess:

- **exact**: correct symbol in the correct position
- **colorOnly**: correct symbol but in the wrong position

Primary demo goals:

- Demonstrate **OIDC-authenticated, identity-bound gameplay** (game ownership)
- Keep the **OpenAPI spec minimal** and easy to grok
- Provide clean surfaces for Kong examples: auth (OIDC), consumer identity (`X-Consumer-Username`), per-consumer rate limiting


## 2) Decisions (locked in)

These are the assumptions the implementation must follow:

1. **Auth**: OIDC at the gateway (Kong handles authentication).
2. **Upstream trust model**: upstream service trusts Kong-injected headers, does not validate JWT/OIDC.
3. **User identity header**: `X-Consumer-Username` is the canonical user id in the upstream.
4. **Cross-user access**: accessing another user’s `gameId` must return **404**.
5. **Routes**: keep the API to **3 routes** (see OpenAPI skeleton).
6. **Persistence**: in-memory by default; keep design open to external store via a small storage interface.
7. **IDs**: use simple integer ids (monotonic counter).
8. **Local dev**: support running the upstream without Kong via a dev auth mode.


## 3) Scope and constraints

### MVP routes (exactly three)

1) `POST /games` - start a new game  
2) `GET /games/{gameId}` - fetch game + guess history (simplest for the spec)  
3) `POST /games/{gameId}/guesses` - submit a guess and receive a hint  

Optional endpoint not documented in OpenAPI:
- `GET /healthz` for container health checks

### Fixed game rules (keep fixed to keep spec small)

- Code length: **4**
- Allowed symbols: **"1".."6"**
- Duplicates allowed: **yes**
- Max attempts: **10**
- Game status: `active | won | lost`


## 4) Kong / identity integration

### 4.1 Consumer mapping → `X-Consumer-Username`

Configure Kong’s OpenID Connect plugin with **Consumer authorization** so that authenticated users map to a Kong Consumer (by username), and Kong will add Consumer identity headers upstream.

Recommended mapping:
- `consumer_claim`: `preferred_username` (or another stable claim your IdP provides)
- `consumer_by`: `username`

The upstream service will use only:

- `X-Consumer-Username: <string>`

as the user identity, and bind all games to it.

### 4.2 Upstream auth behavior

The upstream must enforce:

- If `X-Consumer-Username` is missing, return **401** (when auth is enabled).
- All resources are owned by `X-Consumer-Username`.
- If a game exists but owner does not match, return **404** (do not leak existence).


## 5) Local development without Kong (dev auth mode)

Implement a local mode that bypasses Kong:

- Env var: `AUTH_MODE=dev`
- In dev mode, accept user id from `X-Demo-User` header (string).
- In dev mode:
  - If `X-Demo-User` missing → return 401.
  - Ignore `X-Consumer-Username` (or treat it as equivalent).

This allows curl-based local testing without running Kong/Keycloak.

In normal mode (`AUTH_MODE` unset or `AUTH_MODE=kong`):
- ignore `X-Demo-User`
- require `X-Consumer-Username`


## 6) Data model

### 6.1 Game

Store:

- `id` (int)
- `owner` (string; from `X-Consumer-Username` or `X-Demo-User` in dev)
- `status` (`active | won | lost`)
- `secret` (string length 4, symbols 1-6) **never returned**
- `attemptsUsed` (int)
- `maxAttempts` (int, constant 10)
- `createdAt`, `updatedAt` (timestamps)

### 6.2 Guess

Store:

- `attemptNumber` (int, 1..10)
- `guess` (string pattern `^[1-6]{4}$`)
- `exact` (int)
- `colorOnly` (int)
- `createdAt`

Implementation note: you do not need a separate guess id in MVP.

### 6.3 Storage interface (keep open to external store)

Even if using in-memory maps, wrap with an interface so moving to SQLite/Postgres later is easy:

- `CreateGame(owner) -> Game`
- `GetGame(owner, gameId) -> Game + guesses` (must enforce owner)
- `AddGuess(owner, gameId, guess) -> GuessResult + updated game state`

In-memory implementation:
- `nextGameId` atomic counter
- `gamesById: map[int]Game`
- `guessesByGameId: map[int][]Guess`


## 7) Core game logic (hint computation)

### Definitions

- `secret`: hidden code, e.g. `"1266"`
- `guess`: player guess, e.g. `"1662"`
- `exact`: positions i where `guess[i] == secret[i]`
- `colorOnly`: correct symbols in wrong positions (account for duplicates)

### Correct algorithm (supports duplicates)

Two-pass method:

1) Compute exact matches and remove them from consideration.
2) Count remaining symbol occurrences in secret and guess.
3) `colorOnly = sum(min(countSecret[s], countGuess[s]) for each symbol s)`

### Pseudocode

```
function scoreGuess(secret, guess):
  exact = 0
  secretRemainder = []
  guessRemainder = []

  for i in 0..3:
    if guess[i] == secret[i]:
      exact += 1
    else:
      secretRemainder.append(secret[i])
      guessRemainder.append(guess[i])

  countsSecret = frequencyMap(secretRemainder)
  countsGuess  = frequencyMap(guessRemainder)

  colorOnly = 0
  for s in ["1","2","3","4","5","6"]:
    colorOnly += min(countsSecret.get(s, 0), countsGuess.get(s, 0))

  return { exact, colorOnly }
```

### Test vectors (must pass)

- secret "1234", guess "1234" => exact 4, colorOnly 0
- secret "1234", guess "4321" => exact 0, colorOnly 4
- secret "1122", guess "2211" => exact 0, colorOnly 4
- secret "1122", guess "1222" => exact 3, colorOnly 0
- secret "1266", guess "1662" => exact 1, colorOnly 3  (tricky duplicate case; verify)


## 8) API behavior requirements

### 8.1 Create game (`POST /games`)

- Create a secret code (random; use secure RNG if available)
- Persist a new game owned by the caller
- Return the created Game resource (without secret)
- `attemptsUsed` starts at 0
- `guesses` starts empty

### 8.2 Get game (`GET /games/{gameId}`)

- Validate `gameId` is integer
- Return **404** if:
  - game not found, OR
  - game exists but owned by another user
- Return the Game resource including guess history

### 8.3 Submit guess (`POST /games/{gameId}/guesses`)

- Validate guess string matches `^[1-6]{4}$`
  - Return **422** for invalid guess
- Enforce ownership:
  - Return **404** if not owned / not found
- Enforce status:
  - If `won` or `lost` → return **409**
- Compute hint, append guess, increment attempts
- Update status:
  - If `exact == 4` → `won`
  - Else if attemptsUsed reaches 10 → `lost`

Response must include:
- attemptNumber
- hint
- statusAfterGuess
- remainingAttempts

### 8.4 Error model (consistent JSON)

```
{
  "code": "machine_readable",
  "message": "human readable",
  "requestId": "optional"
}
```

Suggested codes:
- `unauthorized`
- `not_found`
- `game_finished`
- `invalid_guess`
- `rate_limited`


## 9) Kong demo hooks (recommended)

- Rate limit only the guess endpoint: `POST /games/{gameId}/guesses`
- Apply rate limiting per Consumer (works naturally with Consumer mapping)
- Optionally echo a request id back in errors (for debugging / tracing demos)


## 10) Deliverables for the implementation agent

Repository should include:

- `api/openapi.yaml` (use the provided skeleton file)
- `README.md` with:
  - local dev instructions (`AUTH_MODE=dev`, `X-Demo-User`)
  - Kong + IdP (Keycloak) instructions for OIDC + Consumer authorization
  - curl examples for the 3 routes
- Unit tests:
  - scoring logic tests (critical)
- Minimal in-memory store + store interface for future persistence
