// 主题应用：light / dark / system
// 通过切换 <html class="dark"> 实现，Tailwind 的 darkMode: 'class' 生效
export type Theme = "light" | "dark" | "system";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const resolved = theme === "system" ? systemPref() : theme;
  root.classList.toggle("dark", resolved === "dark");
  root.setAttribute("data-theme", resolved);
}

export function systemPref(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/// 注册系统主题变化监听（仅 theme === 'system' 时需要）
export function watchSystemTheme(cb: () => void): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => cb();
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
