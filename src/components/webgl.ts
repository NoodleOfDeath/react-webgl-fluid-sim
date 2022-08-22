import {
  ColorLike,
  WebGLFBO,
  WebGLSupportedFormat,
  WebGLExtensionSupport,
  WebGLShaderCompiler
} from '../types'

export function getWebGLContext(
  canvas?: HTMLCanvasElement
): WebGLRenderingContextWithExtensions {
  const params: WebGLContextAttributes = {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    preserveDrawingBuffer: false
  }

  let gl = canvas?.getContext('webgl2', params) as WebGL2RenderingContext
  const isWebGL2 = !!gl
  if (!isWebGL2) {
    gl = (canvas?.getContext('webgl', params) ||
      canvas?.getContext(
        'experimental-webgl',
        params
      )) as WebGL2RenderingContext
  }

  let halfFloat: OES_texture_half_float | null = { HALF_FLOAT_OES: 0 }
  let supportLinearFiltering: OES_texture_float | null
  if (isWebGL2) {
    gl?.getExtension('EXT_color_buffer_float')
    supportLinearFiltering = gl?.getExtension('OES_texture_float_linear')
  } else {
    halfFloat = gl?.getExtension('OES_texture_half_float')
    supportLinearFiltering = gl?.getExtension('OES_texture_half_float_linear')
  }

  gl?.clearColor(0.0, 0.0, 0.0, 1.0)

  let halfFloatTexType: number = 0
  if (isWebGL2 || halfFloat)
    halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat?.HALF_FLOAT_OES ?? 0

  let formatRGBA: WebGLSupportedFormat | null
  let formatRG: WebGLSupportedFormat | null
  let formatR: WebGLSupportedFormat | null

  if (isWebGL2) {
    formatRGBA = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType)
    formatRG = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType)
    formatR = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType)
  } else {
    formatRGBA = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
    formatRG = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
    formatR = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType)
  }

  const obj = new WebGLRenderingContextWithExtensions(gl, {
    formatRGBA,
    formatRG,
    formatR,
    halfFloatTexType,
    supportLinearFiltering
  })

  return obj
}

export function getSupportedFormat(
  gl: WebGL2RenderingContext,
  internalFormat: GLenum,
  format: number = 0,
  type: number = 0
): WebGLSupportedFormat | null {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl, gl.RG16F, gl.RG, type)
      case gl.RG16F:
        return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type)
      default:
        return null
    }
  }
  return {
    internalFormat,
    format
  }
}

export function supportRenderTextureFormat(
  gl: WebGL2RenderingContext,
  internalFormat: GLenum,
  format: number = 0,
  type: number = 0
) {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0
  )
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  return status === gl.FRAMEBUFFER_COMPLETE
}

export function clamp01(input: number) {
  return Math.min(Math.max(input, 0), 1)
}

export function hashCode(s: string) {
  if (s.length === 0) return 0
  let hash = 0
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i)
    hash |= 0 // Convert to 32bit integer
  }
  return hash
}

export function getTextureScale(
  texture: WebGLFBO,
  width: number,
  height: number
) {
  return {
    x: width / (texture.width ?? 1),
    y: height / (texture.height ?? 1)
  }
}

export function generateColor({
  r = Math.random(),
  g = 1.0,
  b = 1.0
}: Partial<ColorLike> = {}) {
  let c = HSVtoRGB(r, g, b)
  c.r *= 0.15
  c.g *= 0.15
  c.b *= 0.15
  return c
}

export function HSVtoRGB(h: number, s: number, v: number): ColorLike {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  switch (i % 6) {
    case 0:
      return { r: v, g: t, b: p }
    case 1:
      return { r: q, g: v, b: p }
    case 2:
      return { r: p, g: v, b: t }
    case 3:
      return { r: p, g: q, b: v }
    case 4:
      return { r: t, g: p, b: v }
    case 5:
      return { r: v, g: p, b: q }
  }
  return { r: 0, g: 0, b: 0 }
}

