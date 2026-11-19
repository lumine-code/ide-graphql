const { resolveServer, installServer, latestServerVersion } = require("./server");

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
  provideBackgroundTips() {
    return {
      packageName: "ide-graphql",
      tips: [
        "{{packageName}} discovers schemas and projects through your GraphQL configuration file.",
      ],
    };
  },

  consumeIde(service) {
    const pendingProjects = new Map();
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
      documentSymbolScopes: ["source.graphql"],
      sessionScope: "project-root",
      shouldStartForEditor(editor, { rootPath }) {
        if (editor.getGrammar()?.scopeName === "source.graphql") return true;
        const config = graphqlConfigSettings();
        if (
          setting("serverPath") ||
          config.load.filepath ||
          config.dotEnvPath ||
          (config.load.configName && config.load.configName !== "graphql")
        )
          return true;
        const key = JSON.stringify([rootPath, config.load.legacy]);
        let pending = pendingProjects.get(key);
        if (!pending) {
          pending = require("./project-config")(rootPath, config.load.legacy !== false).finally(
            () => pendingProjects.delete(key),
          );
          pendingProjects.set(key, pending);
        }
        return pending;
      },
      settingsKeyPaths: ["ide-graphql"],
      restartKeyPaths: ["ide-graphql.serverPath"],
      bundledServer: true,
      installServer,
      latestServerVersion,
      async resolveServer(context) {
        return resolveServer(context, setting("serverPath"));
      },
      getSettings: settings,
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
