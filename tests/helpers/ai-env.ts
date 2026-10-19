import { beforeEach, afterEach } from "node:test";
/** Test fixtures must never use a developer's real provider credentials. */
export function isolateAiEnv() {
  const names = [
    "AI_PROVIDER",
    "GEMINI_API_KEY",
    "GEMINI_MODEL",
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
  ];
  const saved = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  beforeEach(() => {
    for (const name of names) delete process.env[name];
  });
  afterEach(() => {
    for (const name of names) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
  });
}
