const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRequire } = require("module");
const { installServer, latestServerVersion } = require("../lib/server");

describe("GraphQL managed dependency policy", () => {
  let storagePath;
  let api;
  let signal;

  beforeEach(() => {
    storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "ide-graphql-install-"));
    signal = new AbortController().signal;
    api = {
      signal,
      npmPackageLatestVersion: jasmine.createSpy("latest").and.resolveTo("3.5.0"),
      npmPackageInstalledVersion: jasmine.createSpy("installed").and.returnValue("3.5.0"),
      npmInstallPackage: jasmine.createSpy("install").and.callFake(async () => {
        const manifest = JSON.parse(
          fs.readFileSync(path.join(storagePath, "package.json"), "utf8"),
        );
        expect(manifest.private).toBe(true);
        expect(manifest.overrides).toEqual(require("../package.json").overrides);
      }),
      setServerInstallationStatus: jasmine.createSpy("status"),
    };
  });

  afterEach(() => fs.rmSync(storagePath, { recursive: true, force: true }));

  it("seeds dependency fixes before installing the runtime and requested official CLI", async () => {
    const result = await installServer({ storagePath, version: "3.5.0", api, signal });
    expect(api.npmPackageLatestVersion).not.toHaveBeenCalled();
    expect(api.npmInstallPackage.calls.allArgs()).toEqual([
      ["graphql", "16.14.2", storagePath, { signal }],
      ["graphql-language-service-cli", "3.5.0", storagePath, { signal }],
    ]);
    expect(result).toEqual({
      module: "node_modules/graphql-language-service-cli/package.json",
      version: "3.5.0",
    });
  });

  it("discovers the latest official CLI and records its installed version", async () => {
    api.npmPackageInstalledVersion.and.returnValue("3.5.1");
    const result = await installServer({ storagePath, api, signal });
    expect(api.npmPackageLatestVersion).toHaveBeenCalledOnceWith("graphql-language-service-cli", {
      signal,
    });
    expect(result.version).toBe("3.5.1");
    expect(await latestServerVersion(api)).toBe("3.5.0");
  });

  it("cancels before installing the CLI when the runtime installation is interrupted", async () => {
    const controller = new AbortController();
    const reason = new Error("installation cancelled");
    api.npmInstallPackage.and.callFake(async () => controller.abort(reason));
    await expectAsync(
      installServer({ storagePath, api, signal: controller.signal }),
    ).toBeRejectedWith(reason);
    expect(api.npmInstallPackage).toHaveBeenCalledTimes(1);
    expect(api.npmPackageInstalledVersion).not.toHaveBeenCalled();
  });

  it("refuses to report an installation without an installed CLI version", async () => {
    api.npmPackageInstalledVersion.and.returnValue(null);
    await expectAsync(installServer({ storagePath, api, signal })).toBeRejectedWithError(
      /no CLI version/,
    );
  });
});

describe("GraphQL patched runtime dependencies", () => {
  const cliRequire = createRequire(require.resolve("graphql-language-service-cli/package.json"));
  const serverRequire = createRequire(
    cliRequire.resolve("graphql-language-service-server/package.json"),
  );

  it("does not merge prototype-chain keys into the process's Object prototype", () => {
    const { mergeDeep } = serverRequire("@graphql-tools/utils");
    try {
      const merged = mergeDeep([
        { valid: { value: 1 } },
        JSON.parse('{"constructor":{"prototype":{"ideGraphqlAuditMarker":true}}}'),
      ]);
      expect(merged.valid.value).toBe(1);
      expect(Object.hasOwn(merged, "constructor")).toBe(false);
      expect(Object.prototype.ideGraphqlAuditMarker).toBeUndefined();
    } finally {
      delete Object.prototype.ideGraphqlAuditMarker;
    }
  });

  it("rejects unsafe indexed source-map offsets before consuming mappings", () => {
    const { SourceMapConsumer } = serverRequire("source-map-js");
    for (const line of [-1, Infinity, NaN, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(
        () =>
          new SourceMapConsumer({
            version: 3,
            sections: [
              {
                offset: { line, column: 0 },
                map: { version: 3, sources: [], names: [], mappings: "" },
              },
            ],
          }),
      ).toThrow();
    }
  });
});
