# Plan: JWT RS256 demo

This plan describes the project as it is built. It is the source for recreating the repo from nothing, and for judging a change. If code and plan disagree, change the code or change this file in the same commit.

The first version of this plan (CommonJS, `node:test`, no framework) is superseded. It remains in the git index as the staged blob of `plan.md`.

## 1. Goal

Show why microservices should verify RS256 access tokens with a public key, not a shared HS256 secret. Show how refresh tokens are rotated: opaque, stored as hashes, single use, and revoked by family when reused.

Two services:

- **auth** issues tokens. It holds the private key.
- **resource** verifies tokens. It holds only the public key and cannot mint one.

One command runs the end-to-end tests inside a local Kubernetes cluster.

## 2. Scope

In scope: sign-in, token issue, refresh rotation with reuse detection, logout, the resource endpoint, unit, end-to-end and in-cluster tests, Docker images, Kubernetes manifests, and the one-command run.

Out of scope: a database, Redis, message queues, HTTPS, cookies, real password storage, a JWKS endpoint, multi-tenancy, and any UI. Section 13 lists these as known gaps.

## 3. Fixed decisions

| Area | Decision | Reason |
| --- | --- | --- |
| Language | TypeScript, `strict`, `module: node16`, CommonJS output | Matches the architecture doc. No `"type"` in `package.json` |
| HTTP | Express 5 | Architecture doc. Rejected promises reach the error handler |
| Validation | zod 4 | Environment variables and the login body |
| Tokens | jsonwebtoken 9 | Signing and verification. The algorithm is pinned to RS256 |
| Algorithm | RS256, RSA 2048 | The point of the demo. The doc's ES256 is rejected by choice |
| Access token | 5 minutes | Short enough that stateless revocation is acceptable |
| Refresh token | 7 days, 32 random bytes, base64url | Opaque. Stored only as SHA-256 |
| Refresh storage | In-memory `Map` | No database in scope. Forces the auth service to one replica |
| Passwords | Plain text in one demo user | Demo only. Section 13 says what production needs |
| Routes | No `/api/v1` prefix | Keeps the contract short. Doc prefix is a known deviation |
| Error bodies | `{ "error": "<code>" }` | Simple contract. Doc envelope is a known deviation |
| Test runner | Jest 30 with ts-jest 29, `fetch` for HTTP | Doc uses Jest. `supertest` dropped because `fetch` covers it |
| Package manager | npm | Lockfile needed by the Dockerfile |
| Runtime dependencies | `express`, `jsonwebtoken`, `zod` | Nothing else. No database, Redis, logger or security middleware |

## 4. Sources

- Architecture: `C:\Users\user\Desktop\Personal\MD\architecture\backend-express.md`. Used for layers, folder layout, `AppError`, startup config checks, probes, and test layering.
- Infrastructure: `C:\Users\user\Desktop\Personal\MD\architecture\infrastructure.md`, section 6. Used for Kubernetes conventions: non-root, `seccompProfile`, dropped capabilities, read-only root filesystem, resource requests and limits, `secretKeyRef` and ConfigMap separation.

What was adopted, and what was dropped, is in section 13.

## 5. Repository layout

