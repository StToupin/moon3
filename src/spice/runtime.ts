import { withBase } from "../basePath";

type SpiceReturnType = "number" | "string" | null;
type SpiceArgType = "number" | "string";

export type Vector3Tuple = [number, number, number];
export type Matrix3 = [Vector3Tuple, Vector3Tuple, Vector3Tuple];

interface SpiceModule {
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: string | Uint8Array): void;
  };
  _malloc(size: number): number;
  _free(ptr: number): void;
  UTF8ToString(ptr: number): string;
  ccall<T>(
    ident: string,
    returnType: SpiceReturnType,
    argTypes: SpiceArgType[],
    args: unknown[],
  ): T;
  getValue(ptr: number, type: string): number;
}

type SpiceFactory = (options?: {
  locateFile?: (path: string, prefix: string) => string;
}) => Promise<SpiceModule>;

const KERNELS = [
  {
    publicPath: withBase("spice/kernels/lsk/naif0012.tls"),
    mountedPath: "/kernels/naif0012.tls",
  },
  {
    publicPath: withBase("spice/kernels/spk/de432s.bsp"),
    mountedPath: "/kernels/de432s.bsp",
  },
  {
    publicPath: withBase("spice/kernels/pck/pck00010.tpc"),
    mountedPath: "/kernels/pck00010.tpc",
  },
  {
    publicPath: withBase("spice/kernels/pck/earth_200101_990825_predict.bpc"),
    mountedPath: "/kernels/earth_200101_990825_predict.bpc",
  },
  {
    publicPath: withBase("spice/kernels/fk/earth_assoc_itrf93.tf"),
    mountedPath: "/kernels/earth_assoc_itrf93.tf",
  },
] as const;

interface SpiceRuntime {
  module: SpiceModule;
  toolkitVersion: string;
  loadedKernels: string[];
}

export interface SpiceDiagnostics {
  toolkitVersion: string;
  loadedKernels: string[];
}

let modulePromise: Promise<SpiceModule> | null = null;
let runtimePromise: Promise<SpiceRuntime> | null = null;

function readCString(module: SpiceModule, ptr: number): string {
  return module.UTF8ToString(ptr);
}

function readFloat64(module: SpiceModule, ptr: number): number {
  return module.getValue(ptr, "double");
}

function readInt32(module: SpiceModule, ptr: number): number {
  return module.getValue(ptr, "i32");
}

function readFloat64Array(
  module: SpiceModule,
  ptr: number,
  length: number,
): number[] {
  return Array.from({ length }, (_, index) =>
    readFloat64(module, ptr + index * Float64Array.BYTES_PER_ELEMENT),
  );
}

function ensureSpiceCallSucceeded(module: SpiceModule, context: string) {
  const failed = module.ccall<number>("failed_c", "number", [], []);
  if (!failed) {
    return;
  }

  const messagePtr = module._malloc(2048);
  try {
    module.ccall("getmsg_c", null, ["string", "number", "number"], [
      "LONG",
      2048,
      messagePtr,
    ]);
    const message = readCString(module, messagePtr).trim();
    module.ccall("reset_c", null, [], []);
    throw new Error(`${context}: ${message || "SPICE reported an error"}`);
  } finally {
    module._free(messagePtr);
  }
}

async function getSpiceModule(): Promise<SpiceModule> {
  if (!modulePromise) {
    modulePromise = import("./generated/cspice.js")
      .then(async (module) => {
        const createSpice = module.default as SpiceFactory;
        const instance = await createSpice({
          locateFile: (path) => withBase(`spice/${path}`),
        });

        instance.ccall("erract_c", null, ["string", "number", "string"], [
          "SET",
          "RETURN".length + 1,
          "RETURN",
        ]);
        instance.ccall("errprt_c", null, ["string", "number", "string"], [
          "SET",
          "NONE".length + 1,
          "NONE",
        ]);

        return instance;
      })
      .catch((error) => {
        modulePromise = null;
        throw error;
      });
  }

  return modulePromise;
}

async function loadKernel(
  module: SpiceModule,
  publicPath: string,
  mountedPath: string,
) {
  const response = await fetch(publicPath);
  if (!response.ok) {
    throw new Error(`Unable to fetch kernel ${publicPath}`);
  }

  module.FS.writeFile(mountedPath, new Uint8Array(await response.arrayBuffer()));
  module.ccall("furnsh_c", null, ["string"], [mountedPath]);
  ensureSpiceCallSucceeded(module, `Failed to load ${mountedPath}`);
}

export async function getSpiceRuntime(
  onStage?: (stage: string) => void,
): Promise<SpiceRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      onStage?.("Booting CSPICE WebAssembly");
      const module = await getSpiceModule();

      try {
        module.FS.mkdir("/kernels");
      } catch {
        // The singleton runtime keeps the directory around after the first load.
      }

      onStage?.("Loading SPICE kernels");
      for (const kernel of KERNELS) {
        onStage?.(`Loading ${kernel.mountedPath}`);
        await loadKernel(module, kernel.publicPath, kernel.mountedPath);
      }

      return {
        module,
        toolkitVersion: module.ccall<string>(
          "tkvrsn_c",
          "string",
          ["string"],
          ["TOOLKIT"],
        ),
        loadedKernels: KERNELS.map((kernel) => kernel.mountedPath),
      };
    })().catch((error) => {
      runtimePromise = null;
      throw error;
    });
  }

  return runtimePromise;
}

