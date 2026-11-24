import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp as createAuthApp } from "../../../services/auth/src/app";
import { publicKey } from "../../../services/auth/src/common/auth/issue";
import { createApp as createResourceApp } from "../../../services/resource/src/app";

export type Stack = { authUrl: string; resourceUrl: string; stop: () => Promise<void> };

// Starts both services on random local ports. They run in this process, but each one is a real HTTP server.
export async function startStack(): Promise<Stack> {
  const authServer = http.createServer(createAuthApp());
  const resourceServer = http.createServer(createResourceApp(publicKey));
  await listen(authServer);
  await listen(resourceServer);
  return {
    authUrl: baseUrl(authServer),
    resourceUrl: baseUrl(resourceServer),
    stop: async () => {
      await close(authServer);
      await close(resourceServer);
    },
  };
}

function listen(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

function baseUrl(server: http.Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

export function postJson(base: string, route: string, body: unknown): Promise<Response> {
  return fetch(`${base}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Signs in as the demo user and returns the token pair.
export async function signIn(stack: Stack): Promise<{ accessToken: string; refreshToken: string }> {
  return (await postJson(stack.authUrl, "/login", { username: "alice", password: "correct-horse" })).json();
}

export function callMe(stack: Stack, accessToken: string): Promise<Response> {
  return fetch(`${stack.resourceUrl}/api/me`, { headers: { authorization: `Bearer ${accessToken}` } });
}

// Changes the claims of a signed token. The signature no longer matches, so the resource service must refuse it.
export function tamperPayload(token: string, changes: Record<string, unknown>): string {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  Object.assign(claims, changes);
  return [header, Buffer.from(JSON.stringify(claims)).toString("base64url"), signature].join(".");
}
