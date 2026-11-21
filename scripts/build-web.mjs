
import { build } from "esbuild";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";

const shims = {
  "node:fs": `
    export const existsSync = () => false;
    export const readFileSync = () => {
      throw new Error("no fs in browser");
    };
    export const writeFileSync = () => {};
    export const mkdirSync = () => {};
  `,
  "node:path": `
    export const join = (...a) => a.join("/");
  `,
  "node:crypto": `
    export const randomUUID = () => crypto.randomUUID();
    export const createHmac = () => {
      throw new Error("not in browser");
    };
    export const timingSafeEqual = () => false;
  `,
  "node:events": `
    export class EventEmitter {
      constructor() { this._l = {}; }
      on(e, f) {
        (this._l[e] ||= []).push(f);
        return this;
      }
      off(e, f) {
        this._l[e] = (this._l[e] || [])
          .filter(x => x !== f);
        return this;
      }
      emit(e, ...a) {
        (this._l[e] || []).forEach(f => f(...a));
        return true;
      }
    }
  `,
};

mkdirSync("site", { recursive: true });

await build({
  entryPoints: ["src/web/browser.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: "site/app.js",
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"production"',
  },
  external: ["@photon-ai/imessage-kit"],
  plugins: [
    {
      name: "node-shims",
      setup(b) {
        b.onResolve(
          { filter: /^node:(fs|path|crypto|events)$/ },
          a => ({
            path: a.path,
            namespace: "shim",
          })
        );

        b.onLoad(
          { filter: /.*/, namespace: "shim" },
          a => ({
            contents: shims[a.path],
            loader: "js",
          })
        );
      },
    },
  ],
});

// New WarehouseJobz AI landing page
writeFileSync(
  "site/index.html",
  readFileSync("public/landing.html", "utf8")
);

// Preserve the original browser simulator
mkdirSync("site/simulator", { recursive: true });

const simulatorHtml = readFileSync(
  "public/sim.html",
  "utf8"
)
  .replace(
    "<title>Wren Simulator</title>",
    '<title>WarehouseJobz AI Simulator</title>'
  )
  .replace(
    "</head>",
    '<script defer src="/app.js"></script>\n</head>'
  );

writeFileSync(
  "site/simulator/index.html",
  simulatorHtml
);

// Preserve the presentation
mkdirSync("site/presentation", { recursive: true });

writeFileSync(
  "site/presentation/index.html",
  readFileSync("docs/presentation.html", "utf8")
);

console.log("WarehouseJobz AI build complete:");
console.log("  /             Landing page");
console.log("  /simulator/   Browser simulator");
console.log("  /presentation/ Presentation");
