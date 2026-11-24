import { createServer } from "node:http";
import { createApp } from "./app";
import { env } from "./common/config/env";

const server = createServer(createApp());

server.listen(env.PORT, () => {
  console.log(`auth service listening on :${env.PORT}`);
});

function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
