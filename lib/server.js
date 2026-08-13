const fs = require("fs");

const serverArgs = (rootPath) => ["server", "--method", "stream", "--configDir", rootPath];

// Where the editor can fetch a newer server than the one this package pins.
//
// An upgrade tier, not the only way in: the dependencies below are always
// present, so uninstalling drops back to them and can never leave the user with
// nothing. `module` names the shim rather than the server, because the shim is
// what is launched — the install root is handed to it as an argument instead.
exports.managedServer = {
  source: "npm",
  displayName: "GraphQL Language Server",
  packages: ["graphql-language-service-cli", "graphql"],
  module: "node_modules/graphql-language-service-cli/package.json",
  bundled: true,
};

exports.resolveServer = async (configuredPath, rootPath, managed = null) => {
  if (configuredPath) {
    await fs.promises.access(configuredPath, fs.constants.X_OK);
    return { command: configuredPath, args: serverArgs(rootPath) };
  }

  // The CLI loads a legacy Babel polyfill before starting the server. That
  // polyfill prevents its stream transport from answering when the editor's
  // Electron executable runs as Node, although the same CLI works in plain
  // Node. The tiny bundled entry point calls the exact same server API without
  // mutating the runtime first.
  //
  // The shim always ships with this package, so a managed install changes where
  // it looks for the server rather than which file is launched.
  const serverModule = require.resolve("./start-server");
  return {
    command: process.execPath,
    args: [serverModule, rootPath, ...(managed?.directory ? [managed.directory] : [])],
    env: { ELECTRON_RUN_AS_NODE: "1" },
    version: managed?.version,
  };
};

exports.serverArgs = serverArgs;
