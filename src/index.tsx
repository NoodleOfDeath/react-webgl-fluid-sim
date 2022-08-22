import React from 'react'
import styled from 'styled-components'
import { ColorGenerator, ColorLike, Pointer, WebGLFBO } from './types'
import {
  Program,
  Material,
  getTextureScale,
  getWebGLContext,
  normalizeColor,
  wrap
} from './components/webgl'
import { LDR_LLL1_0 } from './assets/LDR_LLL1_0'

const StyledCanvas = styled.canvas<Props>`
  width: 100%;
  height: 100%;
  z-index: -1;
  position: ${({ fixed }) => (fixed ? 'fixed' : 'static')};
`

function scaleByPixelRatio(input: number) {
  return Math.floor(input * (window.devicePixelRatio || 1))
}

function resizeCanvas(canvas: HTMLCanvasElement) {
  const width = scaleByPixelRatio(canvas.clientWidth)
  const height = scaleByPixelRatio(canvas.clientHeight)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
    return true
  }
  return false
}

function isMobile() {
  return /Mobi|Android/i.test(navigator.userAgent)
}

export const GL_CONFIGS = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: isMobile() ? 512 : 1024,
  CAPTURE_RESOLUTION: 512,
  DENSITY_DISSIPATION: 0.7,
  VELOCITY_DISSIPATION: 0.2,
  PRESSURE: 0.3,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 2000,
  SHADING: true,
  COLORFUL: true,
  COLOR_UPDATE_SPEED: 10,
  PAUSED: false,
  BACK_COLOR: { r: 0, g: 0, b: 0 },
  TRANSPARENT: false,
  BLOOM: true,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  RESIZE_DELAY: 30,
  SPLAT_COUNT(): number {
    return Math.floor(Math.random() * 2) + 1
  },
  SPLAT_RATE: 5000,
  SUNRAYS: true,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0
}

