const canvas = document.querySelector("#gas");
const grid = document.querySelector("[data-plugin-grid]");
const pluginStat = document.querySelector('[data-stat="plugin-count"]');
const endpointStat = document.querySelector('[data-stat="endpoint-count"]');
const fpsStat = document.querySelector('[data-stat="fps"]');

const pointer = { x: 0.64, y: 0.38, active: 0 };
let fpsFrames = 0;
let fpsStamp = performance.now();

const fallbackPlugins = [
  {
    id: "craw",
    name: "craw",
    title: "Craw",
    description: "Base host and plugin endpoint runtime for public-page scraping.",
    version: "0.1.0",
    npmName: "@agnamo/craw",
    kind: "host",
    endpoints: ["scrape", "doctor", "plugins"],
    vertical: "base",
    license: "MIT",
    homepage: "https://github.com/LuxDevNet/craw",
  },
];

const vert = `#version 300 es
precision highp float;
layout(location=0) in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const frag = `#version 300 es
precision highp float;
out vec4 o;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uPtr;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 6; i++) { v += a * noise(p); p *= 2.03; a *= 0.52; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float t = uTime * 0.08;
  vec2 q = p * 1.7 + vec2(t * 0.21, -t * 0.13);
  float cloud = fbm(q + fbm(q * 1.6 + vec2(t, -t)));
  float bubble = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(t * 0.7 + fi * 1.7), cos(t * 0.55 + fi * 1.3)) * 0.55;
    c += (uPtr - 0.5) * 0.35;
    float d = length(p - c);
    bubble += smoothstep(0.42, 0.04, d) * (0.35 + 0.2 * sin(t * 2.0 + fi));
  }
  float fog = pow(clamp(cloud * 0.85 + bubble, 0.0, 1.0), 1.25);
  vec3 toxic = vec3(0.72, 1.0, 0.05);
  vec3 deep = vec3(0.01, 0.03, 0.0);
  vec3 col = mix(deep, toxic, fog);
  col += toxic * pow(bubble, 2.4) * 0.85;
  o = vec4(col, 1.0);
}`;

function tickFps(now) {
  fpsFrames += 1;
  if (now - fpsStamp >= 500) {
    const fps = Math.round((fpsFrames * 1000) / (now - fpsStamp));
    if (fpsStat) fpsStat.textContent = String(fps);
    fpsFrames = 0;
    fpsStamp = now;
  }
}

function startWebGL() {
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, powerPreference: "high-performance" });
  if (!gl) return false;
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "shader");
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vert));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "link");
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(program, "uRes");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uPtr = gl.getUniformLocation(program, "uPtr");
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  const draw = (now) => {
    gl.useProgram(program);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, now * 0.001);
    gl.uniform2f(uPtr, pointer.x, 1 - pointer.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    tickFps(now);
    requestAnimationFrame(draw);
  };
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
  return true;
}

function startCanvas2D() {
  const ctx = canvas.getContext("2d", { alpha: true });
  const particles = [];
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2.75);
    canvas.width = Math.floor(window.innerWidth * ratio);
    canvas.height = Math.floor(window.innerHeight * ratio);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const target = Math.max(56, Math.min(132, Math.floor((window.innerWidth * window.innerHeight) / 12800)));
    while (particles.length < target) {
      particles.push({
        x: Math.random(),
        y: Math.random(),
        r: 34 + Math.random() * 180,
        vx: (Math.random() - 0.5) * 0.0002,
        vy: (Math.random() - 0.5) * 0.0002,
        pulse: Math.random() * Math.PI * 2,
        alpha: 0.05 + Math.random() * 0.1,
      });
    }
  };
  const draw = (now) => {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.globalCompositeOperation = "lighter";
    for (const particle of particles) {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.pulse += 0.002;
      const x = (particle.x + (pointer.x - 0.5) * 0.04) * window.innerWidth;
      const y = (particle.y + (pointer.y - 0.5) * 0.04) * window.innerHeight;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, particle.r);
      gradient.addColorStop(0, `hsla(82, 100%, 58%, ${particle.alpha * 1.6})`);
      gradient.addColorStop(1, "hsla(82, 100%, 40%, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, particle.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    tickFps(now);
    requestAnimationFrame(draw);
  };
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
}

function text(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function endpointCount(plugins) {
  return plugins.reduce((total, plugin) => total + (Array.isArray(plugin.endpoints) ? plugin.endpoints.length : 0), 0);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "http:" || url.protocol === "https:" ? text(url.href) : "";
  } catch {
    return "";
  }
}

function renderPlugins(plugins) {
  grid.innerHTML = "";
  for (const plugin of plugins) {
    const card = document.createElement("article");
    card.className = "card";
    const endpoints = Array.isArray(plugin.endpoints) ? plugin.endpoints : [];
    const homepage = safeUrl(plugin.homepage);
    card.innerHTML = `
      <span class="kind">${text(plugin.kind)} / ${text(plugin.vertical)}</span>
      <h3>${text(plugin.title || plugin.name || plugin.id)}</h3>
      <p>${text(plugin.description)}</p>
      <div class="meta">
        <span>${text(plugin.npmName)}</span>
        <span>v${text(plugin.version)}</span>
        <span>${text(plugin.license)}</span>
      </div>
      <div class="chips">
        ${endpoints.map((endpoint) => `<span class="chip">${text(endpoint)}</span>`).join("")}
      </div>
      ${homepage ? `<a href="${homepage}" rel="noreferrer">Open homepage</a>` : ""}
    `;
    grid.append(card);
  }
  pluginStat.textContent = String(plugins.length);
  endpointStat.textContent = String(endpointCount(plugins));
}

async function loadPlugins() {
  try {
    const response = await fetch("./plugins.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`plugins.json ${response.status}`);
    const payload = await response.json();
    const plugins = Array.isArray(payload.plugins) ? payload.plugins : fallbackPlugins;
    renderPlugins(plugins);
  } catch (error) {
    console.warn("Using fallback plugin data", error);
    renderPlugins(fallbackPlugins);
  }
}

window.addEventListener("pointermove", (event) => {
  pointer.x = event.clientX / window.innerWidth;
  pointer.y = event.clientY / window.innerHeight;
  pointer.active = 1;
});
window.addEventListener("pointerleave", () => {
  pointer.active = 0;
});

try {
  if (!startWebGL()) startCanvas2D();
} catch {
  startCanvas2D();
}
loadPlugins();
