/**
 * 项目上下文分析器
 *
 * 扫描工作目录，生成项目摘要。
 * 缓存到 .prompto/context.json。
 * 监听关键配置文件变化，自动更新。
 */

import { readFile, writeFile, mkdir, readdir, stat, access } from "node:fs/promises";
import { watch, type FSWatcher } from "node:fs";
import { join, basename, relative } from "node:path";

export interface ProjectContext {
  /** 项目根目录 */
  root: string;
  /** 项目名 */
  name: string;
  /** 主要语言 */
  languages: string[];
  /** 框架 */
  frameworks: string[];
  /** 包管理器 */
  packageManager: string | null;
  /** 关键依赖（名称 + 版本） */
  dependencies: { name: string; version: string }[];
  /** 目录结构概览 */
  structure: string[];
  /** 构建命令 */
  buildCommand: string | null;
  /** 开发命令 */
  devCommand: string | null;
  /** 测试命令 */
  testCommand: string | null;
  /** 代码风格配置摘要 */
  codeStyle: string | null;
  /** 上次分析时间 */
  analyzedAt: number;
}

const CONFIG_FILES = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "next.config.js",
  "next.config.ts",
  ".eslintrc.json",
  ".eslintrc.js",
  ".prettierrc",
  "tailwind.config.js",
  "tailwind.config.ts",
];

let cachedContext: ProjectContext | null = null;
let watcher: FSWatcher | null = null;

/**
 * 获取项目上下文（优先用缓存）
 */
export async function getProjectContext(cwd: string): Promise<ProjectContext> {
  // 尝试从缓存文件读
  if (!cachedContext) {
    const cachePath = join(cwd, ".prompto", "context.json");
    try {
      const data = await readFile(cachePath, "utf-8");
      cachedContext = JSON.parse(data);
      // 如果缓存超过 1 小时，重新分析
      if (cachedContext && Date.now() - cachedContext.analyzedAt > 3600_000) {
        cachedContext = await analyzeProject(cwd);
      }
    } catch {
      cachedContext = await analyzeProject(cwd);
    }
  }
  return cachedContext!;
}

/**
 * 强制重新分析项目
 */