type Props = {
  fixed?: boolean
  colorGenerator?: ColorGenerator
}
function WebGLFluidSim({
  fixed = true,
  colorGenerator = () => ({ r: Math.random(), g: 1.0, b: 1.0 })
}: Props) {
  //

  const refCanvas = React.useRef<HTMLCanvasElement>(null)

  const [canvas, setCanvas] = React.useState<HTMLCanvasElement | null>(null)

  React.useEffect(() => {
    const canvas = refCanvas?.current
    if (!canvas) return
    resizeCanvas(canvas)
    setCanvas(canvas)
  }, [])

  React.useEffect(() => {
    if (!canvas) return

    const context = getWebGLContext(canvas)

    const pointers: Pointer[] = []
    const splatStack: number[] = []

    pointers.push(new Pointer())

    const blit = (() => {
      context.gl.bindBuffer(context.gl.ARRAY_BUFFER, context.gl.createBuffer())
      context.gl.bufferData(
        context.gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
        context.gl.STATIC_DRAW
      )
      context.gl.bindBuffer(
        context.gl.ELEMENT_ARRAY_BUFFER,
        context.gl.createBuffer()
      )
      context.gl.bufferData(
        context.gl.ELEMENT_ARRAY_BUFFER,
        new Uint16Array([0, 1, 2, 0, 2, 3]),
        context.gl.STATIC_DRAW
      )
      context.gl.vertexAttribPointer(0, 2, context.gl.FLOAT, false, 0, 0)
      context.gl.enableVertexAttribArray(0)
      return (target: WebGLFBO | null, clear = false) => {
        if (!target) {
          context.gl.viewport(
            0,
            0,
            context.gl.drawingBufferWidth,
            context.gl.drawingBufferHeight
          )
          context.gl.bindFramebuffer(context.gl.FRAMEBUFFER, null)
        } else {
          context.gl.viewport(0, 0, target.width ?? 0, target.height ?? 0)
          context.gl.bindFramebuffer(context.gl.FRAMEBUFFER, target.fbo ?? null)
        }
        if (clear) {
          context.gl.clearColor(0.0, 0.0, 0.0, 1.0)
          context.gl.clear(context.gl.COLOR_BUFFER_BIT)
        }
        context.gl.drawElements(
          context.gl.TRIANGLES,
          6,
          context.gl.UNSIGNED_SHORT,
          0
        )
      }
    })()

    let dye: WebGLFBO
    let velocity: WebGLFBO
    let divergence: WebGLFBO
    let curl: WebGLFBO
    let pressure: WebGLFBO
    let bloom: WebGLFBO
    let bloomFramebuffers: WebGLFBO[] = []
    let sunrays: WebGLFBO
    let sunraysTemp: WebGLFBO

    let ditheringTexture = createTextureAsync(LDR_LLL1_0)

    const blurProgram = new Program(
      context,
      context.blurVertexShader,
      context.blurShader
    )
    const copyProgram = new Program(
      context,
      context.baseVertexShader,
      context.copyShader
    )
    const clearProgram = new Program(
      context,
      context.baseVertexShader,
      context.clearShader
    )
    const colorProgram = new Program(
      context,
      context.baseVertexShader,
      context.colorShader
    )
    const checkerboardProgram = new Program(
      context,
      context.baseVertexShader,
      context.checkerboardShader
    )
    const bloomPrefilterProgram = new Program(
      context,
      context.baseVertexShader,
      context.bloomPrefilterShader
    )
    const bloomBlurProgram = new Program(
      context,
      context.baseVertexShader,
      context.bloomBlurShader
    )
    const bloomFinalProgram = new Program(
      context,
      context.baseVertexShader,
      context.bloomFinalShader
    )
    const sunraysMaskProgram = new Program(
      context,
      context.baseVertexShader,
      context.sunraysMaskShader
    )
    const sunraysProgram = new Program(
      context,
      context.baseVertexShader,
      context.sunraysShader
    )
    const splatProgram = new Program(
      context,
      context.baseVertexShader,
      context.splatShader
    )
    const advectionProgram = new Program(
      context,
      context.baseVertexShader,
      context.advectionShader
    )
    const divergenceProgram = new Program(
      context,
      context.baseVertexShader,
      context.divergenceShader
    )
    const curlProgram = new Program(
      context,
      context.baseVertexShader,
      context.curlShader
    )
    const vorticityProgram = new Program(
      context,
      context.baseVertexShader,
      context.vorticityShader
    )
    const pressureProgram = new Program(
      context,
      context.baseVertexShader,
      context.pressureShader
    )
    const gradientSubtractProgram = new Program(
      context,
      context.baseVertexShader,
      context.gradientSubtractShader
    )

    const displayMaterial = new Material(
      context,
      context.baseVertexShader,
      context.displayShaderSource
    )

    const initFramebuffers = () => {
      let simRes = context.getResolution(GL_CONFIGS.SIM_RESOLUTION)
      let dyeRes = context.getResolution(GL_CONFIGS.DYE_RESOLUTION)

      const texType = context.ext.halfFloatTexType
      const rgba = context.ext.formatRGBA
      const rg = context.ext.formatRG
      const r = context.ext.formatR
      const filtering = context.ext.supportLinearFiltering
        ? context.gl.LINEAR
        : context.gl.NEAREST

      context.gl.disable(context.gl.BLEND)

      if (!dye)
        dye = createDoubleFBO(
          dyeRes.width,
          dyeRes.height,
          rgba?.internalFormat ?? 0,
          rgba?.format ?? 0,
          texType ?? 0,
          filtering
        )
      else
        dye = resizeDoubleFBO(
          dye,
          dyeRes.width,
          dyeRes.height,
          rgba?.internalFormat ?? 0,
          rgba?.format ?? 0,
          texType ?? 0,
          filtering
        )

      if (!velocity)
        velocity = createDoubleFBO(
          simRes.width,
          simRes.height,
          rg?.internalFormat ?? 0,
          rg?.format ?? 0,
          texType ?? 0,
          filtering
        )
      else
        velocity = resizeDoubleFBO(
          velocity,
          simRes.width,
          simRes.height,
          rg?.internalFormat ?? 0,
          rg?.format ?? 0,
          texType ?? 0,
          filtering
        )

      divergence = createFBO(
        simRes.width,
        simRes.height,
        r?.internalFormat ?? 0,
        r?.format ?? 0,
        texType ?? 0,
        context.gl.NEAREST
      )
      curl = createFBO(
        simRes.width,
        simRes.height,
        r?.internalFormat ?? 0,
        r?.format ?? 0,
        texType ?? 0,
        context.gl.NEAREST
      )
      pressure = createDoubleFBO(
        simRes.width,
        simRes.height,
        r?.internalFormat ?? 0,
        r?.format ?? 0,
        texType ?? 0,
        context.gl.NEAREST
      )

      initBloomFramebuffers()
      initSunraysFramebuffers()
    }

    const initBloomFramebuffers = () => {
      let res = context.getResolution(GL_CONFIGS.BLOOM_RESOLUTION)

      const texType = context.ext.halfFloatTexType
      const rgba = context.ext.formatRGBA
      const filtering = context.ext.supportLinearFiltering
        ? context.gl.LINEAR
        : context.gl.NEAREST

      bloom = createFBO(
        res.width,
        res.height,
        rgba?.internalFormat ?? 0,
        rgba?.format ?? 0,
        texType ?? 0,
        filtering
      )

      bloomFramebuffers.length = 0
      for (let i = 0; i < GL_CONFIGS.BLOOM_ITERATIONS; i++) {
        let width = res.width >> (i + 1)
        let height = res.height >> (i + 1)
        if (width < 2 || height < 2) break
        let fbo = createFBO(
          width,
          height,
          rgba?.internalFormat ?? 0,
          rgba?.format ?? 0,
          texType ?? 0,
          filtering
        )
        bloomFramebuffers.push(fbo)
      }
    }

    const initSunraysFramebuffers = () => {
      let res = context.getResolution(GL_CONFIGS.SUNRAYS_RESOLUTION)

      const texType = context.ext.halfFloatTexType
      const r = context.ext.formatR
      const filtering = context.ext.supportLinearFiltering
        ? context.gl.LINEAR
        : context.gl.NEAREST

      sunrays = createFBO(
        res.width,
        res.height,
        r?.internalFormat ?? 0,
        r?.format ?? 0,
        texType ?? 0,
        filtering
      )
      sunraysTemp = createFBO(
        res.width,
        res.height,
        r?.internalFormat ?? 0,
        r?.format ?? 0,
        texType ?? 0,
        filtering
      )
    }

    function createFBO(
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      param: number
    ): WebGLFBO {
      context.gl.activeTexture(context.gl.TEXTURE0)
      let texture = context.gl.createTexture()
      context.gl.bindTexture(context.gl.TEXTURE_2D, texture)
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_MIN_FILTER,
        param
      )
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_MAG_FILTER,
        param
      )
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_WRAP_S,
        context.gl.CLAMP_TO_EDGE
      )
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_WRAP_T,
        context.gl.CLAMP_TO_EDGE
      )
      context.gl.texImage2D(
        context.gl.TEXTURE_2D,
        0,
        internalFormat,
        w,
        h,
        0,
        format,
        type,
        null
      )

      let fbo = context.gl.createFramebuffer()
      context.gl.bindFramebuffer(context.gl.FRAMEBUFFER, fbo)
      context.gl.framebufferTexture2D(
        context.gl.FRAMEBUFFER,
        context.gl.COLOR_ATTACHMENT0,
        context.gl.TEXTURE_2D,
        texture,
        0
      )
      context.gl.viewport(0, 0, w, h)
      context.gl.clear(context.gl.COLOR_BUFFER_BIT)

      const texelSizeX = 1.0 / w
      const texelSizeY = 1.0 / h

      return {
        texture,
        fbo,
        width: w,
        height: h,
        texelSizeX,
        texelSizeY,
        attach(id: number) {
          context.gl.activeTexture(context.gl.TEXTURE0 + id)
          context.gl.bindTexture(context.gl.TEXTURE_2D, texture)
          return id
        }
      }
    }

    function createDoubleFBO(
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      param: number
    ): WebGLFBO {
      let fbo1 = createFBO(w, h, internalFormat, format, type, param)
      let fbo2 = createFBO(w, h, internalFormat, format, type, param)
      return {
        width: w,
        height: h,
        texelSizeX: fbo1?.texelSizeX ?? 0,
        texelSizeY: fbo1?.texelSizeY ?? 0,
        get read() {
          return fbo1
        },
        set read(value) {
          fbo1 = value
        },
        get write() {
          return fbo2
        },
        set write(value) {
          fbo2 = value
        },
        swap() {
          let temp = fbo1
          fbo1 = fbo2
          fbo2 = temp
        }
      }
    }

    function resizeFBO(
      target: WebGLFBO,
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      param: number
    ): WebGLFBO {
      let newFBO = createFBO(w, h, internalFormat, format, type, param)
      copyProgram.bind()
      context.gl.uniform1i(
        copyProgram.uniforms.uTexture,
        target.attach ? target.attach(0) : 0
      )
      blit(newFBO)
      return newFBO
    }

    function resizeDoubleFBO(
      target: WebGLFBO,
      w: number,
      h: number,
      internalFormat: number,
      format: number,
      type: number,
      param: number
    ) {
      if (target.width === w && target.height === h) return target
      if (!target.read) return target
      target.read = resizeFBO(
        target.read,
        w,
        h,
        internalFormat,
        format,
        type,
        param
      )
      target.write = createFBO(w, h, internalFormat, format, type, param)
      target.width = w
      target.height = h
      target.texelSizeX = 1.0 / w
      target.texelSizeY = 1.0 / h
      return target
    }

    function createTextureAsync(url: string) {
      let texture = context.gl.createTexture()
      context.gl.bindTexture(context.gl.TEXTURE_2D, texture)
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_MIN_FILTER,
        context.gl.LINEAR
      )
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_MAG_FILTER,
        context.gl.LINEAR
      )
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_WRAP_S,
        context.gl.REPEAT
      )
      context.gl.texParameteri(
        context.gl.TEXTURE_2D,
        context.gl.TEXTURE_WRAP_T,
        context.gl.REPEAT
      )
      context.gl.texImage2D(
        context.gl.TEXTURE_2D,
        0,
        context.gl.RGB,
        1,
        1,
        0,
        context.gl.RGB,
        context.gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255])
      )

      let obj: WebGLFBO = {
        texture,
        width: 1,
        height: 1,
        attach(id: number) {
          context.gl.activeTexture(context.gl.TEXTURE0 + id)
          context.gl.bindTexture(context.gl.TEXTURE_2D, texture)
          return id
        }
      }

      let image = new Image()
      image.onload = () => {
        obj.width = image.width
        obj.height = image.height
        context.gl.bindTexture(context.gl.TEXTURE_2D, texture)
        context.gl.texImage2D(
          context.gl.TEXTURE_2D,
          0,
          context.gl.RGB,
          context.gl.RGB,
          context.gl.UNSIGNED_BYTE,
          image
        )
      }
      image.src = url
      return obj
    }

    const updateKeywords = () => {
      const displayKeywords: string[] = []
      if (GL_CONFIGS.SHADING) displayKeywords.push('SHADING')
      if (GL_CONFIGS.BLOOM) displayKeywords.push('BLOOM')
      if (GL_CONFIGS.SUNRAYS) displayKeywords.push('SUNRAYS')
      displayMaterial.setKeywords(...displayKeywords)
    }

    updateKeywords()
    initFramebuffers()
    multipleSplats(canvas, Math.floor(Math.random() * 20) + 5)

    let lastUpdateTime = Date.now()
    let colorUpdateTimer = 0.0

    const calcDeltaTime = () => {
      const now = Date.now()
      const dt = Math.min((now - lastUpdateTime) / 1000, 0.016666)
      lastUpdateTime = now
      return dt
    }

    const updateColors = (dt: number) => {
      if (!GL_CONFIGS.COLORFUL) return
      colorUpdateTimer += dt * GL_CONFIGS.COLOR_UPDATE_SPEED
      if (colorUpdateTimer >= 1) {
        colorUpdateTimer = wrap(colorUpdateTimer, 0, 1)
        pointers.forEach((p) => {
          p.color = colorGenerator()
        })
      }
    }

    const applyInputs = () => {
      if (splatStack.length > 0) multipleSplats(canvas, splatStack.pop())

      pointers.forEach((p) => {
        if (p.moved) {
          p.moved = false
          splatPointer(p)
        }
      })
    }

    const step = (dt: number) => {
      context.gl.disable(context.gl.BLEND)

      curlProgram.bind()
      context.gl.uniform2f(
        curlProgram.uniforms.texelSize,
        velocity?.texelSizeX ?? 0 ?? 0,
        velocity?.texelSizeY ?? 0 ?? 0
      )
      context.gl.uniform1i(
        curlProgram.uniforms.uVelocity,
        velocity?.read?.attach ? velocity.read.attach(0) : 0
      )
      blit(curl)

      vorticityProgram.bind()
      context.gl.uniform2f(
        vorticityProgram.uniforms.texelSize,
        velocity?.texelSizeX ?? 0 ?? 0,
        velocity?.texelSizeY ?? 0 ?? 0
      )
      context.gl.uniform1i(
        vorticityProgram.uniforms.uVelocity,
        velocity?.read?.attach ? velocity.read.attach(0) : 0
      )
      if (curl?.attach)
        context.gl.uniform1i(vorticityProgram.uniforms.uCurl, curl.attach(1))
      context.gl.uniform1f(vorticityProgram.uniforms.curl, GL_CONFIGS.CURL)
      context.gl.uniform1f(vorticityProgram.uniforms.dt, dt)
      if (velocity && velocity.write) blit(velocity.write)
      if (velocity?.swap) velocity.swap()

      divergenceProgram.bind()
      context.gl.uniform2f(
        divergenceProgram.uniforms.texelSize,
        velocity?.texelSizeX ?? 0,
        velocity?.texelSizeY ?? 0
      )
      context.gl.uniform1i(
        divergenceProgram.uniforms.uVelocity,
        velocity?.read?.attach ? velocity.read.attach(0) : 0
      )
      blit(divergence)

      clearProgram.bind()
      context.gl.uniform1i(
        clearProgram.uniforms.uTexture,
        pressure?.read?.attach ? pressure.read.attach(0) : 0
      )
      context.gl.uniform1f(clearProgram.uniforms.value, GL_CONFIGS.PRESSURE)
      if (pressure?.write) blit(pressure.write)
      if (pressure?.swap) pressure.swap()

      pressureProgram.bind()
      context.gl.uniform2f(
        pressureProgram.uniforms.texelSize,
        velocity?.texelSizeX ?? 0,
        velocity?.texelSizeY ?? 0
      )
      if (divergence?.attach)
        context.gl.uniform1i(
          pressureProgram.uniforms.uDivergence,
          divergence.attach(0)
        )
      for (let i = 0; i < GL_CONFIGS.PRESSURE_ITERATIONS; i++) {
        if (pressure.read && pressure.read.attach)
          context.gl.uniform1i(
            pressureProgram.uniforms.uPressure,
            pressure?.read?.attach ? pressure.read.attach(1) : 1
          )
        if (pressure.write) blit(pressure.write)
        if (pressure.swap) pressure.swap()
      }

      gradientSubtractProgram.bind()
      context.gl.uniform2f(
        gradientSubtractProgram.uniforms.texelSize,
        velocity?.texelSizeX ?? 0,
        velocity?.texelSizeY ?? 0
      )
      context.gl.uniform1i(
        gradientSubtractProgram.uniforms.uPressure,
        pressure?.read?.attach ? pressure.read.attach(0) : 0
      )
      context.gl.uniform1i(
        gradientSubtractProgram.uniforms.uVelocity,
        velocity?.read?.attach ? velocity.read.attach(1) : 1
      )
      if (velocity?.write) blit(velocity.write)
      if (velocity?.swap) velocity.swap()

      advectionProgram.bind()
      context.gl.uniform2f(
        advectionProgram.uniforms.texelSize,
        velocity?.texelSizeX ?? 0,
        velocity?.texelSizeY ?? 0
      )
      if (!context.ext.supportLinearFiltering)
        context.gl.uniform2f(
          advectionProgram.uniforms.dyeTexelSize,
          velocity?.texelSizeX ?? 0,
          velocity?.texelSizeY ?? 0
        )
      let velocityId = velocity?.read?.attach ? velocity.read.attach(0) : 0
      context.gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId)
      context.gl.uniform1i(advectionProgram.uniforms.uSource, velocityId)
      context.gl.uniform1f(advectionProgram.uniforms.dt, dt)
      context.gl.uniform1f(
        advectionProgram.uniforms.dissipation,
        GL_CONFIGS.VELOCITY_DISSIPATION
      )
      if (velocity?.write) blit(velocity.write)
      if (velocity?.swap) velocity.swap()

      if (!context.ext.supportLinearFiltering)
        context.gl.uniform2f(
          advectionProgram.uniforms.dyeTexelSize,
          dye?.texelSizeX ?? 0,
          dye?.texelSizeY ?? 0
        )
      context.gl.uniform1i(
        advectionProgram.uniforms.uVelocity,
        velocity?.read?.attach ? velocity.read.attach(0) : 0
      )
      context.gl.uniform1i(
        advectionProgram.uniforms.uSource,
        dye?.read?.attach ? dye.read.attach(1) : 1
      )
      context.gl.uniform1f(
        advectionProgram.uniforms.dissipation,
        GL_CONFIGS.DENSITY_DISSIPATION
      )
      if (dye?.write) blit(dye.write)
      if (dye?.swap) dye.swap()
    }

    const render = (target: WebGLFBO | null) => {
      if (GL_CONFIGS.BLOOM && dye?.read) applyBloom(dye.read, bloom)
      if (GL_CONFIGS.SUNRAYS) {
        if (dye?.read && dye?.write) applySunrays(dye.read, dye.write, sunrays)
        blur(sunrays, sunraysTemp, 1)
      }

      if (!target || !GL_CONFIGS.TRANSPARENT) {
        context.gl.blendFunc(context.gl.ONE, context.gl.ONE_MINUS_SRC_ALPHA)
        context.gl.enable(context.gl.BLEND)
      } else {
        context.gl.disable(context.gl.BLEND)
      }

      if (!GL_CONFIGS.TRANSPARENT)
        drawColor(target, normalizeColor(GL_CONFIGS.BACK_COLOR))
      if (!target && GL_CONFIGS.TRANSPARENT) drawCheckerboard(target)
      drawDisplay(target)
    }

    const drawColor = (target: WebGLFBO | null, color: ColorLike) => {
      colorProgram.bind()
      context.gl.uniform4f(
        colorProgram.uniforms.color,
        color.r,
        color.g,
        color.b,
        1
      )
      blit(target)
    }

    const drawCheckerboard = (target: WebGLFBO | null) => {
      if (!canvas) return
      checkerboardProgram.bind()
      context.gl.uniform1f(
        checkerboardProgram.uniforms.aspectRatio,
        canvas.width / canvas.height
      )
      blit(target)
    }

    const drawDisplay = (target: WebGLFBO | null) => {
      let width = (!target ? context.gl.drawingBufferWidth : target.width) ?? 1
      let height =
        (!target ? context.gl.drawingBufferHeight : target.height) ?? 1
      displayMaterial.bind()
      if (GL_CONFIGS.SHADING)
        context.gl.uniform2f(
          displayMaterial.uniforms.texelSize,
          1.0 / width,
          1.0 / height
        )
      context.gl.uniform1i(
        displayMaterial.uniforms.uTexture,
        dye?.read?.attach ? dye.read.attach(0) : 0
      )
      if (GL_CONFIGS.BLOOM) {
        context.gl.uniform1i(
          displayMaterial.uniforms.uBloom,
          bloom?.attach ? bloom.attach(1) : 1
        )
        context.gl.uniform1i(
          displayMaterial.uniforms.uDithering,
          ditheringTexture?.attach ? ditheringTexture.attach(2) : 2
        )
        let scale = getTextureScale(ditheringTexture, width, height)
        context.gl.uniform2f(
          displayMaterial.uniforms.ditherScale,
          scale.x,
          scale.y
        )
      }
      if (GL_CONFIGS.SUNRAYS)
        context.gl.uniform1i(
          displayMaterial.uniforms.uSunrays,
          sunrays?.attach ? sunrays.attach(3) : 3
        )
      blit(target)
    }

    const applyBloom = (source: WebGLFBO, destination: WebGLFBO) => {
      if (bloomFramebuffers.length < 2) return
      let last = destination
      context.gl.disable(context.gl.BLEND)
      bloomPrefilterProgram.bind()
      let knee =
        GL_CONFIGS.BLOOM_THRESHOLD * GL_CONFIGS.BLOOM_SOFT_KNEE + 0.0001
      let curve0 = GL_CONFIGS.BLOOM_THRESHOLD - knee
      let curve1 = knee * 2
      let curve2 = 0.25 / knee
      context.gl.uniform3f(
        bloomPrefilterProgram.uniforms.curve,
        curve0,
        curve1,
        curve2
      )
      context.gl.uniform1f(
        bloomPrefilterProgram.uniforms.threshold,
        GL_CONFIGS.BLOOM_THRESHOLD
      )
      context.gl.uniform1i(
        bloomPrefilterProgram.uniforms.uTexture,
        source?.attach ? source.attach(0) : 0
      )
      blit(last)
      bloomBlurProgram.bind()
      for (let i = 0; i < bloomFramebuffers.length; i++) {
        let dest = bloomFramebuffers[i]
        context.gl.uniform2f(
          bloomBlurProgram.uniforms.texelSize,
          last?.texelSizeX ?? 0,
          last?.texelSizeY ?? 0
        )
        context.gl.uniform1i(
          bloomBlurProgram.uniforms.uTexture,
          last?.attach ? last.attach(0) : 0
        )
        blit(dest)
        last = dest
      }
      context.gl.blendFunc(context.gl.ONE, context.gl.ONE)
      context.gl.enable(context.gl.BLEND)
      for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
        let baseTex = bloomFramebuffers[i]
        context.gl.uniform2f(
          bloomBlurProgram.uniforms.texelSize,
          last?.texelSizeX ?? 0,
          last?.texelSizeY ?? 0
        )
        context.gl.uniform1i(
          bloomBlurProgram.uniforms.uTexture,
          last?.attach ? last.attach(0) : 0
        )
        context.gl.viewport(0, 0, baseTex.width ?? 0, baseTex.height ?? 0)
        blit(baseTex)
        last = baseTex
      }
      context.gl.disable(context.gl.BLEND)
      bloomFinalProgram.bind()
      context.gl.uniform2f(
        bloomFinalProgram.uniforms.texelSize,
        last?.texelSizeX ?? 0,
        last?.texelSizeY ?? 0
      )
      context.gl.uniform1i(
        bloomFinalProgram.uniforms.uTexture,
        last?.attach ? last.attach(0) : 0
      )
      context.gl.uniform1f(
        bloomFinalProgram.uniforms.intensity,
        GL_CONFIGS.BLOOM_INTENSITY
      )
      blit(destination)
    }

    const applySunrays = (
      source: WebGLFBO,
      mask: WebGLFBO,
      destination: WebGLFBO
    ) => {
      context.gl.disable(context.gl.BLEND)
      sunraysMaskProgram.bind()
      context.gl.uniform1i(
        sunraysMaskProgram.uniforms.uTexture,
        source?.attach ? source.attach(0) : 0
      )
      blit(mask)
      sunraysProgram.bind()
      context.gl.uniform1f(
        sunraysProgram.uniforms.weight,
        GL_CONFIGS.SUNRAYS_WEIGHT
      )
      context.gl.uniform1i(
        sunraysProgram.uniforms.uTexture,
        mask?.attach ? mask.attach(0) : 0
      )
      blit(destination)
    }

    const blur = (target: WebGLFBO, temp: WebGLFBO, iterations: number) => {
      blurProgram.bind()
      for (let i = 0; i < iterations; i++) {
        context.gl.uniform2f(
          blurProgram.uniforms.texelSize,
          target?.texelSizeX ?? 0,
          0.0
        )
        context.gl.uniform1i(
          blurProgram.uniforms.uTexture,
          target?.attach ? target.attach(0) : 0
        )
        blit(temp)

        context.gl.uniform2f(
          blurProgram.uniforms.texelSize,
          0.0,
          target?.texelSizeY ?? 0
        )
        context.gl.uniform1i(
          blurProgram.uniforms.uTexture,
          temp?.attach ? temp.attach(0) : 0
        )
        blit(target)
      }
    }

    function splat(
      canvas: HTMLCanvasElement,
      x: number,
      y: number,
      dx: number,
      dy: number,
      color: ColorLike
    ) {
      splatProgram.bind()
      context.gl.uniform1i(
        splatProgram.uniforms.uTarget,
        velocity?.read?.attach ? velocity.read.attach(0) : 0
      )
      context.gl.uniform1f(
        splatProgram.uniforms.aspectRatio,
        canvas.width / canvas.height
      )
      context.gl.uniform2f(splatProgram.uniforms.point, x, y)
      context.gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0.0)
      context.gl.uniform1f(
        splatProgram.uniforms.radius,
        correctRadius(canvas, GL_CONFIGS.SPLAT_RADIUS / 100.0)
      )
      if (velocity?.write) blit(velocity.write)
      if (velocity?.swap) velocity.swap()

      context.gl.uniform1i(
        splatProgram.uniforms.uTarget,
        dye?.read?.attach ? dye.read.attach(0) : 0
      )
      context.gl.uniform3f(
        splatProgram.uniforms.color,
        color.r,
        color.g,
        color.b
      )
      if (dye?.write) blit(dye.write)
      if (dye?.swap) dye.swap()
    }

    const splatPointer = (pointer: Pointer) => {
      let dx = pointer.deltaX * GL_CONFIGS.SPLAT_FORCE
      let dy = pointer.deltaY * GL_CONFIGS.SPLAT_FORCE
      splat(canvas, pointer.texcoordX, pointer.texcoordY, dx, dy, pointer.color)
    }

    function multipleSplats(canvas: HTMLCanvasElement, amount: number = 0) {
      for (let i = 0; i < amount; i++) {
        const color = colorGenerator()
        color.r *= 10.0
        color.g *= 10.0
        color.b *= 10.0
        const x = Math.random()
        const y = Math.random()
        const dx = 1000 * (Math.random() - 0.5)
        const dy = 1000 * (Math.random() - 0.5)
        splat(canvas, x, y, dx, dy, color)
      }
    }

    function correctRadius(canvas: HTMLCanvasElement, radius: number) {
      let aspectRatio = canvas.width / canvas.height
      if (aspectRatio > 1) radius *= aspectRatio
      return radius
    }

    window.addEventListener(
      'mousedown',
      (e) => {
        const rect = canvas.getBoundingClientRect()
        let posX = scaleByPixelRatio(e.clientX - rect.x)
        let posY = scaleByPixelRatio(e.clientY - rect.y)
        let pointer = pointers.find((p) => p.id === -1)
        if (!pointer) pointer = new Pointer()
        updatePointerDownData(pointer, -1, posX, posY)
      },
      { passive: false }
    )

    window.addEventListener(
      'mousemove',
      (e) => {
        let pointer = pointers[0]
        if (!pointer.down) return
        const rect = canvas.getBoundingClientRect()
        let posX = scaleByPixelRatio(e.clientX - rect.x)
        let posY = scaleByPixelRatio(e.clientY - rect.y)
        updatePointerMoveData(pointer, posX, posY)
      },
      { passive: false }
    )

    window.addEventListener(
      'mouseup',
      () => {
        updatePointerUpData(pointers[0])
      },
      { passive: false }
    )

    window.addEventListener(
      'touchstart',
      (e) => {
        if (
          /Mui(?:Backdrop|(?:Icon)?Button|Card|Typography)/i.test(
            (e.target as Element).className
          )
        )
          return
        e.preventDefault()
        const touches = e.targetTouches
        while (touches.length >= pointers.length) pointers.push(new Pointer())
        const rect = canvas.getBoundingClientRect()
        for (let i = 0; i < touches.length; i++) {
          let posX = scaleByPixelRatio(touches[i].clientX - rect.x)
          let posY = scaleByPixelRatio(touches[i].clientY - rect.y)
          updatePointerDownData(
            pointers[i + 1],
            touches[i].identifier,
            posX,
            posY
          )
        }
      },
      { passive: false }
    )

    window.addEventListener(
      'touchmove',
      (e) => {
        if (
          /Mui(?:Backdrop|(?:Icon)?Button|Card|Typography)/i.test(
            (e.target as Element).className
          )
        )
          return
        e.preventDefault()
        const touches = e.targetTouches
        const rect = canvas.getBoundingClientRect()
        for (let i = 0; i < touches.length; i++) {
          let pointer = pointers[i + 1]
          if (!pointer.down) continue
          let posX = scaleByPixelRatio(touches[i].clientX - rect.x)
          let posY = scaleByPixelRatio(touches[i].clientY - rect.y)
          updatePointerMoveData(pointer, posX, posY)
        }
      },
      { passive: false }
    )

    window.addEventListener(
      'touchend',
      (e) => {
        const touches = e.changedTouches
        for (let i = 0; i < touches.length; i++) {
          let pointer = pointers.find((p) => p.id === touches[i].identifier)
          if (!pointer) continue
          updatePointerUpData(pointer)
        }
      },
      { passive: false }
    )

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyP') GL_CONFIGS.PAUSED = !GL_CONFIGS.PAUSED
      if (e.key === ' ')
        splatStack.push(
          typeof GL_CONFIGS.SPLAT_COUNT === 'number'
            ? GL_CONFIGS.SPLAT_COUNT
            : GL_CONFIGS.SPLAT_COUNT()
        )
    })

    let resizeTimeout: NodeJS.Timeout
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        resizeCanvas(canvas)
        initFramebuffers()
      }, GL_CONFIGS.RESIZE_DELAY)
    })

    const updatePointerDownData = (
      pointer: Pointer,
      id: number,
      posX: number,
      posY: number
    ) => {
      pointer.id = id
      pointer.down = true
      pointer.moved = false
      pointer.texcoordX = posX / canvas.width
      pointer.texcoordY = 1.0 - posY / canvas.height
      pointer.prevTexcoordX = pointer.texcoordX
      pointer.prevTexcoordY = pointer.texcoordY
      pointer.deltaX = 0
      pointer.deltaY = 0
      pointer.color = colorGenerator()
    }

    const updatePointerMoveData = (
      pointer: Pointer,
      posX: number,
      posY: number
    ) => {
      pointer.prevTexcoordX = pointer.texcoordX
      pointer.prevTexcoordY = pointer.texcoordY
      pointer.texcoordX = posX / canvas.width
      pointer.texcoordY = 1.0 - posY / canvas.height
      pointer.deltaX = correctDeltaX(pointer.texcoordX - pointer.prevTexcoordX)
      pointer.deltaY = correctDeltaY(pointer.texcoordY - pointer.prevTexcoordY)
      pointer.moved =
        Math.abs(pointer.deltaX) > 0 || Math.abs(pointer.deltaY) > 0
    }

    const updatePointerUpData = (pointer: Pointer) => {
      pointer.down = false
    }

    const correctDeltaX = (delta: number) => {
      let aspectRatio = canvas.width / canvas.height
      if (aspectRatio < 1) delta *= aspectRatio
      return delta
    }

    const correctDeltaY = (delta: number) => {
      let aspectRatio = canvas.width / canvas.height
      if (aspectRatio > 1) delta /= aspectRatio
      return delta
    }

    const update = () => {
      const dt = calcDeltaTime()
      updateColors(dt)
      applyInputs()
      if (!GL_CONFIGS.PAUSED) step(dt)
      render(null)
      requestAnimationFrame(update)
    }

    resizeCanvas(canvas)
    update()

    setInterval(() => {
      if (splatStack.length > 0) return
      splatStack.push(
        typeof GL_CONFIGS.SPLAT_COUNT === 'number'
          ? GL_CONFIGS.SPLAT_COUNT
          : GL_CONFIGS.SPLAT_COUNT()
      )
    }, GL_CONFIGS.SPLAT_RATE)
  }, [canvas, colorGenerator])

  return <StyledCanvas ref={refCanvas} fixed={fixed} />
}

export default WebGLFluidSim
