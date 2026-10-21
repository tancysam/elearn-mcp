#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginTargets = [
  {
    name: "Claude Code",
    root: path.join(projectRoot, "plugin-package", "claude", "smu-elearn"),
  },
];
const stagingDirectory = await mkdtemp(
  path.join(os.tmpdir(), "elearn-mcp-plugin-runtime-"),
);
const targetStagingDirectories = [];

function parseJson(contents, filename) {
  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not parse ${filename}`, { cause: error });
  }
}

function runNpm(directory, args, operation) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmCache =
    process.env.npm_config_cache ?? path.join(os.tmpdir(), "elearn-mcp-npm-cache");
  const childEnvironment = {
    ...process.env,
    INIT_CWD: directory,
    npm_config_cache: npmCache,
    npm_config_local_prefix: directory,
  };

  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, args, {
      cwd: directory,
      env: childEnvironment,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `${operation} was terminated by ${signal}`
            : `${operation} exited with status ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

try {
  const packagePath = path.join(projectRoot, "package.json");
  const lockfilePath = path.join(projectRoot, "package-lock.json");
  const rootPackage = parseJson(await readFile(packagePath, "utf8"), packagePath);
  const rootLockfile = parseJson(await readFile(lockfilePath, "utf8"), lockfilePath);
  const lockedPackages = rootLockfile.packages;

  if (!lockedPackages || !lockedPackages[""]) {
    throw new Error("The root package-lock.json does not contain npm lockfile package metadata");
  }

  const runtimeDependencies = Object.fromEntries(
    Object.keys(rootPackage.dependencies ?? {})
      .sort()
      .map((dependencyName) => {
        const lockedDependency = lockedPackages[`node_modules/${dependencyName}`];
        if (!lockedDependency?.version) {
          throw new Error(`No locked version was found for ${dependencyName}`);
        }
        return [dependencyName, lockedDependency.version];
      }),
  );

  const runtimePackage = {
    name: "@smu/elearn-mcp-plugin-runtime",
    version: rootPackage.version,
    private: true,
    license: rootPackage.license,
    description: "Generated runtime for the SMU eLearn Claude Code plugin",
    type: rootPackage.type,
    scripts: {
      start: "node dist/src/server.js",
      auth: "node dist/src/auth.js",
      "test:live": "node scripts/live-run.mjs",
    },
    engines: rootPackage.engines,
    dependencies: runtimeDependencies,
  };

  const runtimeLockfile = structuredClone(rootLockfile);
  runtimeLockfile.name = runtimePackage.name;
  runtimeLockfile.version = runtimePackage.version;
  runtimeLockfile.packages[""] = {
    name: runtimePackage.name,
    version: runtimePackage.version,
    license: runtimePackage.license,
    dependencies: runtimeDependencies,
    engines: runtimePackage.engines,
  };

  await mkdir(path.join(stagingDirectory, "scripts"), { recursive: true });
  await cp(path.join(projectRoot, "dist"), path.join(stagingDirectory, "dist"), {
    recursive: true,
  });
  await cp(
    path.join(projectRoot, "scripts", "live-run.mjs"),
    path.join(stagingDirectory, "scripts", "live-run.mjs"),
  );
  await writeFile(
    path.join(stagingDirectory, "package.json"),
    `${JSON.stringify(runtimePackage, null, 2)}\n`,
  );
  await writeFile(
    path.join(stagingDirectory, "package-lock.json"),
    `${JSON.stringify(runtimeLockfile, null, 2)}\n`,
  );

  await runNpm(
    stagingDirectory,
    [
      "install",
      "--package-lock-only",
      "--omit=dev",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
    ],
    "npm install --package-lock-only",
  );
  await runNpm(
    stagingDirectory,
    ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
    "npm ci",
  );
  await stat(path.join(stagingDirectory, "dist", "src", "server.js"));
  await stat(path.join(stagingDirectory, "node_modules"));

  for (const target of pluginTargets) {
    await mkdir(target.root, { recursive: true });
    const targetStagingDirectory = await mkdtemp(
      path.join(target.root, ".mcp-build-"),
    );
    targetStagingDirectories.push(targetStagingDirectory);

    const stagedRuntimeDirectory = path.join(targetStagingDirectory, "mcp");
    const runtimeDirectory = path.join(target.root, "mcp");
    await cp(stagingDirectory, stagedRuntimeDirectory, { recursive: true });
    await stat(path.join(stagedRuntimeDirectory, "dist", "src", "server.js"));
    await stat(path.join(stagedRuntimeDirectory, "node_modules"));

    await rm(runtimeDirectory, { recursive: true, force: true });
    await rename(stagedRuntimeDirectory, runtimeDirectory);
    await rm(targetStagingDirectory, { recursive: true, force: true });
    targetStagingDirectories.splice(
      targetStagingDirectories.indexOf(targetStagingDirectory),
      1,
    );

    console.log(`Generated ${target.name} plugin runtime at ${runtimeDirectory}`);
  }
} finally {
  await Promise.all([
    rm(stagingDirectory, { recursive: true, force: true }),
    ...targetStagingDirectories.map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  ]);
}
