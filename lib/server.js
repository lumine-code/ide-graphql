const fs = require("fs");
const path = require("path");
const { dependencies, overrides } = require("../package.json");
const GRAPHQL_VERSION = dependencies.graphql;
const SERVER_PACKAGE = "graphql-language-service-cli";
const SERVER_MODULE = "node_modules/graphql-language-service-cli/package.json";

const serverArgs = (rootPath) => ["server", "--method", "stream", "--configDir", rootPath];

exports.latestServerVersion = (api) => api.npmPackageLatestVersion(SERVER_PACKAGE);

// A managed npm project must carry the same dependency fixes as the bundled
// project. Seed its manifest before InstallApi invokes npm; dependency overrides
// are deliberately local to each npm installation, not inherited by children.
exports.installServer = async ({ storagePath, version, api, signal = api.signal }) => {
  signal?.throwIfAborted();
  const requestedVersion =
    version || (await api.npmPackageLatestVersion(SERVER_PACKAGE, { signal }));
  signal?.throwIfAborted();
  await fs.promises.mkdir(storagePath, { recursive: true });
  await fs.promises.writeFile(
    path.join(storagePath, "package.json"),
    `${JSON.stringify({ private: true, overrides }, null, 2)}\n`,
    { signal },
  );
  api.setServerInstallationStatus("installing");
  await api.npmInstallPackage("graphql", GRAPHQL_VERSION, storagePath, { signal });
  signal?.throwIfAborted();
  await api.npmInstallPackage(SERVER_PACKAGE, requestedVersion, storagePath, { signal });
  signal?.throwIfAborted();
  const installedVersion = api.npmPackageInstalledVersion(SERVER_PACKAGE, storagePath);
  if (!installedVersion) throw new Error("The GraphQL installation contains no CLI version.");
  return { module: SERVER_MODULE, version: installedVersion };
};

exports.resolveServer = async (context, configuredPath) => {
  const selection = await context.resolver.select({
    configuredPath,
    configuredKind: "auto",
    managed: () => {
      const install = context.getManagedServer();
      return install ? { path: install.modulePath, version: install.version } : null;
    },
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
