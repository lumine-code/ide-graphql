const path = require("path");

// Resolve the server from the exact CLI selected by the adapter. Searching the
// shim's own dependencies would silently run the bundled generation when a
// managed installation is incomplete.
const cliDirectory = path.dirname(process.argv[3]);
const serverModule = require.resolve("graphql-language-service-server", {
  paths: [cliDirectory],
});
const { startServer } = require(serverModule);

// Retain the stdio pipe just as the official CLI does. Without this listener,
// Electron's Node mode can decide the event loop is empty after initialization
// and close a perfectly healthy LSP connection.
process.stdin.on("close", () => {
  process.exitCode = 0;
});

startServer({ method: "stream", configDir: process.argv[2] }).catch((error) => {
  process.stderr.write(`GraphQL language server failed: ${error.stack || error}\n`);
  process.exitCode = 1;
});
