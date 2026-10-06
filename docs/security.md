The adapter keeps the official GraphQL server and applies tested fixes to its dependencies.

## Dependency fixes

Bundled and managed npm installations use these exact dependency overrides. Managed installations seed their own npm manifest with the same policy before installing the server; npm creates the dependency tree and lockfile.

| Dependency           | Version | Fixed advisory                                                                          |
| -------------------- | ------- | --------------------------------------------------------------------------------------- |
| @graphql-tools/utils | 12.0.3  | [Prototype pollution in mergeDeep](https://github.com/advisories/GHSA-7mx3-vvmw-hjmv)   |
| source-map-js        | 1.2.2   | [Invalid indexed source-map offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |

These fixes cover the bundled server and new managed installations. Remove an older managed copy and install it again to apply them. A custom Server Path uses that server's own dependency policy.

## Remaining upstream advisory

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) affects braces through 3.0.3, and upstream has not published a patched release. The installed GraphQL server reaches it through fast-glob and through GraphQL configuration loaders using globby; both paths reach micromatch and then braces. Deeply nested glob patterns can exhaust the process stack.

The ten remaining high npm audit entries propagate this one underlying advisory through its dependents. The project accepts this upstream exception while retaining the official server; it does not fork braces, replace the server, or downgrade to a version outside the advisory's reported range. Schema and document glob patterns should come from trusted project configuration.

CI runs `npm run audit:check`. It accepts only this exact advisory and fails on any other reported root advisory, including a recurrence of either fixed issue.
