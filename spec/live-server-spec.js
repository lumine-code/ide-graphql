const fs = require("fs");
const os = require("os");
const path = require("path");
const { fileURLToPath } = require("url");
const main = require("../lib/main");
const {
  LiveLspClient,
  fileUri,
  position,
  positionParams,
  replaceOnce,
} = require("./helpers/live-lsp-client");

const registerAdapter = () => {
  let adapter;
  const disposable = main.consumeIdeClient({
    registerAdapter(registered) {
      adapter = registered;
      return { dispose() {} };
    },
    getSessions: () => [],
    restart: async () => {},
  });
  return { adapter, disposable };
};

describe("ide-graphql bundled server", () => {
  let adapter, client, disposable, rootPath;
  let originalTimeout;

  beforeAll(() => {
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 45000;
  });

  afterAll(() => {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  beforeEach(async () => {
    jasmine.useRealClock();
    await lumine.packages.activatePackage("ide-graphql");
    ({ adapter, disposable } = registerAdapter());
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), "ide-graphql-live-"));
    fs.cpSync(path.join(__dirname, "fixtures", "drive"), rootPath, {
      recursive: true,
    });
    client = new LiveLspClient(adapter, rootPath);
  });

  afterEach(async () => {
    await client.stop();
    disposable.dispose();
    await fs.promises.rm(rootPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
    await lumine.packages.deactivatePackage("ide-graphql");
  });

  it("advertises every protocol feature and requests both settings sections", async () => {
    const { capabilities } = await client.start();
    expect(capabilities.textDocumentSync).toBe(1);
    expect(capabilities.completionProvider).toEqual({
      resolveProvider: true,
      triggerCharacters: [" ", ":", "$", "(", "@", "\n"],
    });
    expect(capabilities.hoverProvider).toBe(true);
    expect(capabilities.definitionProvider).toBe(true);
    expect(capabilities.documentSymbolProvider).toBe(true);
    expect(capabilities.workspaceSymbolProvider).toBe(true);
    expect(capabilities.workspace.workspaceFolders).toEqual({
      supported: true,
      changeNotifications: true,
    });
    expect(client.configurationRequests.map(({ section }) => section)).toEqual(
      jasmine.arrayContaining(["graphql-config", "vscode-graphql"]),
    );
  });

  it("exercises diagnostics, completion, resolve, hover, definitions and symbols", async () => {
    await client.start();
    const filePath = path.join(rootPath, "query.graphql");
    const source = fs.readFileSync(filePath, "utf8");
    const uri = fileUri(filePath);
    client.open(uri, "graphql", source);

    const diagnostics = await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(
            ({ params }) =>
              params.uri === uri &&
              params.diagnostics.some(({ message }) => message.includes("unknownField")),
          )?.params.diagnostics,
      "unknown GraphQL field diagnostic",
    );
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].severity).toBe(1);
    expect(diagnostics[0].range.start).toEqual(position(4, 4));

    const completion = await client.request("textDocument/completion", {
      textDocument: { uri },
      position: position(4, 4),
      context: { triggerKind: 1 },
    });
    expect(completion.isIncomplete).toBe(false);
    expect(completion.items.map(({ label }) => label)).toEqual(
      jasmine.arrayContaining(["id", "name", "friends"]),
    );
    const name = completion.items.find(({ label }) => label === "name");
    expect(await client.request("completionItem/resolve", name)).toEqual(name);

    const hover = await client.request("textDocument/hover", positionParams(uri, 1, 3));
    expect(JSON.stringify(hover.contents)).toContain("Find a person by ID");
    expect(JSON.stringify(hover.contents)).toContain("Query.person: Person");

    const definition = await client.request("textDocument/definition", positionParams(uri, 1, 3));
    expect(definition.length).toBeGreaterThan(0);
    expect(fileURLToPath(definition[0].uri).toLowerCase()).toBe(
      path.join(rootPath, "schema.graphql").toLowerCase(),
    );
    expect(definition[0].range.start.line).toBe(10);

    const documentSymbols = await client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    expect(documentSymbols.map(({ name }) => name)).toEqual(
      jasmine.arrayContaining(["PersonCard", "PersonName"]),
    );
    const workspaceSymbols = await client.request("workspace/symbol", {
      query: "Person",
    });
    expect(workspaceSymbols.map(({ name }) => name)).toEqual(
      jasmine.arrayContaining(["PersonCard", "PersonName", "Person"]),
    );
  });

  it("revalidates full-sync changes and saves before releasing a document", async () => {
    await client.start();
    const filePath = path.join(rootPath, "query.graphql");
    const source = fs.readFileSync(filePath, "utf8");
    const uri = fileUri(filePath);
    client.open(uri, "graphql", source);
    await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .some(({ params }) => params.uri === uri && params.diagnostics.length === 1),
      "initial diagnostics",
    );

    const fixed = replaceOnce(source, "    unknownField\n");
    client.change(uri, fixed, 2);
    await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .some(({ params }) => params.uri === uri && params.diagnostics.length === 0),
      "cleared diagnostics",
    );

    const broken = `${fixed}\nquery Broken {`;
    client.change(uri, broken, 3);
    const syntax = await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(
            ({ params }) =>
              params.uri === uri &&
              params.diagnostics.some(({ message }) => message.includes("Expected Name")),
          )?.params.diagnostics,
      "syntax diagnostics",
    );
    expect(syntax.some(({ source: value }) => value === "GraphQL: Syntax")).toBe(true);

    client.change(uri, fixed, 4);
    fs.writeFileSync(filePath, fixed);
    client.save(uri);
    await client.waitFor(
      () =>
        client.messages("textDocument/publishDiagnostics").slice(-1)[0]?.params.diagnostics
          .length === 0,
      "saved clean document",
    );
    client.closeDocument(uri);
  });

  it("parses GraphQL template literals inside TypeScript", async () => {
    await client.start();
    const filePath = path.join(rootPath, "embedded.ts");
    const source = fs.readFileSync(filePath, "utf8");
    const uri = fileUri(filePath);
    client.open(uri, "typescript", source);
    const diagnostics = await client.waitFor(
      () =>
        client
          .messages("textDocument/publishDiagnostics")
          .find(
            ({ params }) =>
              params.uri === uri &&
              params.diagnostics.some(({ message }) => message.includes("unknownEmbeddedField")),
          )?.params.diagnostics,
      "embedded GraphQL diagnostics",
    );
    expect(diagnostics[0].range.start).toEqual(position(4, 6));

    const completion = await client.request("textDocument/completion", {
      textDocument: { uri },
      position: position(4, 6),
      context: { triggerKind: 1 },
    });
    expect(completion.items.map(({ label }) => label)).toContain("friends");
    const hover = await client.request("textDocument/hover", positionParams(uri, 2, 5));
    expect(JSON.stringify(hover.contents)).toContain("Find a person by ID");
    const symbols = await client.request("textDocument/documentSymbol", {
      textDocument: { uri },
    });
    expect(symbols.map(({ name }) => name)).toContain("EmbeddedPerson");
  });

  it("reloads changed workspace configuration through the nonstandard section split", async () => {
    await client.start();
    const previousRequests = client.configurationRequests.length;
    lumine.config.set("ide-graphql.languageService.debug", true);
    client.notify("workspace/didChangeConfiguration", {
      settings: adapter.getSettings(),
    });
    await client.waitFor(
      () => client.configurationRequests.length >= previousRequests + 2,
      "GraphQL configuration reload",
    );
    const latest = client.configurationRequests
      .slice(previousRequests)
      .map(({ section }) => section);
    expect(latest).toEqual(jasmine.arrayContaining(["graphql-config", "vscode-graphql"]));
    expect(adapter.getWorkspaceConfiguration("vscode-graphql").debug).toBe(true);
  });
});