export async function analyzeProject(cwd: string): Promise<ProjectContext> {
  const ctx: ProjectContext = {
    root: cwd,
    name: basename(cwd),
    languages: [],
    frameworks: [],
    packageManager: null,
    dependencies: [],
    structure: [],
    buildCommand: null,
    devCommand: null,
    testCommand: null,
    codeStyle: null,
    analyzedAt: Date.now(),
  };

  // 检测 package.json（Node.js 项目）
  const pkgPath = join(cwd, "package.json");
  if (await fileExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      ctx.name = pkg.name || ctx.name;
      ctx.languages.push("TypeScript/JavaScript");
      ctx.packageManager = await detectPackageManager(cwd);

      // 框架检测
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps["react"]) ctx.frameworks.push(`React ${allDeps["react"]}`);
      if (allDeps["vue"]) ctx.frameworks.push(`Vue ${allDeps["vue"]}`);
      if (allDeps["next"]) ctx.frameworks.push(`Next.js ${allDeps["next"]}`);
      if (allDeps["nuxt"]) ctx.frameworks.push(`Nuxt ${allDeps["nuxt"]}`);
      if (allDeps["svelte"]) ctx.frameworks.push("Svelte");
      if (allDeps["@tauri-apps/api"]) ctx.frameworks.push("Tauri");
      if (allDeps["electron"]) ctx.frameworks.push("Electron");
      if (allDeps["express"]) ctx.frameworks.push("Express");
      if (allDeps["fastify"]) ctx.frameworks.push("Fastify");
      if (allDeps["tailwindcss"]) ctx.frameworks.push("Tailwind CSS");
      if (allDeps["zustand"]) ctx.frameworks.push("Zustand");
      if (allDeps["@modelcontextprotocol/sdk"]) ctx.frameworks.push("MCP SDK");

      // 关键依赖（全部 dependencies）
      const deps = pkg.dependencies || {};
      ctx.dependencies = Object.entries(deps)
        .map(([name, version]) => ({ name, version: String(version) }));

      // 命令
      const scripts = pkg.scripts || {};
      ctx.buildCommand = scripts.build ? `${ctx.packageManager || "npm"} run build` : null;
      ctx.devCommand = scripts.dev ? `${ctx.packageManager || "npm"} run dev` : null;
      ctx.testCommand = scripts.test ? `${ctx.packageManager || "npm"} run test` : null;
    } catch { /* ignore */ }
  }

  // 检测 Cargo.toml（Rust 项目）
  const cargoPath = join(cwd, "Cargo.toml");
  if (await fileExists(cargoPath)) {
    ctx.languages.push("Rust");
    try {
      const cargo = await readFile(cargoPath, "utf-8");
      const nameMatch = cargo.match(/^name\s*=\s*"([^"]+)"/m);
      if (nameMatch && !ctx.name) ctx.name = nameMatch[1];
      // 提取 Rust 依赖
      const depsSection = cargo.match(/\[dependencies\]([\s\S]*?)(?:\[|$)/);
      if (depsSection) {
        const rustDeps = depsSection[1].match(/^(\w[\w-]*)\s*=/gm);
        if (rustDeps) {
          for (const d of rustDeps.slice(0, 20)) {
            const name = d.replace(/\s*=.*/, "").trim();
            if (name && !ctx.dependencies.find(x => x.name === name)) {
              ctx.dependencies.push({ name, version: "(rust)" });
            }
          }
        }
      }
      ctx.buildCommand = ctx.buildCommand || "cargo build";
      ctx.testCommand = ctx.testCommand || "cargo test";
    } catch { /* ignore */ }
  }

  // 检测子项目（monorepo 结构）
  const subProjects = ["mcp-server", "vscode-extension", "packages", "apps"];
  for (const sub of subProjects) {
    const subPkg = join(cwd, sub, "package.json");
    if (await fileExists(subPkg)) {
      try {
        const pkg = JSON.parse(await readFile(subPkg, "utf-8"));
        const subDeps = pkg.dependencies || {};
        // 添加子项目的关键框架
        if (subDeps["@modelcontextprotocol/sdk"]) ctx.frameworks.push("MCP SDK");
        if (subDeps["@types/vscode"]) ctx.frameworks.push("VS Code Extension");
      } catch {}
    }
  }

  // 去重框架
  ctx.frameworks = [...new Set(ctx.frameworks)];

  // 检测 pyproject.toml / requirements.txt（Python）
  if (await fileExists(join(cwd, "pyproject.toml")) || await fileExists(join(cwd, "requirements.txt"))) {
    ctx.languages.push("Python");
  }

  // 检测 go.mod（Go）
  if (await fileExists(join(cwd, "go.mod"))) {
    ctx.languages.push("Go");
    ctx.buildCommand = ctx.buildCommand || "go build ./...";
    ctx.testCommand = ctx.testCommand || "go test ./...";
  }

  // 检测 src-tauri（Tauri 子目录）
  if (await fileExists(join(cwd, "src-tauri", "Cargo.toml"))) {
    if (!ctx.languages.includes("Rust")) ctx.languages.push("Rust");
    if (!ctx.frameworks.includes("Tauri")) ctx.frameworks.push("Tauri");
  }

  // 代码风格
  if (await fileExists(join(cwd, ".eslintrc.json")) || await fileExists(join(cwd, ".eslintrc.js")) || await fileExists(join(cwd, "eslint.config.js"))) {
    ctx.codeStyle = "ESLint";
  }
  if (await fileExists(join(cwd, ".prettierrc")) || await fileExists(join(cwd, ".prettierrc.json"))) {
    ctx.codeStyle = (ctx.codeStyle ? ctx.codeStyle + " + " : "") + "Prettier";
  }
  if (await fileExists(join(cwd, "biome.json"))) {
    ctx.codeStyle = (ctx.codeStyle ? ctx.codeStyle + " + " : "") + "Biome";
  }

  // 目录结构（完整扫描，2 层深度）
  ctx.structure = await getStructureDeep(cwd, 2);

  // 缓存
  cachedContext = ctx;
  await saveCache(cwd, ctx);

  // 启动监听
  startWatching(cwd);

  return ctx;
}

/**
 * 将项目上下文格式化为精简的一行摘要（控制 token 量）
 */
