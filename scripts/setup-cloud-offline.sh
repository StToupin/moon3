#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

REQUIRED_NODE_MAJOR=22
REQUIRED_CMDS=(python3 tar tcsh emcc curl)

run_as_root() {
  if [[ "${EUID}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Error: need root privileges to install missing system packages: $*" >&2
    exit 1
  fi
}

install_system_deps_if_possible() {
  local missing=()
  local cmd
  for cmd in "${REQUIRED_CMDS[@]}"; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done

  if [[ ${#missing[@]} -eq 0 ]]; then
    return
  fi

  echo "[setup-cloud-offline] Missing system commands: ${missing[*]}"

  if command -v apt-get >/dev/null 2>&1; then
    echo "[setup-cloud-offline] Installing system dependencies with apt-get"
    run_as_root apt-get update
    run_as_root apt-get install -y \
      build-essential \
      curl \
      emscripten \
      python3 \
      python3-venv \
      tar \
      tcsh
    return
  fi

  echo "Error: automatic package installation is only implemented for apt-get environments." >&2
  echo "Please install manually: ${missing[*]}" >&2
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if (( NODE_MAJOR < REQUIRED_NODE_MAJOR )); then
  echo "Error: Node.js ${REQUIRED_NODE_MAJOR}+ is required. Found: $(node -v)" >&2
  exit 1
fi

install_system_deps_if_possible

echo "[setup-cloud-offline] Installing npm dependencies"
npm ci

echo "[setup-cloud-offline] Preparing WebAssembly SPICE assets and kernels"
npm run prepare:spice

echo "[setup-cloud-offline] Building production bundle"
npm run build

required_outputs=(
  "dist/index.html"
  "src/spice/generated/cspice.js"
  "public/spice/cspice.wasm"
  "public/spice/kernels/lsk/naif0012.tls"
  "public/spice/kernels/spk/de432s.bsp"
  "public/spice/kernels/pck/pck00010.tpc"
)

for path in "${required_outputs[@]}"; do
  if [[ ! -f "$path" ]]; then
    echo "Error: expected output missing: $path" >&2
    exit 1
  fi
done

echo "[setup-cloud-offline] Setup complete"
echo
echo "You can now start the app without internet access:"
echo "  npm run preview -- --host 0.0.0.0 --port 4174"
echo
echo "Example with custom port:"
echo "  PORT=8080 npm run preview -- --host 0.0.0.0 --port \"\${PORT}\""
