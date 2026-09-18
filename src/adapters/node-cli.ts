export interface CliIo {
  write(message: string): void;
  read(prompt: string, signal?: AbortSignal): Promise<string | null>;
}
function requireNode<T>(id: string): T {
  // Runtime resolution keeps native dependencies out of non-Node bundles.
  const runtimeRequire = eval("require") as (moduleId: string) => T;
  return runtimeRequire(id);
}
const defaultCliIo: CliIo = {
  write(message) {
    console.log(message);
  },
  async read(prompt, signal) {
    const readline = requireNode<typeof import("node:readline/promises")>(
      "node:readline/promises",
    );
    const io = requireNode<typeof import("node:process")>("node:process");
    const session = readline.createInterface({
      input: io.stdin,
      output: io.stdout,
    });
    try {
      return signal
        ? await session.question(prompt, { signal })
        : await session.question(prompt);
    } finally {
      session.close();
    }
  },
};
let cliIo: CliIo = defaultCliIo;
export function setCliIo(value: CliIo): () => void {
  const previous = cliIo;
  cliIo = value;
  return () => {
    cliIo = previous;
  };
}
export function getCliIo(): CliIo {
  return cliIo;
}