```
package.json, package-lock.json      npm, Node 22+
tsconfig.json                        type check and tests (includes services, test, scripts)
tsconfig.build.json                  build: services only, specs excluded, output in dist/
jest.config.ts                       two projects: unit and e2e
jest.cluster.config.ts               in-cluster tests only
Dockerfile, .dockerignore            four stages: deps, build, runtime, tests
.gitignore                           keys/, node_modules/, dist/
README.md                            for people running the demo
CLAUDE.md                            for Claude Code sessions in this repo
plan.md                              this file

services/auth/src/                   the issuer
  app.ts                             createApp(): no listen
  server.ts                          listens; SIGTERM and SIGINT shut down
  routes.ts                          mounts /api health and the auth router
  common/
    config/env.ts                    zod schema; throws at import if invalid
    config/constants.ts              ACCESS_TTL, REFRESH_TTL_MS
    errors.ts                        AppError(statusCode, body, headers)
    health.ts                        GET /api/health
    auth/keys.ts                     kidFor, generateKeys, readPrivateKey
    auth/issue.ts                    loads the key at import; publicKey, KID, issueAccessToken
    auth/hash.ts                     sha256
    middleware/validate.ts           zod body check; parsed output to res.locals.validated
    middleware/error-handler.ts      AppError, body-parser errors, 500 without detail
    middleware/not-found.ts          404 not_found
  modules/auth/
    auth.routes.ts                   POST /login, /refresh, /logout
    auth.controller.ts               reads input, calls the service, sets the status
    auth.service.ts                  sign-in, rotation, reuse detection, logout
    auth.repository.ts               demo users; refresh records in memory
    auth.schema.ts                   login body schema

services/resource/src/              the verifier
  app.ts                             createApp(publicKey): no listen
  server.ts                          reads PUBLIC_KEY_PATH; refuses to start without it
  routes.ts                          /api health and /api me
  common/
    config/env.ts
    errors.ts, health.ts
    auth/verify.ts                   createAccessTokenVerifier(publicKey), RS256 pinned
    middleware/authenticate.ts       Bearer parsing; claims to res.locals.user
    middleware/error-handler.ts, not-found.ts
  modules/me/
    me.routes.ts, me.controller.ts   GET /me, mounted under /api

scripts/keygen.ts                    npm run keygen
scripts/e2e-k8s.ts                   npm run e2e:k8s

test/helpers/keys.ts                 useTempKeys(): temp key pair, sets AUTH_KEY_DIR
test/helpers/setup.ts                Jest setupFiles for both projects
test/helpers/fakes.ts                fake Express response; captureThrown
test/helpers/http.ts                 listenApp(app): one router on a random port
test/e2e/support/stack.ts            startStack(), signIn(), callMe(), tamperPayload()
test/e2e/*.e2e.spec.ts               four user journeys
test/cluster/flow.cluster.spec.ts    in-cluster black-box tests

k8s/namespace.yaml                   namespace jwt-demo
k8s/auth.yaml                        Deployment (1 replica) and Service auth:3001
k8s/resource.yaml                    Deployment (2 replicas) and Service resource:3002
k8s/e2e-job.yaml                     Job jwt-e2e: runs the cluster tests
```

Each service folder follows the layering in section 6. Feature code and its specs sit together under `modules/`. Code shared by features sits under `common/`.

## 6. Behaviour contract

This section is the contract the tests check. Change it only with a change to the tests.

