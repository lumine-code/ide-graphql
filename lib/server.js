const fs = require("fs");

const serverArgs = (rootPath) => ["server", "--method", "stream", "--configDir", rootPath];

exports.resolveServer = async (configuredPath, rootPath) => {
  if (configuredPath) {
    await fs.promises.access(configuredPath, fs.constants.X_OK);
    return { command: configuredPath, args: serverArgs(rootPath) };
  }

  // The CLI loads a legacy Babel polyfill before starting the server. That
  // polyfill prevents its stream transport from answering when the editor's
  // Electron executable runs as Node, although the same CLI works in plain
  // Node. The tiny bundled entry point calls the exact same server API without
  // mutating the runtime first.
  const serverModule = require.resolve("./start-server");
  return {
    command: process.execPath,
    args: [serverModule, rootPath],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  };
};

exports.serverArgs = serverArgs;
