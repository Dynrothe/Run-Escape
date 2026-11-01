// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import "@testing-library/jest-dom";
import { setImmediate } from "node:timers";

// Without this a file of synchronous tests never gives the event loop a turn, and after a minute
// vitest gives up on the worker: `Timeout calling "onTaskUpdate"`
afterEach(() => new Promise((resolve) => setImmediate(resolve)));