### 6.1 Auth service (port 3001)

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /login` | `{ username, password }` | 200 `{ accessToken, refreshToken }`. 401 `{ error: "invalid_credentials" }` for an unknown user and for a wrong password alike. 400 `{ error: "bad_request" }` for missing fields or malformed JSON |
| `POST /refresh` | `{ refreshToken }` | 200 `{ accessToken, refreshToken }`. 401 `{ error: <reason> }` with one of the reasons in 6.3. An empty body or a non-string token gives 401 `invalid refresh token` |
| `POST /logout` | `{ refreshToken }` | 204, empty body. Always 204: an unknown or missing token is not an error |
| `GET /api/health` | none | 200 `{ status: "ok" }` |

Any other route: 404 `{ error: "not_found" }`. A body over 1 MB: 413 `{ error: "payload_too_large" }`. An unexpected error: 500 `{ error: "internal_error" }`, with no message or stack in the body.

### 6.2 Resource service (port 3002)

| Method and path | Request | Response |
| --- | --- | --- |
| `GET /api/me` | `Authorization: Bearer <access token>` | 200 `{ sub, roles }` from the verified claims |
| `GET /api/health` | none | 200 `{ status: "ok" }` |

401 `{ error: "missing_token" }` with `WWW-Authenticate: Bearer` when the header is absent, not a Bearer scheme, or has an empty token.

401 `{ error: "invalid_token", reason: <message> }` with `WWW-Authenticate: Bearer error="invalid_token"` when verification fails. The reason is the `jsonwebtoken` message, such as `invalid signature`, `invalid algorithm`, `jwt expired`, `jwt audience invalid`, or `jwt issuer invalid`.

Any other route: 404 `{ error: "not_found" }`.

### 6.3 Access and refresh tokens

Access token:

- Signed RS256 with the private key. Header `kid` equals the key's `KID`.
- Claims: `sub` (user id), `roles`, `iss` (`JWT_ISSUER`), `aud` (`JWT_AUDIENCE`), `iat`, `exp = iat + 300`.
- Stateless. The resource service checks only the signature, the algorithm, the issuer, the audience and the expiry.

Refresh token:

- 32 random bytes, base64url. The client receives the raw value. The server keeps only its SHA-256 hex digest, as the key of a record.
- Record: `{ user: { id, roles }, familyId, expiresAt, used, revoked }`. `expiresAt` is 7 days after issue.
- Each login starts a new `familyId` (UUID). Each rotation keeps the same `familyId`.

Refresh algorithm. Checks run in this order:

1. No record for the token's hash: `invalid refresh token`.
2. Record is revoked: `refresh token revoked`.
3. Record is used: revoke every record in the family, then `refresh token reuse detected`.
4. `expiresAt` is in the past: `refresh token expired`.
5. Otherwise mark the record used. Return a new access token and a new refresh token in the same family.

Logout: revoke every record in the token's family. Other sessions are unaffected, because they have other families.

### 6.4 Keys

- `npm run keygen [dir] [--force]` writes `private.pem` (PKCS8) and `public.pem` (SPKI) into `dir`, default `keys/`. It refuses to overwrite unless `--force` is given. Prints three lines: the private path, the public path, and `kid: <value>`. Exit code 1 on error.
- `kid` = first 16 characters of base64url(SHA-256(public PEM)).
- The auth service reads `AUTH_KEY_DIR/private.pem` when its module loads. A missing key throws `Private key not found at ... Run: npm run keygen`.
- The resource service reads `PUBLIC_KEY_PATH` in `server.ts`. Missing: it refuses to start.

## 7. Configuration

| Variable | Service | Default | Notes |
| --- | --- | --- | --- |
| `PORT` | both | 3001 auth, 3002 resource | Positive integer |
| `NODE_ENV` | both | `development` | One of `development`, `test`, `production` |
| `JWT_ISSUER` | both | `https://auth.example.com` | Must match on both sides |
| `JWT_AUDIENCE` | both | `api.example.com` | Must match on both sides |
| `AUTH_KEY_DIR` | auth | `keys` | Relative paths resolve from the working directory |
| `PUBLIC_KEY_PATH` | resource | none | Required by `server.ts` |

An invalid value throws `Invalid environment configuration: <NAME>` when the module loads, before anything listens.

## 8. Building from nothing

Follow these steps in order. Each one ends with a check.

1. **Scaffold.** Create `package.json` with `"private": true`, `"engines": { "node": ">=22" }` and the scripts in section 12. Add `tsconfig.json`, `tsconfig.build.json`, `jest.config.ts`, `jest.cluster.config.ts`, `.gitignore` and `.dockerignore`.
   *Check:* the files exist and parse.
2. **Install.** `npm install express@^5 zod@^4 jsonwebtoken@^9`. `npm install -D typescript@~5.9 tsx jest@^30 ts-jest@^29 ts-node @types/jest @types/express @types/jsonwebtoken @types/node`.
   *Check:* `package-lock.json` exists. `ts-node` is needed because Jest loads `jest.config.ts` through it.
3. **Key code.** Write `services/auth/src/common/auth/keys.ts`: `kidFor`, `generateKeys`, `readPrivateKey`. Write `scripts/keygen.ts` as a thin CLI over it.
   *Check:* `npm run keygen -- <tmp>` prints three lines. A second run without `--force` exits 1.
4. **Auth service.** In this order: `env.ts`, `constants.ts`, `errors.ts`, `issue.ts`, `hash.ts`, `auth.repository.ts`, `auth.service.ts`, `auth.schema.ts`, `auth.controller.ts`, `auth.routes.ts`, the middleware, `health.ts`, `routes.ts`, `app.ts`, `server.ts`.
   *Check:* `npm run typecheck` passes.
