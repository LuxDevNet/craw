import { Writable } from "node:stream";
import { dispatchDoctor, dispatchScrape } from "../dispatch.ts";
import { getPlugin, type PluginManifest } from "../plugin.ts";

type PaletteCommand = {
  id: string;
  title: string;
  detail: string;
  slash: string;
  row?: number;
  run: () => Promise<string>;
};

type View = "home" | "palette" | "plugins" | "plugin" | "help";

type HitTarget = { row: number; id: string; kind: "command" | "plugin" | "nav" };

type InteractiveState = {
  view: View;
  query: string;
  selected: number;
  pluginIndex: number;
  logs: string[];
  busy: boolean;
  frame: number;
};

type InteractiveOptions = {
  manifests: PluginManifest[];
  stdin?: NodeJS.ReadStream;
  stdout?: Writable & { isTTY?: boolean; columns?: number };
  scrape?: typeof dispatchScrape;
  doctor?: typeof dispatchDoctor;
};

const lime = "\x1b[38;2;184;255;0m";
const limeDim = "\x1b[38;2;115;158;0m";
const fog = "\x1b[38;2;84;116;42m";
const text = "\x1b[38;2;220;255;186m";
const muted = "\x1b[38;2;111;132;83m";
const reset = "\x1b[0m";
const inverse = "\x1b[7m";
const altOn = "\x1b[?1049h";
const altOff = "\x1b[?1049l";
const hideCursor = "\x1b[?25l";
const showCursor = "\x1b[?25h";
const mouseOn = "\x1b[?1000h\x1b[?1006h\x1b[?1002h";
const mouseOff = "\x1b[?1000l\x1b[?1006l\x1b[?1002l";
const homeErase = "\x1b[H\x1b[J";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function stripSlash(value: string) {
  return value.startsWith("/") ? value.slice(1) : value;
}

function summarizePlugin(plugin: PluginManifest) {
  const loaded = getPlugin(plugin.id);
  const hooks = [loaded?.scrape && "scrape", loaded?.run && "run", loaded?.doctor && "doctor"].filter(Boolean);
  return `${plugin.kind}/${plugin.vertical} ${plugin.npmName} ${hooks.length ? hooks.join(",") : "unloaded"}`;
}

const GAS_FRAMES = ["o O o", "O o O", "o o O", "O O o"];

function makeCommands(
  manifests: PluginManifest[],
  outputJson: () => string,
  scrape: typeof dispatchScrape,
  doctor: typeof dispatchDoctor,
  state: InteractiveState,
): PaletteCommand[] {
  const builtins: PaletteCommand[] = [
    {
      id: "doctor",
      title: "Run doctor",
      detail: "Check runtime prerequisites and package health",
      slash: "/doctor",
      run: async () => (await doctor()).text,
    },
    {
      id: "plugins-json",
      title: "Print plugins JSON",
      detail: "Emit the marketplace manifest envelope",
      slash: "/plugins --json",
      run: async () => outputJson(),
    },
    {
      id: "plugins",
      title: "Open plugin list",
      detail: "Browse loaded plugin manifests",
      slash: "/plugins",
      run: async () => "opened plugin list",
    },
    {
      id: "scrape",
      title: "Scrape URL",
      detail: "Use /scrape <url> to run the host public-page scraper",
      slash: "/scrape https://example.com",
      run: async () => {
        const url = stripSlash(state.query).split(/\s+/).slice(1)[0] ?? "https://example.com";
        return (await scrape([url])).text;
      },
    },
  ];

  const pluginCommands = manifests.flatMap((plugin) => {
    const loaded = getPlugin(plugin.id);
    return plugin.endpoints
      .filter((endpoint) => endpoint !== "plugins")
      .map((endpoint) => ({
        id: `${plugin.id}:${endpoint}`,
        title: `${plugin.title} ${endpoint}`,
        detail: loaded?.[endpoint as "scrape" | "run" | "doctor"]
          ? `${summarizePlugin(plugin)} · loaded`
          : `${summarizePlugin(plugin)} · missing hook`,
        slash: `/${plugin.id} ${endpoint}`,
        run: async () => {
          if (endpoint === "doctor") return (await doctor(plugin.id)).text;
          if (endpoint === "scrape") {
            const url = stripSlash(state.query).split(/\s+/).find((part) => part.startsWith("http")) ?? "https://example.com";
            return (await scrape([url], {}, plugin.id)).text;
          }
          return `plugin ${plugin.id} ${endpoint} is loaded=${Boolean(loaded?.[endpoint as "run"])}`;
        },
      }));
  });

  return [...builtins, ...pluginCommands].sort((a, b) => a.title.localeCompare(b.title));
}

