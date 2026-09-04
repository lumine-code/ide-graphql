const { resolveServer, managedServer } = require("./server");

const setting = (key) => lumine.config.get(`ide-graphql.${key}`);
const optionalText = (key) => setting(key) || undefined;

const graphqlConfigSettings = () => ({
  load: {
    // Upstream reads `rootDir.length` without guarding a missing property.
    // Empty means "use the --configDir project root" and avoids that crash.
    rootDir: "",
    // graphql-config's LoadConfigOptions spells this `filepath`.
    filepath: optionalText("config.filePath"),
    configName: setting("config.configName"),
    legacy: setting("config.legacy"),
  },
  dotEnvPath: optionalText("config.dotEnvPath"),
});

const cacheSchemaFileForLookup = () => {
  const value = setting("languageService.cacheSchemaFileForLookup");
  if (value === "enabled") return true;
  if (value === "disabled") return false;
  return undefined;
};

const vscodeGraphqlSettings = () => ({
  cacheSchemaFileForLookup: cacheSchemaFileForLookup(),
  schemaCacheTTL: setting("languageService.schemaCacheTTL"),
  debug: setting("languageService.debug"),
});

const settings = () => ({
  "graphql-config": graphqlConfigSettings(),
  "vscode-graphql": vscodeGraphqlSettings(),
});

module.exports = {
  consumeIdeClient(service) {
    const adapter = {
      id: "ide-graphql",
      displayName: "GraphQL Language Server",
      grammarScopes: [
        "source.graphql",
        "source.js",
        "source.js.jsx",
        "source.ts",
        "source.tsx",
        "text.html.vue",
      ],
      sessionScope: "project-root",
      settingsKeyPaths: ["ide-graphql"],
      restartKeyPaths: ["ide-graphql.serverPath"],
      managedServer,
      async resolveServer(context) {
        const launch = await resolveServer(
          setting("serverPath"),
          context.rootPath,
          context.managedServer,
        );
        return { ...launch, cwd: context.rootPath, transport: "stdio" };
      },
      getSettings: settings,
      getWorkspaceConfiguration(section) {
        if (!section) return settings();
        if (section === "graphql-config") return graphqlConfigSettings();
        if (section === "vscode-graphql") return vscodeGraphqlSettings();
        return undefined;
      },
      transformServerCapabilities(capabilities) {
        // The server advertises workspace-folder changes, but its processor
        // keeps one root/config/cache and still documents per-workspace support
        // as future work. A separate process per root is the only safe routing.
        return {
          ...capabilities,
          workspace: {
            ...capabilities.workspace,
            workspaceFolders: { supported: false, changeNotifications: false },
          },
        };
      },
    };

    return service.registerAdapter(adapter);
  },
};
