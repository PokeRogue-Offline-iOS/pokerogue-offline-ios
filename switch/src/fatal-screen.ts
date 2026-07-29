import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./constants";

interface FatalScreenDetail {
  stage: string;
  name: string;
  message: string;
  resource: string | null;
  logPath: string;
}

function wrapText(
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function makeErrorCanvas(detail: FatalScreenDetail): OffscreenCanvas {
  const canvas = new OffscreenCanvas(SCREEN_WIDTH, SCREEN_HEIGHT);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create the offscreen fatal-error canvas.");
  }
  context.fillStyle = "#170b14";
  context.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  context.fillStyle = "#ff6b8a";
  context.font = "bold 38px system-ui";
  context.fillText("SilverShadow PokeRogue encountered an error.", 56, 84);
  context.fillStyle = "#ffffff";
  context.font = "24px system-ui";
  context.fillText(`Stage: ${detail.stage}`, 56, 132);
  context.fillStyle = "#ffc8d5";
  context.font = "19px system-ui";
  const summary = `${detail.name}: ${detail.message}`;
  wrapText(context, summary, SCREEN_WIDTH - 112)
    .slice(0, 8)
    .forEach((line, index) => context.fillText(line, 56, 190 + index * 28));
  if (detail.resource) {
    context.fillStyle = "#d8c7d2";
    wrapText(context, `Resource: ${detail.resource}`, SCREEN_WIDTH - 112)
      .slice(0, 2)
      .forEach((line, index) => context.fillText(line, 56, 442 + index * 26));
  }
  context.fillStyle = "#aeb4c4";
  context.fillText("Return the newest log and a photo of this screen. Exit with HOME.", 56, 620);
  context.fillText(`Log: ${detail.logPath.replace(/^sdmc:/, "")}`, 56, 658);
  return canvas;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Could not create a WebGL fatal-screen shader.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Fatal-screen shader compilation failed: ${gl.getShaderInfoLog(shader) ?? "unknown"}`);
  }
  return shader;
}

export function showWebGlFatalScreen(detail: FatalScreenDetail): boolean {
  const global = globalThis as any;
  const gl =
    (global.__SILVERSHADOW_WEBGL2_CONTEXT__ as WebGL2RenderingContext | undefined) ??
    ((screen as any).getContext("webgl2") as WebGL2RenderingContext | null);
  if (!gl) {
    return false;
  }

  const canvas = makeErrorCanvas(detail);
  const vertex = compileShader(
    gl,
    gl.VERTEX_SHADER,
    `#version 300 es
    precision highp float;
    out vec2 fatalUv;
    void main() {
      vec2 position = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
      fatalUv = vec2(position.x, 1.0 - position.y);
      gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
    }`,
  );
  const fragment = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    `#version 300 es
    precision mediump float;
    uniform sampler2D fatalTexture;
    in vec2 fatalUv;
    out vec4 outputColor;
    void main() {
      outputColor = texture(fatalTexture, fatalUv);
    }`,
  );
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Could not create the WebGL fatal-screen program.");
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Fatal-screen program link failed: ${gl.getProgramInfoLog(program) ?? "unknown"}`);
  }

  const texture = gl.createTexture();
  const vertexArray = gl.createVertexArray();
  if (!texture || !vertexArray) {
    throw new Error("Could not allocate WebGL fatal-screen resources.");
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

  const draw = (): void => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.colorMask(true, true, true, true);
    gl.viewport(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    gl.useProgram(program);
    gl.bindVertexArray(vertexArray);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(gl.getUniformLocation(program, "fatalTexture"), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return true;
}
