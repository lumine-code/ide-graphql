const GRAPHQL_VERSION = require("../package.json").dependencies.graphql;

const serverArgs = (rootPath) => ["server", "--method", "stream", "--configDir", rootPath];

// Where the editor can fetch a newer server than the one this package pins.
//
// An upgrade tier, not the only way in: the dependencies below are always
// present, so uninstalling drops back to them and can never leave the user with
// nothing. `module` identifies the CLI generation; a local runtime shim starts
// the server belonging to that exact CLI manifest.
exports.managedServer = {
  source: "npm",
  displayName: "GraphQL Language Server",
  packages: [
    { name: "graphql-language-service-cli" },
    { name: "graphql", version: GRAPHQL_VERSION },
  ],
  module: "node_modules/graphql-language-service-cli/package.json",
  bundled: true,
};

exports.resolveServer = async (context, configuredPath) => {
  const selection = await context.resolver.select({
    configuredPath,
    configuredKind: "auto",
    managedPath: context.managedServer?.modulePath,
    managedVersion: context.managedServer?.version,
    bundledPath: () => require.resolve("graphql-language-service-cli/package.json"),
    kind: "file",
    allowShellWrapper: true,
  });
  if (!selection) return null;
  if (selection.source === "configured")
    return context.resolver.launch(selection, {
      args: serverArgs(context.rootPath),
      cwd: context.rootPath,
      transport: "stdio",
    });
  // The official CLI's Babel polyfill breaks Electron's stream transport.
  // Our shim calls the same server API from the exact selected CLI generation.
  return context.resolver.nodeEntry(
    require.resolve("./start-server"),
    [context.rootPath, selection.path],
    {
      cwd: context.rootPath,
      transport: "stdio",
      ...(selection.version && { version: selection.version }),
    },
  );
};

exports.serverArgs = serverArgs;