function filterCommands(commands: PaletteCommand[], query: string) {
  const clean = stripSlash(query).trim().toLowerCase();
  if (!clean) return commands;
  const terms = clean.split(/\s+/);
  return commands.filter((command) => {
    const haystack = `${command.title} ${command.detail} ${command.slash}`.toLowerCase();
    return terms.every((term) => haystack.includes(term) || command.id.includes(term));
  });
}

function renderHeader(width: number, state: InteractiveState, manifests: PluginManifest[]) {
  const gas = GAS_FRAMES[state.frame % GAS_FRAMES.length]!;
  const title = "CRAW";
  const line = "═".repeat(Math.max(8, width - 2));
  return [
    `${lime}╔${line}╗${reset}`,
    `${lime}║${reset} ${lime}${title}${reset} ${fog}${gas.padEnd(Math.max(0, width - title.length - 9)).slice(0, Math.max(0, width - title.length - 9))}${reset}${lime}║${reset}`,
    `${lime}╚${line}╝${reset}`,
    `${muted}${manifests.length} loaded plugins · click or arrows · enter runs · / commands · p palette · q quit${reset}`,
    "",
  ].join("\n");
}

function renderHome(state: InteractiveState, commands: PaletteCommand[], manifests: PluginManifest[], hits: HitTarget[]) {
  const featured = commands.slice(0, 7);
  const lines = [
    `${text}Toxic plugin host online.${reset} ${muted}Alt-screen, mouse, nested plugin menus, live scrape.${reset}`,
    "",
    `${limeDim}Commands${reset}`,
  ];
  featured.forEach((command, index) => {
    const row = 7 + index;
    hits.push({ row, id: command.id, kind: "command" });
    lines.push(`${index === state.selected ? `${lime}>` : " "} ${text}${command.title}${reset} ${muted}${command.slash}${reset}`);
  });
  lines.push("", `${limeDim}Plugins${reset}`);
  manifests.slice(0, 5).forEach((plugin, index) => {
    hits.push({ row: 16 + index, id: plugin.id, kind: "plugin" });
    lines.push(`  ${text}${plugin.title}${reset} ${muted}${summarizePlugin(plugin)}${reset}`);
  });
  lines.push("", `${muted}Click a row, press p for palette, l for plugins, / for slash, ? for help.${reset}`);
  return lines.join("\n");
}

function renderPalette(state: InteractiveState, commands: PaletteCommand[], hits: HitTarget[]) {
  const filtered = filterCommands(commands, state.query);
  const selected = clamp(state.selected, 0, Math.max(0, filtered.length - 1));
  const lines = [`${limeDim}Command palette${reset}`, `${lime}> ${reset}${text}${state.query || ""}${reset}`, ""];
  if (!filtered.length) {
    lines.push(`${muted}No commands matched. Try /plugins, /doctor, or /scrape <url>.${reset}`);
    return lines.join("\n");
  }
  filtered.slice(0, 12).forEach((command, index) => {
    hits.push({ row: 8 + index, id: command.id, kind: "command" });
    const active = index === selected;
    const prefix = active ? `${inverse}${lime} ${reset}${lime}>${reset}` : "  ";
    lines.push(`${prefix} ${text}${command.title}${reset} ${muted}${command.slash} · ${command.detail}${reset}`);
  });
  return lines.join("\n");
}

function renderPlugins(state: InteractiveState, manifests: PluginManifest[], hits: HitTarget[]) {
  const selected = clamp(state.selected, 0, Math.max(0, manifests.length - 1));
  const lines = [`${limeDim}Loaded plugins${reset}`, ""];
  manifests.forEach((plugin, index) => {
    hits.push({ row: 7 + index, id: plugin.id, kind: "plugin" });
    const prefix = index === selected ? `${lime}>${reset}` : " ";
    lines.push(`${prefix} ${text}${plugin.title}${reset} ${muted}${plugin.id} · ${summarizePlugin(plugin)}${reset}`);
  });
  lines.push("", `${muted}Enter opens the plugin menu. Escape returns home.${reset}`);
  return lines.join("\n");
}

