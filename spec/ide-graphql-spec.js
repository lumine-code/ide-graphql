const fs = require("fs");
const path = require("path");
const main = require("../lib/main");
const { resolveServer } = require("../lib/server");

const FEATURES = ["diagnostics", "autocomplete", "hover", "definition", "symbols", "outline"];

const registerAdapter = (overrides = {}) => {
  let adapter;
  const service = {
    registerAdapter(registered) {
      adapter = registered;
      return { dispose() {} };
    },
    getSessions: () => [],
    restart: async () => {},
    ...overrides,
  };
  const disposable = main.consumeIdeClient(service);
  return { adapter, disposable, service };
};

describe("ide-graphql server resolution", () => {
  it("passes the project root and stream transport to a custom executable", async () => {
    const launch = await resolveServer(process.execPath, __dirname);
    expect(launch).toEqual({
      command: process.execPath,
      args: ["server", "--method", "stream", "--configDir", __dirname],
    });
  });

  it("launches the exact bundled CLI through Electron's Node runtime", async () => {
    const launch = await resolveServer("", __dirname);
    expect(launch.command).toBe(process.execPath);
    expect(launch.args[1]).toBe(__dirname);
    expect(path.basename(launch.args[0])).toBe("start-server.js");
    expect(fs.existsSync(launch.args[0])).toBe(true);
    expect(launch.env.ELECTRON_RUN_AS_NODE).toBe("1");
    expect(require("graphql-language-service-cli/package.json").version).toBe("3.5.0");
    expect(require("graphql/package.json").version).toBe("16.14.2");
  });
});

describe("ide-graphql adapter", () => {
  let adapter;
  let disposable;

  beforeEach(async () => {
    await lumine.packages.activatePackage("ide-graphql");
    ({ adapter, disposable } = registerAdapter());
  });

  afterEach(async () => {
    disposable.dispose();
    await lumine.packages.deactivatePackage("ide-graphql");
  });

  it("registers every file type parsed by the GraphQL service", async () => {
    expect(adapter.id).toBe("ide-graphql");
    expect(adapter.displayName).toBe("GraphQL Language Server");
    expect(adapter.grammarScopes).toEqual([
      "source.graphql",
      "source.js",
      "source.js.jsx",
      "source.ts",
      "source.tsx",
      "text.html.vue",
    ]);
    expect(adapter.sessionScope).toBe("project-root");
    expect(adapter.settingsKeyPaths).toEqual(["ide-graphql"]);
    const launch = await adapter.resolveServer({ rootPath: __dirname });
    expect(launch.cwd).toBe(__dirname);
    expect(launch.transport).toBe("stdio");
    expect(launch.args).toContain(__dirname);
  });

  it("answers the two exact configuration sections requested upstream", () => {
    const all = adapter.getSettings();
    expect(adapter.getWorkspaceConfiguration()).toEqual(all);
    expect(adapter.getWorkspaceConfiguration("graphql-config")).toEqual(all["graphql-config"]);
    expect(adapter.getWorkspaceConfiguration("vscode-graphql")).toEqual(all["vscode-graphql"]);
    expect(adapter.getWorkspaceConfiguration("editor")).toBeUndefined();
  });

  it("maps GraphQL config discovery without replacing empty values", () => {
    lumine.config.set("ide-graphql.config.filePath", "config/project.json");
    lumine.config.set("ide-graphql.config.configName", "platform");
    lumine.config.set("ide-graphql.config.legacy", false);
    lumine.config.set("ide-graphql.config.dotEnvPath", ".env.local");
    const config = adapter.getSettings()["graphql-config"];
    expect(config).toEqual({
      load: {
        rootDir: "",
        filePath: "config/project.json",
        configName: "platform",
        legacy: false,
      },
      dotEnvPath: ".env.local",
    });
    lumine.config.set("ide-graphql.config.filePath", "");
    lumine.config.set("ide-graphql.config.dotEnvPath", "");
    expect(config.load.filePath).toBe("config/project.json");
    expect(adapter.getSettings()["graphql-config"].load.filePath).toBeUndefined();
    expect(adapter.getSettings()["graphql-config"].dotEnvPath).toBeUndefined();
  });

  it("maps all three schema lookup cache modes", () => {
    const read = () => adapter.getSettings()["vscode-graphql"].cacheSchemaFileForLookup;
    expect(read()).toBeUndefined();
    lumine.config.set("ide-graphql.languageService.cacheSchemaFileForLookup", "enabled");
    expect(read()).toBe(true);
    lumine.config.set("ide-graphql.languageService.cacheSchemaFileForLookup", "disabled");
    expect(read()).toBe(false);
  });

  it("maps cache lifetime and debug logging", () => {
    lumine.config.set("ide-graphql.languageService.schemaCacheTTL", 250);
    lumine.config.set("ide-graphql.languageService.debug", true);
    expect(adapter.getSettings()["vscode-graphql"]).toEqual({
      cacheSchemaFileForLookup: undefined,
      schemaCacheTTL: 250,
      debug: true,
    });
  });

  it("restarts live sessions only after the executable path changes", async () => {
    disposable.dispose();
    const session = { adapter: null, state: "running" };
    const stopped = { adapter: null, state: "stopped" };
    const restart = jasmine.createSpy("restart").and.returnValue(Promise.resolve());
    ({ adapter, disposable } = registerAdapter({
      getSessions: () => [session, stopped],
      restart,
    }));
    session.adapter = adapter;
    stopped.adapter = adapter;
    lumine.config.set("ide-graphql.serverPath", process.execPath);
    await Promise.resolve();
    expect(restart).toHaveBeenCalledOnceWith(session);
  });
});

