// Single command for the Kubernetes e2e run:  npm run e2e:k8s
// It builds both images, makes (or reuses) a kind cluster, deploys both services, runs the
// in-cluster tests as a Job, and deletes the cluster afterwards.
// Set E2E_KEEP_CLUSTER=1 to keep the cluster for debugging.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeys } from "../services/auth/src/common/auth/keys";

const ROOT = path.resolve(__dirname, "..");
const CLUSTER = "jwt-demo";
const CONTEXT = `kind-${CLUSTER}`;
const NAMESPACE = "jwt-demo";
const RUNTIME_IMAGE = "jwt-demo:e2e";
const TEST_IMAGE = "jwt-demo:tests";
const JOB = "jwt-e2e";
const JOB_TIMEOUT_MS = 5 * 60 * 1000;

type RunOptions = { input?: string; capture?: boolean };

function run(cmd: string, args: string[], { input, capture = false }: RunOptions = {}): string {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    input,
    encoding: "utf8",
    stdio: [input === undefined ? "ignore" : "pipe", capture ? "pipe" : "inherit", "inherit"],
  });
  if (res.error) throw new Error(`Could not start ${cmd}: ${res.error.message}`);
  if (res.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited with code ${res.status}`);
  return capture ? res.stdout ?? "" : "";
}

const kubectl = (args: string[], opts?: RunOptions): string => run("kubectl", ["--context", CONTEXT, ...args], opts);

function requireTool(name: string, args: string[]): void {
  const res = spawnSync(name, args, { stdio: "ignore" });
  if (res.error || res.status !== 0) {
    throw new Error(`${name} must be installed and working (checked: ${name} ${args.join(" ")})`);
  }
}

function applyFile(relPath: string): void {
  kubectl(["apply", "-f", path.join(ROOT, relPath)]);
}

// Renders a Secret or ConfigMap client-side and pipes it into apply, so re-runs update in place.
function applyGenerated(createArgs: string[]): void {
  const manifest = kubectl([...createArgs, "--dry-run=client", "-o", "yaml"], { capture: true });
  kubectl(["apply", "-f", "-"], { input: manifest });
}

async function waitForJob(): Promise<boolean> {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const [succeeded = "", failed = ""] = kubectl(
      ["get", "job", JOB, "-n", NAMESPACE, "-o", "jsonpath={.status.succeeded}|{.status.failed}"],
      { capture: true },
    ).split("|");
    if (succeeded === "1") return true;
    if (Number(failed) > 0) return false;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`e2e Job did not finish within ${JOB_TIMEOUT_MS / 1000}s`);
}

function dumpDiagnostics(): void {
  const queries: string[][] = [
    ["get", "pods", "-n", NAMESPACE, "-o", "wide"],
    ["logs", "deployment/auth", "-n", NAMESPACE, "--tail=50"],
    ["logs", "deployment/resource", "-n", NAMESPACE, "--tail=50"],
  ];
  for (const args of queries) {
    try {
      kubectl(args);
    } catch {
      // Diagnostics are best effort.
    }
  }
}

async function main(): Promise<void> {
  requireTool("docker", ["info"]);
  requireTool("kind", ["version"]);
  requireTool("kubectl", ["version", "--client"]);

  const clusters = run("kind", ["get", "clusters"], { capture: true }).split(/\r?\n/);
  if (clusters.includes(CLUSTER)) {
    console.log(`==> Reusing kind cluster "${CLUSTER}"`);
  } else {
    console.log(`==> Creating kind cluster "${CLUSTER}"`);
    run("kind", ["create", "cluster", "--name", CLUSTER, "--wait", "120s"]);
  }

  // Keys are generated into a temp directory and removed at the end. They never land in the repo.
  const keyDir = fs.mkdtempSync(path.join(os.tmpdir(), "jwt-demo-e2e-"));
  try {
    const { privatePath, publicPath } = generateKeys(keyDir);

    console.log("==> Building images");
    run("docker", ["build", "--target", "runtime", "-t", RUNTIME_IMAGE, "."]);
    run("docker", ["build", "--target", "tests", "-t", TEST_IMAGE, "."]);
    run("kind", ["load", "docker-image", RUNTIME_IMAGE, TEST_IMAGE, "--name", CLUSTER]);

    console.log("==> Deploying services");
    applyFile("k8s/namespace.yaml");
    applyGenerated(["create", "secret", "generic", "jwt-auth-keys", "-n", NAMESPACE, `--from-file=private.pem=${privatePath}`]);
    applyGenerated(["create", "configmap", "jwt-public-key", "-n", NAMESPACE, `--from-file=public.pem=${publicPath}`]);
    applyFile("k8s/auth.yaml");
    applyFile("k8s/resource.yaml");
    // Restart so pods on a reused cluster pick up the new keys and the new images.
    kubectl(["rollout", "restart", "deployment/auth", "deployment/resource", "-n", NAMESPACE]);
    kubectl(["rollout", "status", "deployment/auth", "-n", NAMESPACE, "--timeout=120s"]);
    kubectl(["rollout", "status", "deployment/resource", "-n", NAMESPACE, "--timeout=120s"]);

    console.log("==> Running e2e Job inside the cluster");
    kubectl(["delete", "job", JOB, "-n", NAMESPACE, "--ignore-not-found"]);
    applyFile("k8s/e2e-job.yaml");
    const passed = await waitForJob();
    kubectl(["logs", `job/${JOB}`, "-n", NAMESPACE]);
    if (!passed) throw new Error("e2e tests failed inside the cluster (see logs above)");
    console.log("==> E2E passed");
  } catch (error) {
    dumpDiagnostics();
    throw error;
  } finally {
    fs.rmSync(keyDir, { recursive: true, force: true });
    if (process.env.E2E_KEEP_CLUSTER === "1") {
      console.log(`==> Kept cluster "${CLUSTER}" (kubectl context ${CONTEXT})`);
    } else {
      console.log(`==> Deleting kind cluster "${CLUSTER}"`);
      run("kind", ["delete", "cluster", "--name", CLUSTER]);
    }
  }
}

main().catch((error: Error) => {
  console.error(`\nE2E FAILED: ${error.message}`);
  process.exitCode = 1;
});