function renderPluginDetail(state: InteractiveState, manifests: PluginManifest[], hits: HitTarget[]) {
  const plugin = manifests[clamp(state.pluginIndex, 0, Math.max(0, manifests.length - 1))];
  if (!plugin) return `${muted}No plugin selected.${reset}`;
  const loaded = getPlugin(plugin.id);
  const endpoints = plugin.endpoints.filter((endpoint) => endpoint !== "plugins");
  const selected = clamp(state.selected, 0, Math.max(0, endpoints.length - 1));
  const lines = [
    `${limeDim}${plugin.title}${reset} ${muted}${plugin.id}${reset}`,
    `${muted}${plugin.description}${reset}`,
    "",
    `${limeDim}Endpoints${reset}`,
  ];
  endpoints.forEach((endpoint, index) => {
    hits.push({ row: 9 + index, id: `${plugin.id}:${endpoint}`, kind: "command" });
    const hook = loaded?.[endpoint as "scrape" | "run" | "doctor"];
    const prefix = index === selected ? `${lime}>${reset}` : " ";
    lines.push(`${prefix} ${text}${endpoint}${reset} ${muted}${hook ? "loaded" : "missing"}${reset}`);
  });
  lines.push("", `${muted}Enter runs the endpoint. Escape back to plugin list.${reset}`);
  return lines.join("\n");
}

function renderHelp() {
  return [
    `${limeDim}Keys${reset}`,
    `  ${text}p${reset} palette        ${text}/${reset} slash command      ${text}l${reset} plugins`,
    `  ${text}arrows${reset} move      ${text}enter${reset} run/select     ${text}esc${reset} back`,
    `  ${text}click${reset} select     ${text}q${reset} quit               ${text}ctrl+c${reset} quit`,
    "",
    `${limeDim}Slash commands${reset}`,
    `  /doctor`,
    `  /plugins`,
    `  /plugins --json`,
    `  /scrape <url>`,
    `  /<plugin> scrape <url>`,
    `  /<plugin> doctor`,
    `  /help`,
    `  /quit`,
  ].join("\n");
}

function renderLogs(logs: string[]) {
  if (logs.length === 0) return "";
  const clipped = logs.slice(-10).flatMap((line) => line.split("\n").slice(0, 8));
  return ["", `${limeDim}Output${reset}`, ...clipped.slice(-12).map((line) => `${muted}${line}${reset}`)].join("\n");
}

function render(
  state: InteractiveState,
  commands: PaletteCommand[],
  manifests: PluginManifest[],
  columns: number,
): { frame: string; hits: HitTarget[] } {
  const width = clamp(columns || 96, 56, 140);
  const hits: HitTarget[] = [];
  const body =
    state.view === "palette"
      ? renderPalette(state, commands, hits)
      : state.view === "plugins"
        ? renderPlugins(state, manifests, hits)
        : state.view === "plugin"
          ? renderPluginDetail(state, manifests, hits)
          : state.view === "help"
            ? renderHelp()
            : renderHome(state, commands, manifests, hits);
  return { frame: `${homeErase}${hideCursor}${renderHeader(width, state, manifests)}${body}${renderLogs(state.logs)}${reset}`, hits };
}

function tokenizeCommand(raw: string) {
  return stripSlash(raw).trim().split(/\s+/).filter(Boolean);
}