5. **Resource service.** In this order: `env.ts`, `errors.ts`, `verify.ts`, `authenticate.ts`, the middleware, `health.ts`, `me.controller.ts`, `me.routes.ts`, `routes.ts`, `app.ts`, `server.ts`.
   *Check:* the resource code imports nothing from `services/auth`.
6. **Unit tests.** Write the specs in section 9.1 beside the code. Put the fakes and helpers under `test/helpers/`.
   *Check:* `npm run test:unit` passes.
7. **End-to-end tests.** Write `test/e2e/support/stack.ts`, then the four journey files in section 9.2.
   *Check:* `npm run test:e2e` passes.
8. **Build.** `npm run build` writes `dist/services/*/src/*.js`, with no spec files.
   *Check:* `node dist/services/auth/src/server.js` starts and logs its port.
9. **Container.** Write the Dockerfile with four stages (section 10.1).
   *Check:* `docker build --target runtime` and `--target tests` both succeed.
10. **Cluster.** Write the manifests in section 10.2 and `scripts/e2e-k8s.ts`. Write `test/cluster/flow.cluster.spec.ts`.
    *Check:* `npm run e2e:k8s` exits 0 and prints `E2E passed`.
11. **Docs.** Write `README.md` for people running the demo and `CLAUDE.md` for Claude Code sessions.
    *Check:* README prose has no em dashes and no hyphen sentence breaks (section 14).

## 9. Test plan

Two layers run locally, plus one layer that runs in the cluster. Each has its own command. The rule for every layer: a test passes only when it checks a behaviour from section 6.

### 9.1 Unit layer (`npm run test:unit`)

Specs sit beside the code they test. Each unit replaces its collaborators with fakes or mocks. No unit reaches the other service. Jest project `unit`, roots `services/`, pattern `*.spec.ts`.

| File | Tests | What it covers |
| --- | --- | --- |
| `auth/common/auth/hash.spec.ts` | 2 | SHA-256 test vector; hex output |
| `auth/common/auth/keys.spec.ts` | 8 | `kidFor` shape and determinism; `generateKeys` writes PEM files, refuses to overwrite, forces, creates directories; `readPrivateKey` missing-key message |
| `auth/common/auth/issue.spec.ts` | 3 | RS256 header and kid; `iss`, `aud`; `exp - iat = 300`; verifies with the public key |
| `auth/common/config/env.spec.ts` | 5 | Defaults; number coercion; invalid `PORT` and `NODE_ENV` named in the error; zero rejected |
| `auth/common/middleware/validate.spec.ts` | 3 | Parsed output in `res.locals`; unknown fields stripped; invalid input gives 400 without calling `next` |
| `auth/common/middleware/error-handler.spec.ts` | 6 | `AppError` status, headers, body; 413 and 400 parser errors; 500 leaks no detail; logging; passes on after headers sent |
| `auth/modules/auth/auth.service.spec.ts` | 15 | Repository is a fake. Sign-in success and failures, identical unknown-user and wrong-password errors; hashes stored, not raw tokens; rotation; single use; reuse revokes the family; logout revokes the family; unknown, missing and expired tokens; session isolation |
| `auth/modules/auth/auth.routes.spec.ts` | 10 | HTTP on a random port. Service mocked. Status codes, body shapes, pass-through of arguments, empty body, malformed JSON, 413, unknown route |
| `resource/common/auth/verify.spec.ts` | 10 | Own key pairs, never the auth service. Valid token; tampered payload; wrong key; HS256 with the public key; `alg none`; RS512; audience; issuer; expiry; malformed input |
| `resource/common/middleware/authenticate.spec.ts` | 5 | Missing, non-Bearer and empty headers give `missing_token`; refused token gives `invalid_token` with reason; valid token stored in `res.locals.user` |
| `resource/modules/me/me.routes.spec.ts` | 4 | HTTP on a random port, stub verifier. 200 claims; 401 both kinds with headers; method not routed |

Total: 71 tests in 11 files.

