import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
export async function startProduction(overrides = {}) {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const processHandle = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        APP_PASSWORD: "",
        MONGODB_URI: "",
        OPENAI_API_KEY: "",
        GEMINI_API_KEY: "",
        AI_PROVIDER: "auto",
        GEMINI_MODEL: "auto",
        CRON_SECRET: "",
        ...overrides,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  for (const stream of [processHandle.stdout, processHandle.stderr])
    stream.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-8000);
    });
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => {
    if (processHandle.exitCode !== null) return;
    const finished = once(processHandle, "exit");
    processHandle.kill("SIGTERM");
    const force = setTimeout(() => processHandle.kill("SIGKILL"), 5000);
    try {
      await finished;
    } finally {
      clearTimeout(force);
    }
  };
  for (let attempt = 0; attempt < 200; attempt++) {
    if (processHandle.exitCode !== null)
      throw new Error("Production server exited: " + output);
    try {
      await fetch(url + "/api/status", { signal: AbortSignal.timeout(1000) });
      return { url, stop };
    } catch {
      await delay(100);
    }
  }
  await stop();
  throw new Error("Production server did not become ready");
}
