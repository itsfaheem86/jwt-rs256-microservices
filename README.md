# JWT RS256 demo

Two services in TypeScript on Express 5 that show how microservices can verify access tokens without sharing a secret.

The auth service holds the RSA private key. It signs short-lived RS256 access tokens and keeps opaque refresh tokens. The resource service holds only the public key. It verifies access tokens and cannot mint one.

Refresh tokens are random, stored as SHA-256 hashes, and single use. When a used token is presented again, its whole family is revoked, including the newest token.

## Requirements

Node.js 22 or newer. The Kubernetes run also needs Docker with a running daemon, `kind`, and `kubectl`.

## Run the tests

```
npm install
npm run test:unit    # unit tests: each service on its own
npm run test:e2e     # end-to-end tests: both services over HTTP
npm test             # both layers
```

The tests create their own temporary keys, so no key setup is needed.

Unit tests sit beside the code they test. Each one replaces its collaborators with a fake or a mock: the auth service runs against an in-memory repository fake, the HTTP routers run with a mocked service or a stub verifier, and the resource verifier creates its own keys, so it never touches the auth service.

End-to-end tests live in `test/e2e/`. Each file covers one user journey (sign-in, resource access, refresh rotation, logout), and each starts both services on random ports.

## Run the services

```
npm run keygen
npm run build
npm run start:auth
```

`npm run keygen` writes `keys/private.pem` and `keys/public.pem`. The `keys/` directory is gitignored. The auth service reads `keys/private.pem` by default and listens on port 3001.

Start the resource service in a second terminal. It needs the public key only:

```
PUBLIC_KEY_PATH=keys/public.pem npm run start:resource
```

On Windows PowerShell, set the variable first: `$env:PUBLIC_KEY_PATH = "keys/public.pem"`, then run `npm run start:resource`. The resource service listens on port 3002.

For development with reloading, use `npm run dev:auth` and `npm run dev:resource`.

To generate the keys with openssl instead:

```
mkdir keys
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out keys/private.pem
openssl rsa -pubout -in keys/private.pem -out keys/public.pem
```

## Run the end-to-end test on Kubernetes

```
npm run e2e:k8s
```

The command:

1. Creates a kind cluster named `jwt-demo`, or reuses it if it already exists.
2. Generates a fresh key pair in a temporary directory. The private key goes into a Kubernetes Secret, and the public key goes into a ConfigMap.
3. Builds two images from one Dockerfile. `jwt-demo:e2e` runs the services. `jwt-demo:tests` runs the tests.
4. Deploys the auth service with one replica and the resource service with two, then waits for both to roll out.
5. Runs `test/cluster` as a Job. The Job calls both services by their Service names.
6. Deletes the cluster when it finishes.

The command exits with 0 only when the in-cluster tests pass. Set `E2E_KEEP_CLUSTER=1` to keep the cluster for debugging.

To run the in-cluster tests against services you started yourself, set `E2E_AUTH_URL` and `E2E_RESOURCE_URL`, then run `npm run test:cluster`.

## Configuration

| Variable | Service | Default | Purpose |
| --- | --- | --- | --- |
| `PORT` | both | 3001 (auth), 3002 (resource) | Port to listen on |
| `JWT_ISSUER` | both | `https://auth.example.com` | Expected `iss` claim |
| `JWT_AUDIENCE` | both | `api.example.com` | Expected `aud` claim |
| `AUTH_KEY_DIR` | auth | `keys` | Directory holding `private.pem` |
| `PUBLIC_KEY_PATH` | resource | none, required at startup | Path to `public.pem` |

Configuration is checked when each service starts, so a bad value stops the process before it listens.

## Endpoints

| Service | Method and path | Result |
| --- | --- | --- |
| auth | `POST /login` | 200 with both tokens, or 401 `invalid_credentials` |
| auth | `POST /refresh` | 200 with a new pair, or 401 with the reason |
| auth | `POST /logout` | 204 |
| resource | `GET /api/me` | 200 with `sub` and `roles`, or 401 `missing_token` or `invalid_token` |
| both | `GET /api/health` | 200, used by the Kubernetes probes |

The demo user is `alice` with the password `correct-horse`.

## File map

| Path | Role |
| --- | --- |
| `services/auth/src/` | The auth service: sign-in, refresh rotation, logout, and the private key |
| `services/resource/src/` | The resource service: bearer-token verification with the public key |
| `services/*/src/common/` | Config, errors, middleware, and token code used by one service |
| `services/*/src/modules/` | One folder per feature, with its code and its unit tests |
| `test/e2e/` | Both services in one process on random ports |
| `test/cluster/` | Black-box tests that run inside Kubernetes |
| `test/helpers/` | Temporary keys for each test file |
| `scripts/keygen.ts` | Key generation for `npm run keygen` |
| `scripts/e2e-k8s.ts` | The single command for the Kubernetes run |
| `Dockerfile`, `.dockerignore` | The `runtime` and `tests` images |
| `k8s/` | Namespace, Deployments, Services, and the e2e Job |

## Notes

The file-based keys and the in-memory refresh store are for learning only. Access tokens are stateless, so an access token keeps working until it expires, five minutes after issue, even after logout. The auth service runs as one replica because refresh-token records live in its memory.

Production needs a secret manager for the private key, a database for refresh tokens, and HTTPS. Refresh tokens belong in httpOnly, Secure, SameSite cookies. Passwords need a real hash such as argon2 or bcrypt.