export function normalizeColor(color: ColorLike) {
  let output: ColorLike = {
    r: color.r / 255,
    g: color.g / 255,
    b: color.b / 255
  }
  return output
}

export function wrap(value: number, min: number, max: number) {
  let range = max - min
  if (range === 0) return min
  return ((value - min) % range) + min
}

export class Program {
  gl: WebGLRenderingContextWithExtensions

  program: WebGLProgram
  vertexShader: WebGLShader
  fragmentShader: WebGLShader
  uniforms: Record<string, WebGLUniformLocation>

  constructor(
    gl: WebGLRenderingContextWithExtensions,
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader | string
  ) {
    this.gl = gl
    if (typeof fragmentShader === 'string') {
      fragmentShader = gl.compileShaderOfType(
        gl.gl.FRAGMENT_SHADER,
        fragmentShader
      )
    }
    const program = gl.createProgramFromShader(vertexShader, fragmentShader)
    this.program = program
    this.uniforms = gl.getUniforms(program)
    this.vertexShader = vertexShader
    this.fragmentShader = fragmentShader
  }

  bind() {
    if (!this.program) return
    this.gl.gl.useProgram(this.program)
  }
}

export class Material extends Program {
  fragmentShaderSource: string = ''
  programs: WebGLProgram[]

  constructor(
    gl: WebGLRenderingContextWithExtensions,
    vertexShader: WebGLShader,
    fragmentShaderSource: WebGLShader | string
  ) {
    super(gl, vertexShader, fragmentShaderSource)
    this.vertexShader = vertexShader
    if (typeof fragmentShaderSource === 'string')
      this.fragmentShaderSource = fragmentShaderSource
    this.programs = []
  }

  setKeywords(...keywords: string[]) {
    const hash =
      keywords.length > 0
        ? keywords
            .map((keyword) => hashCode(keyword))
            .reduce((prev, curr) => prev + curr)
        : 0
    if (!this.programs[hash]) {
      let fragmentShader = this.gl.compileShaderOfType(
        this.gl.gl.FRAGMENT_SHADER,
        this.fragmentShaderSource,
        keywords
      )
      if (fragmentShader) {
        const program = this.gl.createProgramFromShader(
          this.vertexShader,
          fragmentShader
        )
        if (program) this.programs[hash] = program
      }
    }
    let program = this.programs[hash]
    if (program === this.program) return
    this.uniforms = this.gl.getUniforms(program)
    this.program = program
  }
}

