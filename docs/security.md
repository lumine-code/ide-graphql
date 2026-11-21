The adapter keeps the official GraphQL server and applies tested fixes to its dependencies.

## Dependency fixes

Bundled and managed npm installations use the same dependency policy. Managed installations seed their own npm manifest before installing the server, and npm creates the dependency tree and lockfile.

| Dependency                                   | Version           | Fixed advisory                                                                                    |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| @graphql-tools/utils                         | 13.2.2 and 12.1.0 | [Prototype pollution in mergeDeep](https://github.com/advisories/GHSA-7mx3-vvmw-hjmv)             |
| source-map-js                                | 1.2.4             | [Invalid indexed source-map offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)           |
| minimatch in graphql-config                  | 11.0.9            | [Glob-pattern preprocessing denial of service](https://github.com/advisories/GHSA-g3hv-75wg-m249) |
| minimatch in ESLint and @eslint/config-array | 11.0.9            | [Glob-pattern preprocessing denial of service](https://github.com/advisories/GHSA-g3hv-75wg-m249) |

These fixes cover the bundled server and new managed installations. Remove an older managed copy and install it again to apply them. A custom Server Path uses that server's own dependency policy.

For GraphQL Language Service Server 3.0.2, the manifest selects the official `graphql-config` 6.0.0, `@graphql-tools/load` 9.1.3 and `@graphql-tools/code-file-loader` 9.1.2 together. They use `@graphql-tools/utils` 13 through their declared ranges. Gateway packages used by the URL schema loader resolve `utils` 12.1.0 through their own ranges. A separate override selects 12.1.0 for requests below 12.0.3 in older CLI prereleases. The source-map override preserves the tested indexed-offset validation.

The minimatch override targets graphql-config and the two development lint consumers, ESLint and @eslint/config-array, whose published ranges still select vulnerable minimatch 10. They use the supported matching function or Minimatch class; the complete live-server suite validates schema discovery, document matching and embedded GraphQL with minimatch 11, and lint validates the development consumers. Do not apply a blanket minimatch override: version 11 removed APIs used by other consumers.

## Audit policy

Full and production-only npm audits of the bundled CLI 4.0.1 tree reported no vulnerabilities on November 21, 2026. Explicit installs of the older CLI 4.0.0-beta.1 and 4.0.0-rc.0 still report advisories through their older `glob` and `minimatch` dependencies. GitHub [withdrew the advisory for `braces` 3.0.3](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) on October 23, 2026 after reviewing practical exploitability.

CI runs `npm run audit:check` and rejects every reported advisory. There are no accepted advisory exceptions.