export function formatContextForPrompt(ctx: ProjectContext): string {
  const parts: string[] = [];
  parts.push(ctx.name);
  if (ctx.languages.length > 0) parts.push(ctx.languages.join("+"));
  if (ctx.frameworks.length > 0) parts.push(ctx.frameworks.join(", "));
  if (ctx.packageManager) parts.push(ctx.packageManager);
  if (ctx.dependencies.length > 0) {
    // 只列前 5 个核心依赖的名字
    parts.push("deps: " + ctx.dependencies.slice(0, 5).map((d) => d.name).join(", "));
  }
  if (ctx.codeStyle) parts.push(ctx.codeStyle);
  return parts.join(" | ");
}

/**
 * 完整格式（用于 get_project_context 工具返回给用户看）
 */
export function formatContextFull(ctx: ProjectContext): string {
  const parts: string[] = [];
  parts.push(`项目: ${ctx.name}`);
  parts.push(`路径: ${ctx.root}`);
  if (ctx.languages.length > 0) parts.push(`语言: ${ctx.languages.join(", ")}`);
  if (ctx.frameworks.length > 0) parts.push(`框架: ${ctx.frameworks.join(", ")}`);
  if (ctx.packageManager) parts.push(`包管理: ${ctx.packageManager}`);
  if (ctx.dependencies.length > 0) {
    parts.push(`依赖: ${ctx.dependencies.map((d) => `${d.name}@${d.version}`).join(", ")}`);
  }
  if (ctx.buildCommand) parts.push(`构建: ${ctx.buildCommand}`);
  if (ctx.devCommand) parts.push(`开发: ${ctx.devCommand}`);
  if (ctx.testCommand) parts.push(`测试: ${ctx.testCommand}`);
  if (ctx.codeStyle) parts.push(`代码风格: ${ctx.codeStyle}`);
  if (ctx.structure.length > 0) parts.push(`结构:\n${ctx.structure.join("\n")}`);
  return parts.join("\n");
}

// ============ 内部工具函数 ============

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function detectPackageManager(cwd: string): Promise<string> {
  if (await fileExists(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(join(cwd, "yarn.lock"))) return "yarn";
  if (await fileExists(join(cwd, "bun.lockb"))) return "bun";
  return "npm";
}

async function getStructure(cwd: string): Promise<string[]> {
  return getStructureDeep(cwd, 1);
}

async function getStructureDeep(cwd: string, maxDepth: number, currentDepth = 0, prefix = ""): Promise<string[]> {
  const result: string[] = [];
  const IGNORE = new Set(["node_modules", "target", "dist", "__pycache__", ".git", ".DS_Store", "build", "out", ".next", ".nuxt", "coverage"]);

  try {
    const entries = await readdir(cwd);
    const dirs: string[] = [];
    const files: string[] = [];

    for (const entry of entries) {
      if (entry.startsWith(".") && entry !== ".gitignore") continue;
      if (IGNORE.has(entry)) continue;
      const s = await stat(join(cwd, entry));
      if (s.isDirectory()) dirs.push(entry);
      else files.push(entry);
    }

    // 目录
    for (const d of dirs.sort()) {
      result.push(`${prefix}${d}/`);
      if (currentDepth < maxDepth) {
        const subItems = await getStructureDeep(join(cwd, d), maxDepth, currentDepth + 1, prefix + "  ");
        result.push(...subItems);
      }
    }

    // 文件（只列关键文件，避免太长）
    const importantFiles = files.filter(f =>
      CONFIG_FILES.includes(f) ||
      f === "README.md" ||
      f === "LICENSE" ||
      f.endsWith(".rs") ||
      f.endsWith(".tsx") && currentDepth <= 1 ||
      f.endsWith(".ts") && currentDepth <= 1
    );
    for (const f of importantFiles.sort().slice(0, 20)) {
      result.push(`${prefix}${f}`);
    }
  } catch { /* ignore */ }
  return result;
}

async function saveCache(cwd: string, ctx: ProjectContext): Promise<void> {
  try {
    const dir = join(cwd, ".prompto");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "context.json"), JSON.stringify(ctx, null, 2), "utf-8");
  } catch { /* ignore */ }
}

function startWatching(cwd: string): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }

  try {
    watcher = watch(cwd, { recursive: false }, (event, filename) => {
      if (filename && CONFIG_FILES.includes(filename)) {
        // 配置文件变化，清除缓存，下次调用时重新分析
        cachedContext = null;
      }
    });
  } catch {
    // 监听失败不影响功能
  }
}

/**
 * 清理资源
 */
export function cleanup(): void {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
