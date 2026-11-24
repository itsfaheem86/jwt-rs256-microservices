import type { Config } from "jest";

// Runs inside the cluster (k8s/e2e-job.yaml). No setupFiles: the cluster test never needs keys.
const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test/cluster"],
  testRegex: "\\.spec\\.ts$",
  testTimeout: 30_000,
};

export default config;
