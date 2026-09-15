/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "..",
  testEnvironment: "node",
  testRegex: "test/.*\.integration-spec\.ts$",
  setupFiles: ["<rootDir>/test/integration-env.cjs"],
  transform: {
    "^.+\\.ts$": "ts-jest"
  }
};
