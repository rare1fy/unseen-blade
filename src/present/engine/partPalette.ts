import * as THREE from 'three';

type PartMaterial = THREE.MeshLambertMaterial | THREE.MeshBasicMaterial | THREE.MeshToonMaterial | THREE.MeshStandardMaterial;
export function partMaterial(m: THREE.Material): m is PartMaterial {
  return m instanceof THREE.MeshLambertMaterial || m instanceof THREE.MeshBasicMaterial ||
    m instanceof THREE.MeshToonMaterial || m.type === 'MeshStandardMaterial';
}

// These affect either the program or a uniform shared by the entire draw. Keep the
// original values (including texture and function identity) even if the first part changes.
const fields = ['type', 'vertexColors', 'map', 'emissiveMap', 'alphaMap', 'aoMap', 'gradientMap',
  'transparent', 'opacity', 'side', 'depthTest', 'depthWrite', 'depthFunc', 'toneMapped', 'blending',
  'fog', 'flatShading', 'wireframe', 'colorWrite', 'alphaTest', 'polygonOffset', 'polygonOffsetFactor',
  'polygonOffsetUnits', 'onBeforeCompile', 'customProgramCacheKey', 'onBeforeRender', 'roughness', 'metalness', 'roughnessMap',
  'metalnessMap', 'envMap', 'lightMap', 'lightMapIntensity', 'aoMapIntensity', 'envMapIntensity',
  'normalMap', 'bumpMap', 'displacementMap', 'specularMap', 'combine', 'reflectivity', 'refractionRatio',
  'premultipliedAlpha', 'alphaHash', 'alphaToCoverage', 'dithering', 'stencilWrite', 'visible'] as const;
type State = Record<(typeof fields)[number], unknown>;
const state = (m: THREE.Material) => m as unknown as State;
export class PartState {
  private values: unknown[];
  constructor(m: THREE.Material) { this.values = fields.map(k => state(m)[k]); }
  matches(m: THREE.Material) {
    const s = state(m);
    for (let i = 0; i < fields.length; i++) if (s[fields[i]] !== this.values[i]) return false;
    return true;
  }
}

export class PartPalette {
  readonly texture: THREE.DataTexture;
  readonly material: PartMaterial;
  private data: Float32Array;
  constructor(source: PartMaterial, n: number) {
    this.data = new Float32Array(n * 8);
    const tex = this.texture = new THREE.DataTexture(this.data, 2 * n, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
    const m = this.material = source.clone();
    if ('flatShading' in source) Object.assign(m, { flatShading: source.flatShading });
    const compile = source.onBeforeCompile, cacheKey = source.customProgramCacheKey();
    m.customProgramCacheKey = () => cacheKey + '|rigidPartPalette';
    m.onBeforeCompile = (shader, renderer) => {
      compile.call(m, shader, renderer);
      shader.uniforms.uPartTex = { value: tex }; shader.uniforms.uPartN = { value: n };
      shader.vertexShader = 'varying float vPart;\n' + shader.vertexShader.replace('#include <skinbase_vertex>',
        '#include <skinbase_vertex>\n vPart = skinIndex.x;')
        // A filling HP bar scales along X only. Its original mesh used the inverse transpose for normals.
        .replace('#include <skinnormal_vertex>', `mat3 b = mat3(boneMatX);
          objectNormal = mat3(cross(b[1], b[2]), cross(b[2], b[0]), cross(b[0], b[1])) * objectNormal;`);
      shader.fragmentShader = 'varying float vPart; uniform sampler2D uPartTex; uniform float uPartN;\n' + shader.fragmentShader
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );',
          'vec4 diffuseColor = vec4(texture2D(uPartTex, vec2((vPart + 0.25) / uPartN, 0.5)).rgb, opacity);')
        .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = texture2D(uPartTex, vec2((vPart + 0.75) / uPartN, 0.5)).rgb;');
    };
  }
  update(i: number, m: PartMaterial) {
    const c = m.color, e = 'emissive' in m ? m.emissive : null, k = 'emissiveIntensity' in m ? m.emissiveIntensity : 0;
    const a = this.data, j = i * 8, r = Math.fround(c.r), g = Math.fround(c.g), b = Math.fround(c.b);
    const er = Math.fround(e ? e.r * k : 0), eg = Math.fround(e ? e.g * k : 0), eb = Math.fround(e ? e.b * k : 0);
    if (a[j] === r && a[j+1] === g && a[j+2] === b && a[j+4] === er && a[j+5] === eg && a[j+6] === eb) return false;
    a[j] = r; a[j+1] = g; a[j+2] = b; a[j+4] = er; a[j+5] = eg; a[j+6] = eb; return true;
  }
  dispose() { this.texture.dispose(); this.material.dispose(); }
}