### 9.2 End-to-end layer (`npm run test:e2e`)

Both services start in one process on random ports, through `test/e2e/support/stack.ts`. Each file is one user journey. Jest project `e2e`, pattern `*.e2e.spec.ts`.

| File | Tests | Journey |
| --- | --- | --- |
| `sign-in.e2e.spec.ts` | 4 | Wrong password and unknown user give the same 401. Correct credentials give two tokens. Malformed JSON gives 400 |
| `resource-access.e2e.spec.ts` | 4 | A sign-in token is accepted. No token gives 401. A tampered payload gives 401. `not-a-jwt` gives 401 |
| `refresh-rotation.e2e.spec.ts` | 5 | Rotation issues a new refresh token and a working access token. The old access token still works (stateless trade-off). Reuse gives 401 and revokes the newer token. Empty body gives 401. Two concurrent refreshes: one wins, one fails, the winner's token is then revoked |
| `logout.e2e.spec.ts` | 1 | Logout gives 204; refresh afterwards gives 401 |

Total: 14 tests in 4 files.

The concurrency test sends both requests together, but one process handles them one at a time. A race between several auth instances is not covered, because there is one replica.

### 9.3 Cluster layer (`npm run test:cluster`, and inside `npm run e2e:k8s`)

`test/cluster/flow.cluster.spec.ts`. Black-box HTTP only. It reads `E2E_AUTH_URL` and `E2E_RESOURCE_URL`, and it never imports a service. Jest config `jest.cluster.config.ts` has no setup file, because it needs no keys.

Six tests: login returns two tokens; the resource service accepts a token the auth service minted; a tampered token gets 401 `invalid_token`; no token gets 401 `missing_token`; rotation and reuse revoke the family; logout then refresh gives 401.

## 10. Containers and cluster

### 10.1 Dockerfile

Four stages from one file:

| Stage | Base | Contents | Used by |
| --- | --- | --- | --- |
| `deps` | `node:22-alpine` | `npm ci` with all dependencies | `build`, `tests` |
| `build` | `deps` | `npm run build` over `services/` | `runtime` |
| `runtime` | `node:22-alpine` | `npm ci --omit=dev` and `dist/`. No keys, no tests | Image `jwt-demo:e2e` |
| `tests` | `deps` | Everything, including tests and Jest config. Runs the cluster Jest config | Image `jwt-demo:tests` |

Both images run as `USER node`. `.dockerignore` excludes `node_modules`, `dist`, `keys`, `*.pem`, `.git`, `k8s`, `scripts`, and the docs.

### 10.2 Kubernetes objects (namespace `jwt-demo`)

| Object | Kind | Details |
| --- | --- | --- |
| `jwt-auth-keys` | Secret | Created per run from the generated `private.pem`. Mounted only into `auth`, at `/etc/jwt/keys`, mode 0440 |
| `jwt-public-key` | ConfigMap | Created per run from the generated `public.pem`. Mounted only into `resource`, at `/etc/jwt/public` |
| `auth` | Deployment, 1 replica | Image `jwt-demo:e2e`, `node dist/services/auth/src/server.js`, `AUTH_KEY_DIR=/etc/jwt/keys`. Probes on `/api/health`. Requests 100m and 128Mi, limit 256Mi |
| `auth` | Service | Port 3001 |
| `resource` | Deployment, 2 replicas | Image `jwt-demo:e2e`, `node dist/services/resource/src/server.js`, `PUBLIC_KEY_PATH=/etc/jwt/public/public.pem`. No Secret mounted. Same probes and limits |
| `resource` | Service | Port 3002 |
| `jwt-e2e` | Job, `backoffLimit: 0` | Image `jwt-demo:tests`. Runs the cluster Jest config. Env `E2E_AUTH_URL=http://auth:3001`, `E2E_RESOURCE_URL=http://resource:3002`. `/tmp` is an emptyDir |

Security context for every pod: `runAsNonRoot`, UID and GID 1000, `seccompProfile: RuntimeDefault`. For every container: `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`.

### 10.3 `npm run e2e:k8s`

