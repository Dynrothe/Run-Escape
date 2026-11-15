// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { setImmediate } from "node:timers";

// The game starts in the browser's language, and Node's navigator has the machine's: tests start
// in English wherever they run. A test that wants another stubs navigator itself.
if (typeof navigator !== "undefined") {
    Object.defineProperty(navigator, "language", { value: "en-US", configurable: true });
}

// Without this a file of synchronous tests never gives the event loop a turn, and after a minute
// vitest gives up on the worker: `Timeout calling "onTaskUpdate"`
afterEach(() => new Promise((resolve) => setImmediate(resolve)));
