import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = join(tmpdir(), `venera-runtime-vitest-${process.pid}`);
mkdirSync(root, { recursive: true });
process.env.VENERA_RUNTIME_DATA_DIR = root;