export async function executeSlash(
  raw: string,
  options: {
    scrape?: typeof dispatchScrape;
    doctor?: typeof dispatchDoctor;
  } = {},
): Promise<string> {
  const scrape = options.scrape ?? dispatchScrape;
  const doctor = options.doctor ?? dispatchDoctor;
  const [name, ...args] = tokenizeCommand(raw);
  if (!name) return "";
  if (name === "quit" || name === "exit") return "CRAW_TUI_QUIT";
  if (name === "help" || name === "?") return "OPEN_HELP";
  if (name === "plugins") {
    if (args.includes("--json")) {
      const { listPluginManifests } = await import("../plugin.ts");
      return JSON.stringify({ plugins: listPluginManifests() }, null, 2);
    }
    return "OPEN_PLUGINS";
  }
  if (name === "scrape") {
    const url = args[0];
    if (!url) return "usage: /scrape <url>";
    return (await scrape([url])).text;
  }
  if (name === "doctor") return (await doctor(args[0])).text;
  if (getPlugin(name)) {
    const endpoint = args[0] ?? "scrape";
    if (endpoint === "doctor") return (await doctor(name)).text;
    if (endpoint === "scrape") {
      const url = args.find((part) => part.startsWith("http")) ?? args[1];
      if (!url) return `usage: /${name} scrape <url>`;
      return (await scrape([url], {}, name)).text;
    }
    return `unknown endpoint for ${name}: ${endpoint}`;
  }
  return `unknown command: /${name}`;
}

async function runSlash(raw: string, state: InteractiveState, scrape: typeof dispatchScrape, doctor: typeof dispatchDoctor) {
  const result = await executeSlash(raw, { scrape, doctor });
  if (result === "CRAW_TUI_QUIT") throw new Error("CRAW_TUI_QUIT");
  if (result === "OPEN_HELP") {
    state.view = "help";
    state.query = "";
    state.selected = 0;
    return;
  }
  if (result === "OPEN_PLUGINS") {
    state.view = "plugins";
    state.query = "";
    state.selected = 0;
    return;
  }
  state.logs.push(result);
  state.query = "";
}

async function runSelected(
  state: InteractiveState,
  commands: PaletteCommand[],
  manifests: PluginManifest[],
  scrape: typeof dispatchScrape,
  doctor: typeof dispatchDoctor,
) {
  if (state.view === "plugins") {
    state.pluginIndex = clamp(state.selected, 0, Math.max(0, manifests.length - 1));
    state.view = "plugin";
    state.selected = 0;
    return;
  }
  if (state.view === "plugin") {
    const plugin = manifests[clamp(state.pluginIndex, 0, Math.max(0, manifests.length - 1))];
    const endpoint = plugin?.endpoints.filter((item) => item !== "plugins")[state.selected];
    if (plugin && endpoint) await runSlash(`/${plugin.id} ${endpoint}`, state, scrape, doctor);
    return;
  }
  const filtered = filterCommands(commands, state.query);
  const command = filtered[clamp(state.selected, 0, Math.max(0, filtered.length - 1))];
  if (!command) return;
  if (command.id === "plugins") {
    state.view = "plugins";
    state.query = "";
    state.selected = 0;
    return;
  }
  state.logs.push(await command.run());
  state.view = "home";
  state.query = "";
  state.selected = 0;
}