describe("ide-graphql feature contracts", () => {
  const definitions = require("../package.json").configSchema.features.properties;

  beforeEach(async () => {
    await lumine.packages.activatePackage("ide-graphql");
  });

  afterEach(async () => {
    for (const feature of FEATURES) lumine.config.unset(`ide-graphql.features.${feature}`);
    await lumine.packages.deactivatePackage("ide-graphql");
  });

  for (const feature of FEATURES) {
    it(`exposes ${feature} as an independent enabled-by-default switch`, () => {
      expect(definitions[feature].type).toBe("boolean");
      expect(definitions[feature].default).toBe(true);
      const keyPath = `ide-graphql.features.${feature}`;
      expect(lumine.config.get(keyPath)).toBe(true);
      lumine.config.set(keyPath, false);
      expect(lumine.config.get(keyPath)).toBe(false);
    });
  }
});

describe("ide-graphql package assets", () => {
  const root = path.join(__dirname, "..");
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
  const pkg = require("../package.json");
  const readme = read("README.md");

  it("uses one canonical short description", () => {
    expect(readme.split(/\r?\n/).slice(0, 3)).toEqual(["# ide-graphql", "", pkg.description]);
    expect(pkg.description).toBe("GraphQL language-server adapter.");
    expect(pkg.description.length).toBeLessThan(80);
  });

  it("publishes under lumine-code with an MIT license", () => {
    expect(pkg.author).toBe("lumine-code");
    expect(pkg.repository).toBe("https://github.com/lumine-code/ide-graphql");
    expect(pkg.bugs.url).toBe("https://github.com/lumine-code/ide-graphql/issues");
    expect(read("LICENSE")).toContain("Copyright (c) 2026 lumine-code");
  });

  it("pins both runtime dependencies exactly", () => {
    expect(pkg.dependencies).toEqual({
      graphql: "16.14.2",
      "graphql-language-service-cli": "3.5.0",
    });
    for (const version of Object.values(pkg.dependencies))
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("declares every setting read by the adapter", () => {
    const lookup = (keyPath) =>
      keyPath
        .split(".")
        .reduce(
          (schema, key) => (schema === pkg.configSchema ? schema : schema?.properties)?.[key],
          pkg.configSchema,
        );
    const used = [...read("lib/main.js").matchAll(/setting\("([A-Za-z.]+)"\)/g)].map(
      (match) => match[1],
    );
    for (const keyPath of new Set(used))
      expect(`${keyPath}: ${Boolean(lookup(keyPath))}`).toBe(`${keyPath}: true`);
  });

  it("has no legacy editor imports or branding", () => {
    for (const file of ["README.md", "package.json", "lib/main.js"])
      expect(read(file)).not.toMatch(/require\(["']atom["']\)|\bPulsar\b|atom-ide/);
  });
});
