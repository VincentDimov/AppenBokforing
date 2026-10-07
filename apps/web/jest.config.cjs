/* eslint-disable @typescript-eslint/no-require-imports, no-undef */

const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

const customJestConfig = {
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/e2e/"],
  testEnvironment: "jest-environment-jsdom"
};

module.exports = createJestConfig(customJestConfig);
