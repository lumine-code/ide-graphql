The adapter keeps the official GraphQL server and applies tested fixes to its dependencies.

## Dependency fixes

Bundled and managed npm installations use these exact dependency overrides. Managed installations seed their own npm manifest with the same policy before installing the server; npm creates the dependency tree and lockfile.

| Dependency           | Version | Fixed advisory                                                                          |
| -------------------- | ------- | --------------------------------------------------------------------------------------- |
| @graphql-tools/utils | 12.0.3  | [Prototype pollution in mergeDeep](https://github.com/advisories/GHSA-7mx3-vvmw-hjmv)   |
| source-map-js        | 1.2.2   | [Invalid indexed source-map offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |

These fixes cover the bundled server and new managed installations. Remove an older managed copy and install it again to apply them. A custom Server Path uses that server's own dependency policy.

The CLI 4 release candidate still includes loaders that use APIs removed by `@graphql-tools/utils` 13. Keep the patched 12.0.3 override until the upstream server updates those loaders and passes the integration and security tests with utils 13. The source-map override also remains necessary for the server's current dependency tree.

## Audit policy

Full and production-only npm audits reported no vulnerabilities when this dependency tree was qualified on October 25, 2026. The tree still includes `braces` 3.0.3: GitHub [withdrew GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) on October 23, 2026 because it was not practically exploitable. The cleared audit reflects that advisory withdrawal; it is not evidence that this migration removed braces or fixed its recursion behavior.

CI runs `npm run audit:check` and rejects every reported advisory. There are no accepted advisory exceptions.
