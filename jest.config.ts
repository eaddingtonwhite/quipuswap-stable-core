/*
* For a detailed explanation regarding each configuration property, visit:
* https://jestjs.io/docs/configuration
*/

import { setupJestEnv } from "./scripts/modules/jest/env";

const config = {
  coverageProvider: "v8",

  // The maximum amount of workers used to run your tests. Can be specified as % or a number. E.g. maxWorkers: 10% will use 10% of your CPU amount + 1 as the maximum worker number. maxWorkers: 2 will use a maximum of 2 workers.
  maxWorkers: "1",

  // The paths to modules that run some code to configure or set up the testing environment before each test
  setupFiles: ["./scripts/modules/jest/globals.ts"],
  preset: "ts-jest/presets/js-with-ts",
  testEnvironment: "node",
  testRunner: "jest-circus/runner",
};

/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = async () => {
 const globals = await setupJestEnv();

 return {
   ...config,
   globals: {
    //  ...config.globals,
     ...globals,
   }
 };
};

