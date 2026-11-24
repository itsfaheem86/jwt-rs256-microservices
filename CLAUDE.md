# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Where the decisions come from

- `plan.md` is the spec: the behaviour contract (section 6), the test plan (section 9), and the acceptance criteria (section 12). When code and plan disagree, change one of them in the same change. The test counts in the plan (71 unit, 14 e2e, 6 cluster) must match the suites.
- The services follow `C:\Users\user\Desktop\Personal\MD\architecture\backend-express.md`, trimmed to what this demo needs. The user chose this trim. Keep it trimmed.
- Deliberate departures from the doc: RS256, not ES256. No Prisma, PostgreSQL, Redis, SQS, bcrypt, pino or helmet. An in-memory refresh store. Routes without the `/api/v1` prefix. Plain error bodies such as `{ "error": "invalid_credentials" }`, not the doc's envelope. Do not add the dropped pieces back without asking.
- Do not change the RS256 pin, the issuer and audience checks, or the reuse-revokes-family logic to make a test pass.

## Commands

```
npm install
npm run test:unit                                              # unit layer: services/**/*.spec.ts, fakes for collaborators
npm run test:e2e                                               # e2e layer: test/e2e/*.e2e.spec.ts, both services over HTTP
npm test                                                       # both layers (Jest projects "unit" and "e2e")
npx jest services/auth/src/modules/auth/auth.service.spec.ts   # one file
npx jest -t "reuse"                                            # tests whose name matches
npm run typecheck                                              # tsc --noEmit over services, test and scripts
npm run build                                                  # tsc to dist/ (services only, no specs)
npm run keygen                                                 # keys/ (gitignored); add -- --force to overwrite
npm run dev:auth | dev:resource                                # tsx watch
npm run e2e:k8s                                                # kind cluster plus in-cluster e2e; needs Docker, kind, kubectl
npm run test:cluster                                           # needs E2E_AUTH_URL and E2E_RESOURCE_URL set
```

Set `E2E_KEEP_CLUSTER=1` before `npm run e2e:k8s` to keep the cluster afterwards. The script deletes it otherwise.

## Architecture

Two Express apps in one package, one folder per service under `services/`. Each follows the doc's layers: routes, then controller, then service, then repository. Services throw `AppError(status, body)`, and `common/middleware/error-handler.ts` sends it.

- `services/auth` is the issuer. `common/auth/issue.ts` reads `private.pem` from `AUTH_KEY_DIR` when the module loads, so a missing key stops the process before it listens. `modules/auth/auth.service.ts` holds the rotation rules. `auth.repository.ts` is the in-memory store, keyed by SHA-256 of the refresh token.
- `services/resource` is a verifier. `common/auth/verify.ts` pins `RS256` and checks issuer and audience. It gets only `PUBLIC_KEY_PATH`. Nothing under `services/resource` may import `services/auth`. The one exception is `verify.spec.ts`, which mints test tokens.
- Refresh rotation lives in `refresh()` in `auth.service.ts`. The check order matters: unknown, then revoked, then used (which revokes the family), then expired, then rotate. Access tokens are stateless, so they stay valid until `exp` even after logout. The e2e tests assert this on purpose.

## Tests

- `test/helpers/setup.ts` is a Jest `setupFiles` entry for both projects. It creates a temp key pair and sets `AUTH_KEY_DIR` before each test file loads its imports. Keep it that way: importing `issue.ts` before the setup runs reads the wrong key path.
- Unit specs sit beside the code. The auth service spec replaces `auth.repository` with an in-memory fake through `jest.mock`. Route specs mock `auth.service` or pass a stub verifier. `test/helpers/fakes.ts` (request/response doubles) and `test/helpers/http.ts` (serve one router on a random port) support them.
- The resource verifier spec creates its own key pairs and must never import `services/auth`. That keeps it a true unit of the resource service.
- `test/e2e/support/stack.ts` starts both apps with `http.createServer` on port 0. Each `test/e2e/*.e2e.spec.ts` file is one user journey (sign-in, resource-access, refresh-rotation, logout) and uses that helper.
- `test/cluster/` is black-box HTTP only. It has its own Jest config (`jest.cluster.config.ts`) with no setup file, because it never needs keys.

## Kubernetes and images

- One Dockerfile with four stages: `deps`, `build`, `runtime` and `tests`. `runtime` has production dependencies and `dist/` only, so it holds no keys and no test code. `tests` has everything and runs the cluster Jest config.
- `scripts/e2e-k8s.ts` builds both images, generates a fresh key pair into a temp directory, and creates the Secret `jwt-auth-keys` (private key, mounted only into `auth`) and the ConfigMap `jwt-public-key` (public key, mounted only into `resource`).
- `auth` runs at `replicas: 1`. Refresh-token records live in process memory, so a second replica would not see them. `resource` runs at 2.
- The Job `jwt-e2e` uses `jwt-demo:tests` and calls `http://auth:3001` and `http://resource:3002`. The script deletes and re-applies it on every run, because Job specs are immutable.
- The script pins kubectl to the context `kind-jwt-demo` and restarts both Deployments on each run, so a reused cluster picks up new keys and images.

## Constraints

- TypeScript strict, `module: node16`, no `"type"` in `package.json`, so the build emits CommonJS.
- Runtime dependencies are `express`, `jsonwebtoken` and `zod`. Do not add a database client, Redis, or a logger without asking.
- README prose must have no em dashes and no hyphen sentence breaks, per `plan.md`.

## Gotchas

- `env.ts` reads `process.env` when the module loads. Set variables before importing, or the defaults win.
- The key directory default is `keys`, relative to the working directory, for both `keygen` and `AUTH_KEY_DIR`. They agree from any directory.
- Windows: `pkill` is not available, and PowerShell needs `$env:NAME = "value"` rather than the `NAME=value cmd` form.
