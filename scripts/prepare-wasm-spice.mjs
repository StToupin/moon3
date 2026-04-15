import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");

const UPSTREAM_REPO = "arturania/cspice";
const UPSTREAM_COMMIT = "53bce326267dd2d6d567de92b15869c9ed7d0629";
const UPSTREAM_ARCHIVE_URL = `https://codeload.github.com/${UPSTREAM_REPO}/tar.gz/${UPSTREAM_COMMIT}`;
const BUILD_SIGNATURE = "full-app-v1";

const CACHE_DIR = resolve(APP_DIR, ".cache/wasm-spice", UPSTREAM_COMMIT);
const GENERATED_DIR = resolve(APP_DIR, "src/spice/generated");
const PUBLIC_SPICE_DIR = resolve(APP_DIR, "public/spice");
const GENERATED_JS_PATH = join(GENERATED_DIR, "cspice.js");
const GENERATED_TYPES_PATH = join(GENERATED_DIR, "cspice.d.ts");
const GENERATED_WASM_PATH = join(PUBLIC_SPICE_DIR, "cspice.wasm");
const BUILD_INFO_PATH = join(GENERATED_DIR, ".build-info.json");
const CACHED_ARCHIVE_PATH = join(CACHE_DIR, "cspice.tar.gz");
const CACHED_JS_PATH = join(CACHE_DIR, "cspice.js");
const CACHED_WASM_PATH = join(CACHE_DIR, "cspice.wasm");
const CACHED_BUILD_INFO_PATH = join(CACHE_DIR, "build-info.json");

const KERNEL_MAPPINGS = [
  {
    source: resolve(APP_DIR, "spice/naif0012.tls"),
    destination: resolve(PUBLIC_SPICE_DIR, "kernels/lsk/naif0012.tls"),
  },
  {
    source: resolve(APP_DIR, "spice/de432s.bsp"),
    destination: resolve(PUBLIC_SPICE_DIR, "kernels/spk/de432s.bsp"),
  },
  {
    source: resolve(APP_DIR, "spice/pck00010.tpc"),
    destination: resolve(PUBLIC_SPICE_DIR, "kernels/pck/pck00010.tpc"),
  },
  {
    source: resolve(APP_DIR, "spice/earth_200101_990825_predict.bpc"),
    destination: resolve(PUBLIC_SPICE_DIR, "kernels/pck/earth_200101_990825_predict.bpc"),
  },
  {
    source: resolve(APP_DIR, "spice/earth_assoc_itrf93.tf"),
    destination: resolve(PUBLIC_SPICE_DIR, "kernels/fk/earth_assoc_itrf93.tf"),
  },
];

const CSPICE_TYPES = `declare const createCSpice: (options?: {
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<unknown>;

export default createCSpice;
`;

const FORCE = process.argv.includes("--force");

