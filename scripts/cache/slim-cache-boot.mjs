// Starts one of slim-cache.ts's worker threads. tsx's loader doesn't reach
// worker threads by itself, so this registers it, then imports the worker.
import { workerData } from "node:worker_threads";
import { register } from "tsx/esm/api";

register();
await import(workerData.entry);
