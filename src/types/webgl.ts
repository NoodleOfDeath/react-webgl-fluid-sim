export interface IPointer {
  id: number;
  texcoordX: number;
  texcoordY: number;
  prevTexcoordX: number;
  prevTexcoordY: number;
  deltaX: number;
  deltaY: number;
  down: boolean;
  moved: boolean;
  color: ColorLike;
}

export class Pointer implements IPointer {
  id: number;
  texcoordX: number;
  texcoordY: number;
  prevTexcoordX: number;
  prevTexcoordY: number;
  deltaX: number;
  deltaY: number;
  down: boolean;
  moved: boolean;
  color: ColorLike;

  constructor({
    id = -1,
    texcoordX = 0,
    texcoordY = 0,
    prevTexcoordX = 0,
    prevTexcoordY = 0,
    deltaX = 0,
    deltaY = 0,
    down = false,
    moved = false,
    color = { r: 30, g: 0, b: 300 },
  }: Partial<IPointer> = {}) {
    this.id = id;
    this.texcoordX = texcoordX;
    this.texcoordY = texcoordY;
    this.prevTexcoordX = prevTexcoordX;
    this.prevTexcoordY = prevTexcoordY;
    this.deltaX = deltaX;
    this.deltaY = deltaY;
    this.down = down;
    this.moved = moved;
    this.color = color;
  }
}

export type WebGLSupportedFormat = {
  readonly internalFormat: number;
  readonly format: number;
};

export type WebGLExtensionSupport = {
  formatRGBA?: WebGLSupportedFormat | null;
  formatRG?: WebGLSupportedFormat | null;
  formatR?: WebGLSupportedFormat | null;
  halfFloatTexType?: number;
  supportLinearFiltering?: OES_texture_float | null;
};

export type WebGLResolution = {
  width: number;
  height: number;
};

export type WebGLShaderCompiler = {
  compileShaderOfType(type: number, source: string, keywords?: string[]): WebGLShader | null;
  getUniforms(program: WebGLProgram): Record<string, WebGLUniformLocation>;
  createProgramFromShader(vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null;
  getResolution(resolution: number): WebGLResolution;
  readonly baseVertexShader: WebGLShader | null;
  readonly blurVertexShader: WebGLShader | null;
  readonly blurShader: WebGLShader | null;
  readonly copyShader: WebGLShader | null;
  readonly clearShader: WebGLShader | null;
  readonly colorShader: WebGLShader | null;
  readonly checkerboardShader: WebGLShader | null;
  readonly displayShaderSource: WebGLShader | null;
  readonly bloomPrefilterShader: WebGLShader | null;
  readonly bloomBlurShader: WebGLShader | null;
  readonly bloomFinalShader: WebGLShader | null;
  readonly sunraysMaskShader: WebGLShader | null;
  readonly sunraysShader: WebGLShader | null;
  readonly splatShader: WebGLShader | null;
  readonly advectionShader: WebGLShader | null;
  readonly divergenceShader: WebGLShader | null;
  readonly curlShader: WebGLShader | null;
  readonly vorticityShader: WebGLShader | null;
  readonly pressureShader: WebGLShader | null;
  readonly gradientSubtractShader: WebGLShader | null;
};

export type WebGLFBO = {
  texture?: WebGLTexture | null;
  fbo?: WebGLFramebuffer | null;
  width?: number | null;
  height?: number | null;
  texelSizeX?: number | null;
  texelSizeY?: number | null;
  attach?(id: number): number;
  read?: WebGLFBO;
  write?: WebGLFBO;
  swap?(): void;
};

export type ColorLike = { r: number; g: number; b: number } | { r: number; g: number; b: number; a: number };
