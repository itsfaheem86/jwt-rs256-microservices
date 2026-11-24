import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Express } from "express";

export type TestServer = { url: string; close: () => Promise<void> };

// Serves an Express app on a random local port, for HTTP-level unit tests of one router.
export function listenApp(app: Express): Promise<TestServer> {
  const server = http.createServer(app);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}
