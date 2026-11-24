import fs from "node:fs";
import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./common/config/env";

if (!env.PUBLIC_KEY_PATH) {
  throw new Error("PUBLIC_KEY_PATH is required. Generate keys with: npm run keygen");
}

// Public key only. This process never sees the private key.
const publicKey = fs.readFileSync(env.PUBLIC_KEY_PATH, "utf8");
const server = createServer(createApp(publicKey));

server.listen(env.PORT, () => {
  console.log(`resource service listening on :${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