function parseMouse(key: string): { button: number; col: number; row: number; release: boolean } | null {
  const match = key.match(/^\u001b\[<(\d+);(\d+);(\d+)([Mm])$/);
  if (!match) return null;
  return { button: Number(match[1]), col: Number(match[2]), row: Number(match[3]), release: match[4] === "m" };
}

export async function runInteractive(options: InteractiveOptions) {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  const manifests = options.manifests;
  const scrape = options.scrape ?? dispatchScrape;
  const doctor = options.doctor ?? dispatchDoctor;
  const state: InteractiveState = {
    view: "home",
    query: "",
    selected: 0,
    pluginIndex: 0,
    logs: [],
    busy: false,
    frame: 0,
  };
  const commands = makeCommands(manifests, () => JSON.stringify({ plugins: manifests }, null, 2), scrape, doctor, state);

  if (!stdin.isTTY || !("setRawMode" in stdin) || !stdout.isTTY) {
    stdout.write("craw interactive TUI requires a TTY. Try `craw help`, `craw plugins --json`, or run in a terminal.\n");
    return;
  }

  let hits: HitTarget[] = [];
  const repaint = () => {
    const painted = render(state, commands, manifests, stdout.columns ?? 96);
    hits = painted.hits;
    stdout.write(painted.frame);
  };
  const cleanup = () => {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write(`${mouseOff}${showCursor}${altOff}${reset}`);
  };

  stdin.setEncoding("utf8");
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(`${altOn}${mouseOn}${hideCursor}`);
  repaint();
  const timer = setInterval(() => {
    if (state.busy) return;
    state.frame += 1;
    repaint();
  }, 50);

  await new Promise<void>((resolve, reject) => {
    let mouseBuf = "";
    const onData = async (chunk: string) => {
      if (state.busy) return;
      const keys = chunk.startsWith("\u001b[<") || mouseBuf ? [mouseBuf + chunk] : chunk.split("").map((part, index, all) => {
        if (part === "\u001b" && all[index + 1] === "[") return "";
        return part;
      });
      if (chunk.startsWith("\u001b[<") && !/[Mm]$/.test(chunk)) {
        mouseBuf = chunk;
        return;
      }
      mouseBuf = "";
      const key = keys[0] === "" ? chunk : chunk;
      try {
        const mouse = parseMouse(key);
        if (mouse && !mouse.release && mouse.button === 0) {
          const hit = hits.find((item) => item.row === mouse.row);
          if (hit?.kind === "plugin") {
            state.pluginIndex = Math.max(0, manifests.findIndex((item) => item.id === hit.id));
            state.view = "plugin";
            state.selected = 0;
            repaint();
            return;
          }
          if (hit?.kind === "command") {
            const command = commands.find((item) => item.id === hit.id);
            if (command) {
              state.busy = true;
              if (command.id === "plugins") state.view = "plugins";
              else state.logs.push(await command.run());
              state.busy = false;
            }
            repaint();
            return;
          }
        }
        if (mouse) return;
        if (key === "\u0003" || (key === "q" && state.view !== "palette")) {
          resolve();
          return;
        }
        if (key === "\u001b") {
          state.view = state.view === "plugin" ? "plugins" : "home";
          state.query = "";
          state.selected = 0;
          repaint();
          return;
        }
        if (key === "\u001b[A" || key === "k") {
          const max =
            state.view === "plugins"
              ? manifests.length
              : state.view === "plugin"
                ? manifests[state.pluginIndex]?.endpoints.filter((item) => item !== "plugins").length ?? 1
                : filterCommands(commands, state.query).length;
          state.selected = clamp(state.selected - 1, 0, Math.max(0, max - 1));
          repaint();
          return;
        }
        if (key === "\u001b[B" || key === "j") {
          const max =
            state.view === "plugins"
              ? manifests.length
              : state.view === "plugin"
                ? manifests[state.pluginIndex]?.endpoints.filter((item) => item !== "plugins").length ?? 1
                : filterCommands(commands, state.query).length;
          state.selected = clamp(state.selected + 1, 0, Math.max(0, max - 1));
          repaint();
          return;
        }
        if (key === "\r" || key === "\n") {
          state.busy = true;
          if (state.view === "palette" && state.query.startsWith("/")) await runSlash(state.query, state, scrape, doctor);
          else await runSelected(state, commands, manifests, scrape, doctor);
          state.busy = false;
          repaint();
          return;
        }
        if (key === "\u007f") {
          if (state.view === "palette") state.query = state.query.slice(0, -1);
          repaint();
          return;
        }
        if ((key === "p" || key === "\u0010") && state.view !== "palette") {
          state.view = "palette";
          state.query = "";
          state.selected = 0;
          repaint();
          return;
        }
        if (key === "l" && state.view !== "palette") {
          state.view = "plugins";
          state.query = "";
          state.selected = 0;
          repaint();
          return;
        }
        if (key === "?" && state.view !== "palette") {
          state.view = "help";
          state.selected = 0;
          repaint();
          return;
        }
        if (key === "/" && state.view !== "palette") {
          state.view = "palette";
          state.query = "/";
          state.selected = 0;
          repaint();
          return;
        }
        if (state.view === "palette" && key.length === 1 && key >= " " && key <= "~") {
          state.query += key;
          state.selected = 0;
          repaint();
        }
      } catch (error) {
        state.busy = false;
        if (error instanceof Error && error.message === "CRAW_TUI_QUIT") {
          resolve();
          return;
        }
        reject(error);
      }
    };

    stdin.on("data", onData);
    stdin.once("end", () => resolve());
  }).finally(() => {
    clearInterval(timer);
    cleanup();
  });
}
