const { createRequire } = require("module");

// The CLI generation selects its own server dependency. Calling the public
// server API also gives this child an explicit, retained stdio lifetime.
const selected = createRequire(process.argv[3]);
const { startServer } = selected("graphql-language-service-server");
process.stdin.on("close", () => {
  process.exitCode = 0;
});
startServer({ method: "stream", configDir: process.argv[2] }).catch((error) => {
  process.stderr.write(`GraphQL language server failed: ${error.stack || error}\n`);
  process.exitCode = 1;
});