function log(message) {
  console.log(`[prepare-wasm-spice] ${message}`);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function fileExists(path) {
  return existsSync(path) && statSync(path).isFile();
}

function hasLocalBuildToolchain() {
  return hasCommand("emcc") && hasCommand("tcsh") && hasCommand("tar");
}

function hasCommand(command) {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readBuildInfo() {
  if (!fileExists(BUILD_INFO_PATH)) {
    return null;
  }

  return JSON.parse(readFileSync(BUILD_INFO_PATH, "utf8"));
}

function readCachedBuildInfo() {
  if (!fileExists(CACHED_BUILD_INFO_PATH)) {
    return null;
  }

  return JSON.parse(readFileSync(CACHED_BUILD_INFO_PATH, "utf8"));
}

function isArtifactBuildCurrent() {
  if (!fileExists(GENERATED_JS_PATH) || !fileExists(GENERATED_WASM_PATH)) {
    return false;
  }

  const buildInfo = readBuildInfo();
  return (
    buildInfo?.upstreamCommit === UPSTREAM_COMMIT &&
    buildInfo?.buildSignature === BUILD_SIGNATURE
  );
}

function isCachedArtifactBuildCurrent() {
  if (!fileExists(CACHED_JS_PATH) || !fileExists(CACHED_WASM_PATH)) {
    return false;
  }

  const buildInfo = readCachedBuildInfo();
  return (
    buildInfo?.upstreamCommit === UPSTREAM_COMMIT &&
    buildInfo?.buildSignature === BUILD_SIGNATURE
  );
}

function buildInfoContents() {
  return JSON.stringify(
    {
      upstreamRepo: UPSTREAM_REPO,
      upstreamCommit: UPSTREAM_COMMIT,
      buildSignature: BUILD_SIGNATURE,
    },
    null,
    2,
  );
}

function syncKernels() {
  for (const kernel of KERNEL_MAPPINGS) {
    if (!fileExists(kernel.source)) {
      throw new Error(`Missing kernel source file: ${kernel.source}`);
    }

    ensureDir(dirname(kernel.destination));
    copyFileSync(kernel.source, kernel.destination);
  }
}

function patchGeneratedJs(jsPath) {
  const contents = readFileSync(jsPath, "utf8");
  const patchedContents = contents.replace(
    'return new URL("cspice.wasm",import.meta.url).href',
    'return "cspice.wasm"',
  );

  writeFileSync(jsPath, patchedContents);
}

async function downloadUpstreamArchive(targetPath) {
  log(`Downloading ${UPSTREAM_REPO}@${UPSTREAM_COMMIT}`);
  const response = await fetch(UPSTREAM_ARCHIVE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to download upstream archive: ${response.status} ${response.statusText}`,
    );
  }

  const archive = Buffer.from(await response.arrayBuffer());
  writeFileSync(targetPath, archive);
}

async function ensureCachedArchive() {
  ensureDir(CACHE_DIR);

  if (!FORCE && fileExists(CACHED_ARCHIVE_PATH)) {
    return;
  }

  await downloadUpstreamArchive(CACHED_ARCHIVE_PATH);
}

function copyArtifacts(sourceJsPath, sourceWasmPath) {
  ensureDir(GENERATED_DIR);
  ensureDir(PUBLIC_SPICE_DIR);
  copyFileSync(sourceJsPath, GENERATED_JS_PATH);
  copyFileSync(sourceWasmPath, GENERATED_WASM_PATH);
  writeFileSync(BUILD_INFO_PATH, buildInfoContents());
}

function hydrateArtifactsFromCache() {
  if (!isCachedArtifactBuildCurrent()) {
    return false;
  }

  log("Restoring CSPICE JS/WASM artifacts from local cache");
  copyArtifacts(CACHED_JS_PATH, CACHED_WASM_PATH);
  return true;
}

async function rebuildArtifacts() {
  if (!hasLocalBuildToolchain()) {
    throw new Error(
      "Rebuilding CSPICE WASM requires emcc, tcsh, and tar to be installed and available on PATH.",
    );
  }

  const tempRoot = mkdtempSync(join(tmpdir(), "moon2-cspice-"));
  const archivePath = join(tempRoot, "cspice.tar.gz");

  try {
    await ensureCachedArchive();
    copyFileSync(CACHED_ARCHIVE_PATH, archivePath);
    execFileSync("tar", ["-xzf", archivePath, "-C", tempRoot], {
      stdio: "inherit",
    });

    const checkoutDir = join(tempRoot, `cspice-${UPSTREAM_COMMIT}`);
    const srcDir = join(checkoutDir, "src");
    const wasmDir = join(checkoutDir, "wasm");
    const tempJsPath = join(tempRoot, "cspice.js");

    log("Building libcspice_wasm.a");
    execFileSync("tcsh", ["./mk_wasm.csh"], {
      cwd: srcDir,
      stdio: "inherit",
    });

    log("Building browser JS/WASM wrapper");
    execFileSync(
      "emcc",
      [
        "../lib/libcspice_wasm.a",
        "-o",
        tempJsPath,
        "--pre-js",
        "./pre.js",
        "-O2",
        "-s",
        "MODULARIZE=1",
        "-s",
        "EXPORT_ES6=1",
        "-s",
        "ENVIRONMENT=web",
        "-s",
        "INITIAL_MEMORY=134217728",
        "-s",
        "ALLOW_MEMORY_GROWTH=1",
        "-s",
        "EXPORT_NAME=CSpice",
        "-s",
        'EXPORTED_RUNTIME_METHODS=["FS","ccall","cwrap","getValue","UTF8ToString"]',
        "-s",
        'EXPORTED_FUNCTIONS=["_malloc","_free","_tkvrsn_c","_erract_c","_errprt_c","_failed_c","_getmsg_c","_reset_c","_furnsh_c","_str2et_c","_spkez_c","_vnorm_c","_pxform_c","_bodvrd_c","_latrec_c","_srfrec_c"]',
      ],
      {
        cwd: wasmDir,
        stdio: "inherit",
      },
    );

    patchGeneratedJs(tempJsPath);

    ensureDir(CACHE_DIR);
    copyFileSync(tempJsPath, CACHED_JS_PATH);
    copyFileSync(join(tempRoot, "cspice.wasm"), CACHED_WASM_PATH);
    writeFileSync(CACHED_BUILD_INFO_PATH, buildInfoContents());
    copyArtifacts(CACHED_JS_PATH, CACHED_WASM_PATH);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  ensureDir(CACHE_DIR);
  ensureDir(GENERATED_DIR);
  ensureDir(PUBLIC_SPICE_DIR);

  let restoredFromCache = false;
  const artifactsAreCurrent = isArtifactBuildCurrent();

  let shouldRebuildArtifacts = FORCE || !artifactsAreCurrent;
  if (!FORCE && !artifactsAreCurrent) {
    restoredFromCache = hydrateArtifactsFromCache();
    shouldRebuildArtifacts = !restoredFromCache;
  }

  if (shouldRebuildArtifacts) {
    await rebuildArtifacts();
  } else if (!restoredFromCache) {
    log("CSPICE JS/WASM artifacts are up to date");
  }

  syncKernels();
  writeFileSync(GENERATED_TYPES_PATH, CSPICE_TYPES);
  log("WASM SPICE assets are ready");
}

main().catch((error) => {
  console.error(
    `[prepare-wasm-spice] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
