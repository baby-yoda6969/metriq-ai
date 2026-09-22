/**
 * Port of metriq-v2 `six-face-box-v1` quick model (akshaykumarhudedmani/metriq-ai).
 * Authored rounded box + photo textures — approximate shape, not photogrammetry.
 */
import sharp from "sharp";
import crypto from "crypto";

export const QUICK_BACKEND = "six-face-box-v1";
export const FACE_NAMES = ["front", "back", "top", "bottom", "right", "left"];
export const DEFAULT_CORNERS = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

const AXES = [
  [[0, 0, 1], [1, 0, 0], [0, 1, 0], 40, 24],
  [[0, 0, -1], [-1, 0, 0], [0, 1, 0], 40, 24],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1], 40, 12],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1], 40, 12],
  // U is image-right (depth), V is image-up (height), so an upright side photo is not turned on its side.
  [[1, 0, 0], [0, 0, -1], [0, 1, 0], 24, 12],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0], 24, 12],
];

function validateCorners(points) {
  if (!points) return DEFAULT_CORNERS.map((p) => [...p]);
  if (!Array.isArray(points) || points.length !== 4) {
    throw new Error("Four normalized image corners are required");
  }
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== 2 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) {
      throw new Error("Four normalized image corners are required");
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = points[i];
    const b = points[(i + 1) % 4];
    const c = points[(i + 2) % 4];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 1e-6) {
      throw new Error("Corners must form a non-crossing clockwise quadrilateral");
    }
  }
  const area =
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % 4];
        return sum + (p[0] * q[1] - q[0] * p[1]);
      }, 0)
    ) / 2;
  if (area < 0.0001) throw new Error("Selected face is too small");
  return points.map((p) => [p[0], p[1]]);
}

function validateProportions(values) {
  const props = Array.isArray(values) && values.length === 3 ? values : [1, 1, 0.35];
  if (props.some((v) => !Number.isFinite(v) || v < 0.05 || v > 20)) {
    throw new Error("Use positive visual proportions between 0.05 and 20");
  }
  if (Math.max(...props) / Math.min(...props) > 40) {
    throw new Error("Proportion ratio cannot exceed 40:1");
  }
  return props;
}

function packF32(values) {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buf.writeFloatLE(values[i], i * 4);
  return buf;
}

function packU32(values) {
  const buf = Buffer.alloc(values.length * 4);
  for (let i = 0; i < values.length; i++) buf.writeUInt32LE(values[i], i * 4);
  return buf;
}