export class WebGLRenderingContextWithExtensions
  implements WebGLShaderCompiler
{
  gl: WebGLRenderingContext & WebGL2RenderingContext
  ext: WebGLExtensionSupport

  constructor(
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    ext: WebGLExtensionSupport = {}
  ) {
    this.gl = gl
    this.ext = ext
  }

  compileShaderOfType(type: number, source: string, keywords: string[] = []) {
    source = [...keywords.map((keyword) => `#define ${keyword}`), source].join(
      '\n'
    )
    const shader = this.gl.createShader(type)
    if (!shader) {
      throw new Error('error creating shader')
    }
    this.gl.shaderSource(shader, source)
    this.gl.compileShader(shader)
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS))
      console.trace(this.gl.getShaderInfoLog(shader))
    return shader
  }

  getUniforms(program: WebGLProgram) {
    const uniforms: Record<string, WebGLUniformLocation> = {}
    const uniformCount = this.gl.getProgramParameter(
      program,
      this.gl.ACTIVE_UNIFORMS
    )
    for (let i = 0; i < uniformCount; i++) {
      const uniformName = this.gl.getActiveUniform(program, i)?.name
      if (!uniformName) {
        console.error('error generating uniform')
        continue
      }
      const uniform = this.gl.getUniformLocation(program, uniformName)
      if (!uniform) {
        console.error('error generating uniform location')
        continue
      }
      uniforms[uniformName] = uniform
    }
    return uniforms
  }

  createProgramFromShader(
    vertexShader: WebGLShader,
    fragmentShader: WebGLShader
  ) {
    const program = this.gl.createProgram()
    if (!program) {
      throw new Error('error creating program')
    }
    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
      console.trace(this.gl.getProgramInfoLog(program))
    return program
  }

  getResolution(resolution: number) {
    let aspectRatio = this.gl.drawingBufferWidth / this.gl.drawingBufferHeight
    if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio

    let min = Math.round(resolution)
    let max = Math.round(resolution * aspectRatio)

    if (this.gl.drawingBufferWidth > this.gl.drawingBufferHeight)
      return { width: max, height: min }
    else return { width: min, height: max }
  }

  get baseVertexShader() {
    return this.compileShaderOfType(
      this.gl.VERTEX_SHADER,
      `
      precision highp float;

      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform vec2 texelSize;

      void main () {
          vUv = aPosition * 0.5 + 0.5;
          vL = vUv - vec2(texelSize.x, 0.0);
          vR = vUv + vec2(texelSize.x, 0.0);
          vT = vUv + vec2(0.0, texelSize.y);
          vB = vUv - vec2(0.0, texelSize.y);
          gl_Position = vec4(aPosition, 0.0, 1.0);
      }
      `
    )
  }

  get blurVertexShader() {
    return this.compileShaderOfType(
      this.gl.VERTEX_SHADER,
      `
      precision highp float;

      attribute vec2 aPosition;
      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      uniform vec2 texelSize;

      void main () {
          vUv = aPosition * 0.5 + 0.5;
          float offset = 1.33333333;
          vL = vUv - texelSize * offset;
          vR = vUv + texelSize * offset;
          gl_Position = vec4(aPosition, 0.0, 1.0);
      }
      `
    )
  }

  get blurShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      uniform sampler2D uTexture;

      void main () {
          vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
          sum += texture2D(uTexture, vL) * 0.35294117;
          sum += texture2D(uTexture, vR) * 0.35294117;
          gl_FragColor = sum;
      }
      `
    )
  }

  get copyShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying highp vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
          gl_FragColor = texture2D(uTexture, vUv);
      }
      `
    )
  }

  get clearShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying highp vec2 vUv;
      uniform sampler2D uTexture;
      uniform float value;

      void main () {
          gl_FragColor = value * texture2D(uTexture, vUv);
      }
      `
    )
  }

  get colorShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;

      uniform vec4 color;

      void main () {
          gl_FragColor = color;
      }
      `
    )
  }

  get checkerboardShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision highp float;
      precision highp sampler2D;

      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float aspectRatio;

      #define SCALE 25.0

      void main () {
          vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
          float v = mod(uv.x + uv.y, 2.0);
          v = v * 0.1 + 0.8;
          gl_FragColor = vec4(vec3(v), 1.0);
      }
      `
    )
  }

  get displayShaderSource() {
    return `
    precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    varying vec2 vL;
    varying vec2 vR;
    varying vec2 vT;
    varying vec2 vB;
    uniform sampler2D uTexture;
    uniform sampler2D uBloom;
    uniform sampler2D uSunrays;
    uniform sampler2D uDithering;
    uniform vec2 ditherScale;
    uniform vec2 texelSize;

    vec3 linearToGamma (vec3 color) {
        color = max(color, vec3(0));
        return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
    }

    void main () {
        vec3 c = texture2D(uTexture, vUv).rgb;

    #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb;
        vec3 rc = texture2D(uTexture, vR).rgb;
        vec3 tc = texture2D(uTexture, vT).rgb;
        vec3 bc = texture2D(uTexture, vB).rgb;

        float dx = length(rc) - length(lc);
        float dy = length(tc) - length(bc);

        vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        vec3 l = vec3(0.0, 0.0, 1.0);

        float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
        c *= diffuse;
    #endif

    #ifdef BLOOM
        vec3 bloom = texture2D(uBloom, vUv).rgb;
    #endif

    #ifdef SUNRAYS
        float sunrays = texture2D(uSunrays, vUv).r;
        c *= sunrays;
    #ifdef BLOOM
        bloom *= sunrays;
    #endif
    #endif

    #ifdef BLOOM
        float noise = texture2D(uDithering, vUv * ditherScale).r;
        noise = noise * 2.0 - 1.0;
        bloom += noise / 255.0;
        bloom = linearToGamma(bloom);
        c += bloom;
    #endif

        float a = max(c.r, max(c.g, c.b));
        gl_FragColor = vec4(c, a);
    }
    `
  }

  get bloomPrefilterShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform vec3 curve;
      uniform float threshold;

      void main () {
          vec3 c = texture2D(uTexture, vUv).rgb;
          float br = max(c.r, max(c.g, c.b));
          float rq = clamp(br - curve.x, 0.0, curve.y);
          rq = curve.z * rq * rq;
          c *= max(rq, br - threshold) / max(br, 0.0001);
          gl_FragColor = vec4(c, 0.0);
      }
      `
    )
  }

  get bloomBlurShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uTexture;

      void main () {
          vec4 sum = vec4(0.0);
          sum += texture2D(uTexture, vL);
          sum += texture2D(uTexture, vR);
          sum += texture2D(uTexture, vT);
          sum += texture2D(uTexture, vB);
          sum *= 0.25;
          gl_FragColor = sum;
      }
      `
    )
  }

  get bloomFinalShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uTexture;
      uniform float intensity;

      void main () {
          vec4 sum = vec4(0.0);
          sum += texture2D(uTexture, vL);
          sum += texture2D(uTexture, vR);
          sum += texture2D(uTexture, vT);
          sum += texture2D(uTexture, vB);
          sum *= 0.25;
          gl_FragColor = sum * intensity;
      }
      `
    )
  }

  get sunraysMaskShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision highp float;
      precision highp sampler2D;

      varying vec2 vUv;
      uniform sampler2D uTexture;

      void main () {
          vec4 c = texture2D(uTexture, vUv);
          float br = max(c.r, max(c.g, c.b));
          c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
          gl_FragColor = c;
      }
      `
    )
  }

  get sunraysShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision highp float;
      precision highp sampler2D;

      varying vec2 vUv;
      uniform sampler2D uTexture;
      uniform float weight;

      #define ITERATIONS 16

      void main () {
          float Density = 0.3;
          float Decay = 0.95;
          float Exposure = 0.7;

          vec2 coord = vUv;
          vec2 dir = vUv - 0.5;

          dir *= 1.0 / float(ITERATIONS) * Density;
          float illuminationDecay = 1.0;

          float color = texture2D(uTexture, vUv).a;

          for (int i = 0; i < ITERATIONS; i++)
          {
              coord -= dir;
              float col = texture2D(uTexture, coord).a;
              color += col * illuminationDecay * weight;
              illuminationDecay *= Decay;
          }

          gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
      }
      `
    )
  }

  get splatShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision highp float;
      precision highp sampler2D;

      varying vec2 vUv;
      uniform sampler2D uTarget;
      uniform float aspectRatio;
      uniform vec3 color;
      uniform vec2 point;
      uniform float radius;

      void main () {
          vec2 p = vUv - point.xy;
          p.x *= aspectRatio;
          vec3 splat = exp(-dot(p, p) / radius) * color;
          vec3 base = texture2D(uTarget, vUv).xyz;
          gl_FragColor = vec4(base + splat, 1.0);
      }
      `
    )
  }

  get advectionShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision highp float;
      precision highp sampler2D;

      varying vec2 vUv;
      uniform sampler2D uVelocity;
      uniform sampler2D uSource;
      uniform vec2 texelSize;
      uniform vec2 dyeTexelSize;
      uniform float dt;
      uniform float dissipation;

      vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
          vec2 st = uv / tsize - 0.5;

          vec2 iuv = floor(st);
          vec2 fuv = fract(st);

          vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
          vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
          vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
          vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);

          return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
      }

      void main () {
      #ifdef MANUAL_FILTERING
          vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
          vec4 result = bilerp(uSource, coord, dyeTexelSize);
      #else
          vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
          vec4 result = texture2D(uSource, coord);
      #endif
          float decay = 1.0 + dissipation * dt;
          gl_FragColor = result / decay;
      }
      `,
      this.ext.supportLinearFiltering ? [] : ['MANUAL_FILTERING']
    )
  }

  get divergenceShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
          float L = texture2D(uVelocity, vL).x;
          float R = texture2D(uVelocity, vR).x;
          float T = texture2D(uVelocity, vT).y;
          float B = texture2D(uVelocity, vB).y;

          vec2 C = texture2D(uVelocity, vUv).xy;
          if (vL.x < 0.0) { L = -C.x; }
          if (vR.x > 1.0) { R = -C.x; }
          if (vT.y > 1.0) { T = -C.y; }
          if (vB.y < 0.0) { B = -C.y; }

          float div = 0.5 * (R - L + T - B);
          gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
      }
      `
    )
  }

  get curlShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uVelocity;

      void main () {
          float L = texture2D(uVelocity, vL).y;
          float R = texture2D(uVelocity, vR).y;
          float T = texture2D(uVelocity, vT).x;
          float B = texture2D(uVelocity, vB).x;
          float vorticity = R - L - T + B;
          gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
      }
      `
    )
  }

  get vorticityShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision highp float;
      precision highp sampler2D;

      varying vec2 vUv;
      varying vec2 vL;
      varying vec2 vR;
      varying vec2 vT;
      varying vec2 vB;
      uniform sampler2D uVelocity;
      uniform sampler2D uCurl;
      uniform float curl;
      uniform float dt;

      void main () {
          float L = texture2D(uCurl, vL).x;
          float R = texture2D(uCurl, vR).x;
          float T = texture2D(uCurl, vT).x;
          float B = texture2D(uCurl, vB).x;
          float C = texture2D(uCurl, vUv).x;

          vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
          force /= length(force) + 0.0001;
          force *= curl * C;
          force.y *= -1.0;

          vec2 velocity = texture2D(uVelocity, vUv).xy;
          velocity += force * dt;
          velocity = min(max(velocity, -1000.0), 1000.0);
          gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
      `
    )
  }

  get pressureShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uDivergence;

      void main () {
          float L = texture2D(uPressure, vL).x;
          float R = texture2D(uPressure, vR).x;
          float T = texture2D(uPressure, vT).x;
          float B = texture2D(uPressure, vB).x;
          float C = texture2D(uPressure, vUv).x;
          float divergence = texture2D(uDivergence, vUv).x;
          float pressure = (L + R + B + T - divergence) * 0.25;
          gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
      }
      `
    )
  }

  get gradientSubtractShader() {
    return this.compileShaderOfType(
      this.gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      precision mediump sampler2D;

      varying highp vec2 vUv;
      varying highp vec2 vL;
      varying highp vec2 vR;
      varying highp vec2 vT;
      varying highp vec2 vB;
      uniform sampler2D uPressure;
      uniform sampler2D uVelocity;

      void main () {
          float L = texture2D(uPressure, vL).x;
          float R = texture2D(uPressure, vR).x;
          float T = texture2D(uPressure, vT).x;
          float B = texture2D(uPressure, vB).x;
          vec2 velocity = texture2D(uVelocity, vUv).xy;
          velocity.xy -= vec2(R - L, T - B);
          gl_FragColor = vec4(velocity, 0.0, 1.0);
      }
      `
    )
  }
}