The script runs these steps in order, and stops at the first failure:

1. Check that `docker info`, `kind version` and `kubectl version --client` work.
2. Create the kind cluster `jwt-demo`, or reuse it if it exists.
3. Generate a key pair into a temp directory. The directory is removed at the end.
4. Build `jwt-demo:e2e` with `--target runtime`, and `jwt-demo:tests` with `--target tests`.
5. `kind load docker-image` for both images.
6. Apply the namespace. Create the Secret and the ConfigMap from the temp files, piping through `kubectl apply`.
7. Apply the `auth` and `resource` manifests. Restart both Deployments, so reused clusters pick up new keys and images. Wait for both rollouts.
8. Delete any old Job, apply `e2e-job.yaml`, and poll until it succeeds or fails. Print the Job's logs.
9. On failure: print pods and the last 50 log lines of each Deployment, then fail.
10. Always: delete the temp keys. Delete the cluster, unless `E2E_KEEP_CLUSTER=1`.

kubectl always runs with `--context kind-jwt-demo`, so the script never touches another cluster.

## 11. Security rules

These must hold. A change that breaks one is a bug, even if every test passes.

1. The resource service never imports anything from `services/auth`, and never reads the private key or `AUTH_KEY_DIR`.
2. Verification pins `algorithms: ["RS256"]` and checks `iss` and `aud`. Never accept `none` or a symmetric algorithm.
3. Refresh tokens are stored only as SHA-256 digests.
4. Reuse of a used refresh token revokes its whole family, including the newest token.
5. Private keys never enter the repo or an image. `keys/` is gitignored. `.dockerignore` excludes `*.pem`. The Secret is created per run from a temp directory.
6. Error responses never include a stack trace, an internal message, or a secret.
7. Containers run as a non-root user with a read-only root filesystem and no Linux capabilities.

## 12. Acceptance criteria

Run from a clean clone, with Node 22 and Docker running for the last item.

| Command | Expected |
| --- | --- |
| `npm install` | Exits 0. Lockfile present |
| `npm run typecheck` | No errors |
| `npm run test:unit` | 71 passed, 11 suites |
| `npm run test:e2e` | 14 passed, 4 suites |
| `npm run build` | Exits 0. `dist/` has no `*.spec.js` |
| `npm run keygen -- <tmp>` | Three output lines. A second run without `--force` exits 1 |
| `npm run e2e:k8s` | Prints `E2E passed`. Exits 0. Cluster deleted afterwards |

Mutation check: break the reuse-revokes-family line, or add `HS256` to the verifier's algorithms. At least one unit test and one e2e test must fail each time. Restore the code afterwards.

## 13. Known gaps and trade-offs

- **Logout does not stop access tokens.** They stay valid until `exp`, up to 5 minutes. The e2e suite asserts this on purpose.
- **Auth runs as one replica.** Refresh records live in process memory.
- **No JWKS.** The resource service gets the public key from a ConfigMap, as the plan calls for. The doc's JWKS endpoint is not built.
- **Plain-text passwords** in one demo user. Production needs argon2 or bcrypt.
- **No HTTPS, no cookies.** Refresh tokens are returned in the JSON body. Production needs httpOnly, Secure, SameSite cookies.
- **Concurrency across instances is not tested.**

Doc items deliberately not adopted: Prisma, PostgreSQL with row-level security, Redis, the SQS outbox and consumers, ES256, bcryptjs, pino, helmet, cors, cookie-parser, rate limiting, jwks-rsa, supertest, the `/api/v1` prefix, the error envelope with `success` and `requestId`, the request-context middleware, and the tenant model.

Choices not in the first plan: 413 for oversized bodies, a `/api/health` route on both services, and a 400 `bad_request` for a login body that fails validation.

## 14. Writing rules

- README prose has no em dashes and no hyphen sentence breaks. Use commas, colons, periods and parentheses.
- Code, file names, commands and identifiers may contain hyphens.
- Each doc says who it is written for: README for people running the demo, CLAUDE.md for Claude Code sessions.
- When the plan changes, update the test counts in sections 9 and 12 in the same change.
