import type { Config } from "jest";

// Two layers, one command each (see package.json):
//   unit: one service at a time, collaborators replaced by fakes. Lives beside the code in services/.
//   e2e:  both services over HTTP, one user journey per file. Lives in test/e2e/.
// The cluster layer has its own config (jest.cluster.config.ts) because it runs inside Kubernetes.
const config: Config = {
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/services"],
      testRegex: "\\.spec\\.ts$",
      setupFiles: ["<rootDir>/test/helpers/setup.ts"],
      testTimeout: 15_000,
    },
    {
      displayName: "e2e",
      preset: "ts-jest",
      testEnvironment: "node",
      roots: ["<rootDir>/test/e2e"],
      testRegex: "\\.e2e\\.spec\\.ts$",
      setupFiles: ["<rootDir>/test/helpers/setup.ts"],
      testTimeout: 15_000,
    },
  ],
};

export default config;