function cornerBounds(corners, width, height) {
  const xs = corners.map((p) => p[0] * width);
  const ys = corners.map((p) => p[1] * height);
  const left = Math.max(0, Math.floor(Math.min(...xs)));
  const top = Math.max(0, Math.floor(Math.min(...ys)));
  const right = Math.min(width, Math.ceil(Math.max(...xs)));
  const bottom = Math.min(height, Math.ceil(Math.max(...ys)));
  return {
    left,
    top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/**
 * CamMeter returns the face box in normalized image space. Crop to that box
 * before texturing so the pack face fills the side instead of the background.
 * A full-frame quad is left unchanged.
 */
export async function prepareFaceImage(inputBuf, corners) {
  const upright = await sharp(inputBuf).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (width * height > 40_000_000) {
    throw new Error("Photo is too large");
  }
  const bounds = cornerBounds(corners, width, height);
  const coversFrame = bounds.width >= width * 0.98 && bounds.height >= height * 0.98;
  let source = upright;
  let cropped = false;
  if (!coversFrame && bounds.width >= 8 && bounds.height >= 8) {
    source = await sharp(upright).extract(bounds).toBuffer();
    cropped = true;
  }
  const jpeg = await sharp(source)
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4" })
    .toBuffer();
  return {
    jpeg,
    cropped,
    corners: cropped ? DEFAULT_CORNERS.map((p) => [...p]) : corners,
  };
}

/**
 * @param {{ faces: Array<{ face: string, base64: string, mediaType?: string, corners?: number[][] }>, proportions?: number[], roundness?: number, title?: string }} input
 * @returns {Promise<{ glb: Buffer, glbBase64: string, backend: string, title: string, faces: string[] }>}
 */
export async function buildQuickModel(input) {
  const proportions = validateProportions(input.proportions);
  const roundness = Math.max(0, Math.min(0.35, Number(input.roundness ?? 0.1) || 0.1));
  const byFace = new Map();

  for (const face of input.faces || []) {
    const name = String(face.face || "").toLowerCase();
    if (!FACE_NAMES.includes(name)) continue;
    if (!face.base64) throw new Error(`Missing photo for ${name}`);
    byFace.set(name, {
      face: name,
      base64: face.base64,
      mediaType: face.mediaType || "image/jpeg",
      corners: validateCorners(face.corners ?? null),
    });
  }
  for (const name of FACE_NAMES) {
    if (!byFace.has(name)) throw new Error(`Provide one photo for each face (missing ${name})`);
  }

  const half = proportions.map((v) => (v / Math.max(...proportions)) * 0.1);
  const radius = Math.min(...half) * roundness;

  const binaryChunks = [];
  let binaryLen = 0;
  const views = [];
  const accessors = [];
  const textures = [];
  const primitives = [];

  function pad4(n) {
    return (4 - (n % 4)) % 4;
  }

  function view(data, target) {
    const pad = pad4(binaryLen);
    if (pad) {
      binaryChunks.push(Buffer.alloc(pad));
      binaryLen += pad;
    }
    const result = { buffer: 0, byteOffset: binaryLen, byteLength: data.length };
    if (target) result.target = target;
    views.push(result);
    binaryChunks.push(data);
    binaryLen += data.length;
    return views.length - 1;
  }

  function accessor(values, width, kind, component = 5126) {
    const raw = component === 5126 ? packF32(values) : packU32(values);
    const value = {
      bufferView: view(raw, component === 5126 ? 34962 : 34963),
      componentType: component,
      count: values.length / width,
      type: kind,
    };
    if (kind === "VEC3") {
      value.min = [0, 1, 2].map((i) => Math.min(...values.filter((_, idx) => idx % 3 === i)));
      value.max = [0, 1, 2].map((i) => Math.max(...values.filter((_, idx) => idx % 3 === i)));
    }
    accessors.push(value);
    return accessors.length - 1;
  }

  for (let faceIndex = 0; faceIndex < FACE_NAMES.length; faceIndex++) {
    const name = FACE_NAMES[faceIndex];
    const face = byFace.get(name);
    const inputBuf = Buffer.from(face.base64, "base64");
    let prepared;
    try {
      prepared = await prepareFaceImage(inputBuf, face.corners);
    } catch (err) {
      if (err.message === "Photo is too large") throw new Error(`${name} photo is too large`);
      throw err;
    }
    const jpeg = prepared.jpeg;
    const textureCorners = prepared.corners;

    textures.push({ bufferView: view(jpeg), mimeType: "image/jpeg", name });

    const [N, U, V, nu, nv] = AXES[faceIndex];
    const positions = [];
    const normals = [];
    const uv = [];
    const indices = [];
    const [a, b, c, d] = textureCorners;

    for (let j = 0; j <= nv; j++) {
      const t = j / nv;
      for (let i = 0; i <= nu; i++) {
        const s = i / nu;
        let point = [0, 1, 2].map(
          (k) => N[k] * half[k] + U[k] * half[k] * (2 * s - 1) + V[k] * half[k] * (2 * t - 1)
        );
        let n = N;
        if (radius) {
          const core = [0, 1, 2].map((k) =>
            Math.max(-half[k] + radius, Math.min(half[k] - radius, point[k]))
          );
          const delta = [0, 1, 2].map((k) => point[k] - core[k]);
          const length = Math.sqrt(delta.reduce((sum, v) => sum + v * v, 0)) || 1;
          n = delta.map((v) => v / length);
          point = [0, 1, 2].map((k) => core[k] + radius * n[k]);
        }
        positions.push(...point);
        normals.push(...n);
        uv.push(
          (1 - t) * ((1 - s) * d[0] + s * c[0]) + t * ((1 - s) * a[0] + s * b[0]),
          (1 - t) * ((1 - s) * d[1] + s * c[1]) + t * ((1 - s) * a[1] + s * b[1])
        );
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const p = j * (nu + 1) + i;
        const q = p + 1;
        const r = p + nu + 1;
        const s = r + 1;
        indices.push(p, q, s, p, s, r);
      }
    }
    primitives.push({
      attributes: {
        POSITION: accessor(positions, 3, "VEC3"),
        NORMAL: accessor(normals, 3, "VEC3"),
        TEXCOORD_0: accessor(uv, 2, "VEC2"),
      },
      indices: accessor(indices, 1, "SCALAR", 5125),
      material: faceIndex,
    });
  }

  const recipe = {
    version: QUICK_BACKEND,
    proportions,
    roundness,
    faces: FACE_NAMES.map((name) => ({
      face: name,
      corners: byFace.get(name).corners,
    })),
  };

  const document = {
    asset: { version: "2.0", generator: QUICK_BACKEND },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "Six-face photo model (approximate shape)" }],
    meshes: [{ primitives }],
    buffers: [{ byteLength: binaryLen }],
    bufferViews: views,
    accessors,
    images: textures,
    textures: FACE_NAMES.map((_, i) => ({ source: i, sampler: 0 })),
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    materials: FACE_NAMES.map((name, i) => ({
      name,
      pbrMetallicRoughness: {
        baseColorTexture: { index: i },
        metallicFactor: 0,
        roughnessFactor: 0.72,
      },
    })),
    extras: {
      method: QUICK_BACKEND,
      geometry: "authored rounded box, not reconstructed surface",
      measurement_eligible: Boolean(input.sizeAnnotation?.widthMm),
      measurement_note: input.sizeAnnotation
        ? "Outer dimensions estimated with CamMeter (Hofmann, Seeland, Mader, IJCV 2018). The mesh is still an authored rounded box."
        : "Authored rounded box, not a measured reconstruction.",
      cammeter: input.sizeAnnotation
        ? {
            method: input.sizeAnnotation.method,
            paper: input.sizeAnnotation.paper,
            widthMm: input.sizeAnnotation.widthMm,
            heightMm: input.sizeAnnotation.heightMm,
            depthMm: input.sizeAnnotation.depthMm,
            depthEstimated: Boolean(input.sizeAnnotation.depthEstimated),
            xiCalib: input.sizeAnnotation.xiCalib,
            faces: input.sizeAnnotation.faces,
          }
        : null,
      recipe,
      source: "akshaykumarhudedmani/metriq-ai six-face-box-v1",
    },
  };

  let json = Buffer.from(JSON.stringify(document), "utf8");
  const jsonPad = pad4(json.length);
  if (jsonPad) json = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const binPad = pad4(binaryLen);
  const binary = Buffer.concat([...binaryChunks, ...(binPad ? [Buffer.alloc(binPad)] : [])]);

  const totalLen = 12 + 8 + json.length + 8 + binary.length;
  const header = Buffer.alloc(12);
  header.write("glTF", 0, "ascii");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);
  const jsonChunk = Buffer.alloc(8);
  jsonChunk.writeUInt32LE(json.length, 0);
  jsonChunk.writeUInt32LE(0x4e4f534a, 4);
  const binChunk = Buffer.alloc(8);
  binChunk.writeUInt32LE(binary.length, 0);
  binChunk.writeUInt32LE(0x004e4942, 4);

  const glb = Buffer.concat([header, jsonChunk, json, binChunk, binary]);
  return {
    glb,
    glbBase64: glb.toString("base64"),
    backend: QUICK_BACKEND,
    title: (input.title || "Quick pack model").slice(0, 160),
    faces: [...FACE_NAMES],
    proportions,
    sizeAnnotation: input.sizeAnnotation || null,
    sha256: crypto.createHash("sha256").update(glb).digest("hex"),
  };
}
