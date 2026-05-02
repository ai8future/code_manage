# Missing Health Dependency

`src/app/api/health/route.ts` imports `@ai8future/health`, but the package was not declared directly. Clean installs could fail or rely on an accidental transitive chassis package. Added the direct dependency and refreshed the lockfile.
