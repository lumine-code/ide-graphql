const { CompositeDisposable } = require("lumine");
const { resolveServer } = require("./server");

const setting = (key) => lumine.config.get(`ide-graphql.${key}`);
const optionalText = (key) => setting(key) || undefined;

const graphqlConfigSettings = () => ({
  load: {
    // Upstream reads `rootDir.length` without guarding a missing property.
    // Empty means "use the --configDir project root" and avoids that crash.
    rootDir: "",
    filePath: optionalText("config.filePath"),
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
      async resolveServer(context) {
        const launch = await resolveServer(setting("serverPath"), context.rootPath);
        return { ...launch, cwd: context.rootPath, transport: "stdio" };
      },
      getSettings: settings,
      getWorkspaceConfiguration(section) {
        if (!section) return settings();
        if (section === "graphql-config") return graphqlConfigSettings();
        if (section === "vscode-graphql") return vscodeGraphqlSettings();
        return undefined;
      },
    };

    const subscriptions = new CompositeDisposable(service.registerAdapter(adapter));
    subscriptions.add(
      lumine.config.onDidChange("ide-graphql.serverPath", () => {
        for (const session of service.getSessions()) {
          if (session.adapter !== adapter || ["stopping", "stopped"].includes(session.state))
            continue;
          service.restart(session).catch((error) => {
            lumine.notifications.addError("Unable to restart GraphQL Language Server", {
              detail: error.message,
              dismissable: true,
            });
          });
        }
      }),
    );
    return subscriptions;
  },
};
