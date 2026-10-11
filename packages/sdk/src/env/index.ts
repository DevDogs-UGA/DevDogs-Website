/**
 * The env registry: `declare()`/`define()` for building a manifest, the
 * accessors that read it back, and `createEnv` (a straight re-export of
 * `@t3-oss/env-nextjs`) to validate the values at run time.
 *
 * The target table and `resolveEnvironment` are here because the apps' own
 * `env.ts` files call them at boot. Loading env files, sessions, the Worker
 * env builder and `with-env` are tooling and ship in `@devdogsuga/devtools`;
 * they import `./targets` and `./derivation` by subpath (bundled), and read
 * the registry through the repo's copy of this module.
 */
export * from "./nextjs.js";
export {
  declarations,
  declare,
  define,
  envRegistry,
  metaOf,
  resetRegistry,
  storableKeys,
  applyOnlyKeys,
  buildKeys,
  BuildKeyError,
  planOnlyKeys,
  localStackKeys,
  mintedKeys,
  narrowedKeys,
  neverSecretKeys,
  neverStoreKeys,
  variableKeys,
  variables,
  UndeclaredVariableError,
  type DefineMeta,
  type EnvEntry,
  type EnvMeta,
  type EnvScope,
  type EnvSecrecy,
  type EnvTier,
  type Manifest,
} from "./define.js";
export { derivationOf, envReferences, expandReferences } from "./derivation.js";
export {
  DEPLOY_ENVIRONMENTS,
  ENV_TARGETS,
  TARGETS,
  VAULT_TARGETS,
  fileFor,
  holdsOnlyNarrowedKeys,
  isDeployEnvironment,
  isEnvTarget,
  isGuarded,
  isVaultTarget,
  projectFor,
  resolveEnvironment,
  UnknownEnvironmentError,
  type DeployEnvironment,
  type EnvTarget,
  type TargetSpec,
  type VaultTarget,
} from "./targets.js";