export async function getSpiceDiagnostics(): Promise<SpiceDiagnostics> {
  const runtime = await getSpiceRuntime();
  return {
    toolkitVersion: runtime.toolkitVersion,
    loadedKernels: [...runtime.loadedKernels],
  };
}

export function formatSpiceTime(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");

  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
  ].join(" ");
}

export function str2et(runtime: SpiceRuntime, utc: string): number {
  const etPtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT);

  try {
    runtime.module.ccall("str2et_c", null, ["string", "number"], [utc, etPtr]);
    ensureSpiceCallSucceeded(runtime.module, `Failed to parse ${utc}`);
    return readFloat64(runtime.module, etPtr);
  } finally {
    runtime.module._free(etPtr);
  }
}

export function spkez(
  runtime: SpiceRuntime,
  target: number,
  et: number,
  frame: string,
  observer: number,
  aberrationCorrection = "NONE",
) {
  const statePtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT * 6);
  const lightTimePtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT);

  try {
    runtime.module.ccall("spkez_c", null, [
      "number",
      "number",
      "string",
      "string",
      "number",
      "number",
      "number",
    ], [
      target,
      et,
      frame,
      aberrationCorrection,
      observer,
      statePtr,
      lightTimePtr,
    ]);
    ensureSpiceCallSucceeded(runtime.module, "Failed to execute spkez_c");

    const state = readFloat64Array(runtime.module, statePtr, 6);
    return {
      positionKm: state.slice(0, 3) as Vector3Tuple,
      velocityKmPerSecond: state.slice(3, 6) as Vector3Tuple,
      lightTimeSeconds: readFloat64(runtime.module, lightTimePtr),
    };
  } finally {
    runtime.module._free(lightTimePtr);
    runtime.module._free(statePtr);
  }
}

export function pxform(
  runtime: SpiceRuntime,
  from: string,
  to: string,
  et: number,
): Matrix3 {
  const matrixPtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT * 9);

  try {
    runtime.module.ccall("pxform_c", null, ["string", "string", "number", "number"], [
      from,
      to,
      et,
      matrixPtr,
    ]);
    ensureSpiceCallSucceeded(runtime.module, "Failed to execute pxform_c");

    const values = readFloat64Array(runtime.module, matrixPtr, 9);
    return [
      [values[0], values[1], values[2]],
      [values[3], values[4], values[5]],
      [values[6], values[7], values[8]],
    ];
  } finally {
    runtime.module._free(matrixPtr);
  }
}

export function bodvrd(
  runtime: SpiceRuntime,
  bodyName: string,
  item: string,
  maxn: number,
): number[] {
  const valuesPtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT * maxn);
  const dimensionPtr = runtime.module._malloc(Int32Array.BYTES_PER_ELEMENT);

  try {
    runtime.module.ccall("bodvrd_c", null, ["string", "string", "number", "number", "number"], [
      bodyName,
      item,
      maxn,
      dimensionPtr,
      valuesPtr,
    ]);
    ensureSpiceCallSucceeded(runtime.module, "Failed to execute bodvrd_c");

    const dimension = readInt32(runtime.module, dimensionPtr);
    return readFloat64Array(runtime.module, valuesPtr, dimension);
  } finally {
    runtime.module._free(dimensionPtr);
    runtime.module._free(valuesPtr);
  }
}

export function latrec(
  runtime: SpiceRuntime,
  radius: number,
  longitudeRadians: number,
  latitudeRadians: number,
): Vector3Tuple {
  const resultPtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT * 3);

  try {
    runtime.module.ccall("latrec_c", null, ["number", "number", "number", "number"], [
      radius,
      longitudeRadians,
      latitudeRadians,
      resultPtr,
    ]);
    ensureSpiceCallSucceeded(runtime.module, "Failed to execute latrec_c");

    return readFloat64Array(runtime.module, resultPtr, 3) as Vector3Tuple;
  } finally {
    runtime.module._free(resultPtr);
  }
}

export function srfrec(
  runtime: SpiceRuntime,
  body: number,
  longitudeRadians: number,
  latitudeRadians: number,
): Vector3Tuple {
  const resultPtr = runtime.module._malloc(Float64Array.BYTES_PER_ELEMENT * 3);

  try {
    runtime.module.ccall("srfrec_c", null, ["number", "number", "number", "number"], [
      body,
      longitudeRadians,
      latitudeRadians,
      resultPtr,
    ]);
    ensureSpiceCallSucceeded(runtime.module, "Failed to execute srfrec_c");

    return readFloat64Array(runtime.module, resultPtr, 3) as Vector3Tuple;
  } finally {
    runtime.module._free(resultPtr);
  }
}
