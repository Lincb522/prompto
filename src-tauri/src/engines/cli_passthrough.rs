// 通过目标 CLI 做一次 non-interactive 调用
//
// 支持：
// - {prompt} / {model} 占位替换
// - 从 stdin 注入 prompt（当 args 不含 {prompt}）
// - 按 CLI 约定注入模型选择（--model / -c model=）
// - 输出行级清洗（应对 kiro-cli 的页脚与告警）
// - 超时控制与登录/权限错误分类
use crate::config::{CliTemplate, TargetCli};
use crate::error::{AppError, AppResult};
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::time::timeout;

const DEFAULT_TIMEOUT_SECS: u64 = 180;

/// 检测 CLI 是否存在并拿到版本
pub async fn detect(cli: TargetCli, template: &CliTemplate) -> AppResult<Option<String>> {
    if which::which(&template.command).is_err() {
        return Ok(None);
    }
    let out = Command::new(&template.command)
        .arg("--version")
        .output()
        .await;
    if let Ok(o) = out {
        if o.status.success() {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            let s = if s.is_empty() {
                String::from_utf8_lossy(&o.stderr).trim().to_string()
            } else {
                s
            };
            let _ = cli;
            return Ok(Some(if s.is_empty() {
                "已安装".into()
            } else {
                s.lines().next().unwrap_or(&s).to_string()
            }));
        }
    }
    Ok(Some("已安装".into()))
}

/// 把 model_flag 和 model 转换成要追加的 argv 片段
/// - `--model`    → ["--model", "<name>"]
/// - `-c model=`  → ["-c", "model=<name>"]     （注意：空格分隔 + 末尾 '=' 触发拼接）
/// - `--m=`       → ["--m=<name>"]
fn build_model_args(flag: &str, model: &str) -> Vec<String> {
    if flag.is_empty() || model.is_empty() {
        return vec![];
    }
    // 保留原始空格语义：先按空白切分，再检查末端是否为 `=` 形式
    let parts: Vec<&str> = flag.split_whitespace().collect();
    if parts.is_empty() {
        return vec![];
    }
    let last = parts[parts.len() - 1];
    if last.ends_with('=') {
        // 末段以 `=` 结尾：把 model 拼到末段
        let mut out: Vec<String> = parts[..parts.len() - 1]
            .iter()
            .map(|s| s.to_string())
            .collect();
        out.push(format!("{}{}", last, model));
        return out;
    }
    // 普通情况：flag + " " + model 按原样给出
    if parts.len() == 1 {
        return vec![parts[0].to_string(), model.to_string()];
    }
    // 多段 flag（例如 "-c --something"），把 model 作为最后一个独立参数
    let mut out: Vec<String> = parts.iter().map(|s| s.to_string()).collect();
    out.push(model.to_string());
    out
}

/// 注入思考强度 / reasoning effort
/// - codex: `-c model_reasoning_effort=<effort>`
/// - 其他 CLI 当前未实现（留作未来扩展）
fn build_reasoning_args(command: &str, effort: &str) -> Vec<String> {
    if effort.is_empty() {
        return vec![];
    }
    match command {
        "codex" => vec![
            "-c".into(),
            format!("model_reasoning_effort=\"{}\"", effort),
        ],
        _ => vec![],
    }
}

/// 主入口：根据模板组装命令、注入 model、执行、清洗输出
pub async fn optimize(
    template: &CliTemplate,
    system: &str,
    user_input: &str,
) -> AppResult<String> {
    if !template.supports_passthrough {
        return Err(AppError::CliExec(format!(
            "{} 当前未启用 AI 透传。请在「设置 → CLI 模板」里确认 supports_passthrough 开启，或切换到「自定义 API」引擎。",
            template.command
        )));
    }
    if which::which(&template.command).is_err() {
        return Err(AppError::CliNotFound(template.command.clone()));
    }

    let full_prompt = format!(
        "{system}\n\n---\n原始内容：\n{user_input}"
    );

    let mut cmd = Command::new(&template.command);

    // 强制关闭 CLI 颜色输出，避免 ANSI 转义码污染结果
    cmd.env("NO_COLOR", "1")
        .env("CLICOLOR", "0")
        .env("FORCE_COLOR", "0")
        .env("TERM", "dumb");

    // 处理 args：展开 {prompt} / {model}
    let mut has_prompt_placeholder = false;
    for raw in &template.args {
        let replaced = raw
            .replace("{prompt}", &full_prompt)
            .replace("{model}", &template.model);
        if raw.contains("{prompt}") {
            has_prompt_placeholder = true;
        }
        cmd.arg(replaced);
    }

    // 追加 model 参数
    for a in build_model_args(&template.model_flag, &template.model) {
        cmd.arg(a);
    }

    // 追加 reasoning 参数（Codex: -c model_reasoning_effort=xhigh；Kiro 暂无；其他 CLI 默认忽略）
    for a in build_reasoning_args(&template.command, &template.reasoning_effort) {
        cmd.arg(a);
    }

    let use_stdin = template.stdin_mode && !has_prompt_placeholder;

    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    if use_stdin {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }

    let mut child = cmd.spawn().map_err(|e| {
        AppError::CliExec(format!("启动 {} 失败: {}", template.command, e))
    })?;

    if use_stdin {
        if let Some(mut stdin) = child.stdin.take() {
            stdin.write_all(full_prompt.as_bytes()).await?;
            stdin.flush().await?;
            drop(stdin);
        }
    }

    let output = match timeout(
        Duration::from_secs(DEFAULT_TIMEOUT_SECS),
        child.wait_with_output(),
    )
    .await
    {
        Ok(Ok(o)) => o,
        Ok(Err(e)) => return Err(AppError::CliExec(e.to_string())),
        Err(_) => {
            return Err(AppError::CliExec(format!(
                "{} 超过 {} 秒未返回，已终止。",
                template.command, DEFAULT_TIMEOUT_SECS
            )));
        }
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let hint = diagnose(&template.command, &stderr);
        return Err(AppError::CliExec(format!(
            "{} 返回非零状态。\nstderr: {}\n{}",
            template.command,
            if stderr.is_empty() {
                "(空)".to_string()
            } else {
                stderr
            },
            hint
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let cleaned = clean_output(&stdout, &template.strip_patterns);
    if cleaned.is_empty() {
        return Err(AppError::CliExec(format!(
            "{} 没有返回可用内容。{}",
            template.command,
            diagnose(&template.command, "")
        )));
    }
    Ok(cleaned)
}

/// 模型条目：包含 slug、显示名、可选的 reasoning 等级
#[derive(Debug, Clone, serde::Serialize)]
pub struct ModelInfo {
    pub slug: String,
    pub display_name: String,
    pub description: Option<String>,
    pub reasoning_levels: Vec<String>,
    pub default_reasoning: Option<String>,
}

/// 列出 CLI 支持的模型（结构化）
pub async fn list_models(cli: TargetCli, template: &CliTemplate) -> AppResult<Vec<ModelInfo>> {
    if which::which(&template.command).is_err() {
        return Err(AppError::CliNotFound(template.command.clone()));
    }
    match cli {
        TargetCli::Kiro => list_kiro_models(template).await,
        TargetCli::Claude => Ok(claude_default_models()),
        TargetCli::Codex => list_codex_models().await,
    }
}

async fn list_kiro_models(template: &CliTemplate) -> AppResult<Vec<ModelInfo>> {
    let out = Command::new(&template.command)
        .arg("chat")
        .arg("--list-models")
        .output()
        .await
        .map_err(|e| AppError::CliExec(e.to_string()))?;
    let s = String::from_utf8_lossy(&out.stdout);
    let mut models = Vec::new();
    for line in s.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("Available models") {
            continue;
        }
        let raw = line.trim_start_matches('*').trim();
        // 行格式: "<slug>   1.30x credits   <description>"
        let mut parts = raw.split_whitespace();
        if let Some(slug) = parts.next() {
            // 跳过 credits 列
            let _ = parts.next();
            let _ = parts.next();
            let desc: String = parts.collect::<Vec<_>>().join(" ");
            models.push(ModelInfo {
                slug: slug.to_string(),
                display_name: slug.to_string(),
                description: if desc.is_empty() { None } else { Some(desc) },
                reasoning_levels: vec![],
                default_reasoning: None,
            });
        }
    }
    Ok(models)
}

fn claude_default_models() -> Vec<ModelInfo> {
    // 读取 ~/.claude/cache/gateway-models.json
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return claude_fallback_models(),
    };
    let cache_path = home.join(".claude").join("cache").join("gateway-models.json");
    if !cache_path.exists() {
        return claude_fallback_models();
    }
    let data = match std::fs::read_to_string(&cache_path) {
        Ok(d) => d,
        Err(_) => return claude_fallback_models(),
    };
    let v: serde_json::Value = match serde_json::from_str(&data) {
        Ok(v) => v,
        Err(_) => return claude_fallback_models(),
    };
    let arr = match v.get("models").and_then(|x| x.as_array()) {
        Some(a) => a,
        None => return claude_fallback_models(),
    };
    let mut models = Vec::new();
    for m in arr {
        let id = m.get("id").and_then(|x| x.as_str()).unwrap_or("");
        let display = m.get("display_name").and_then(|x| x.as_str()).unwrap_or(id);
        if id.is_empty() {
            continue;
        }
        models.push(ModelInfo {
            slug: id.to_string(),
            display_name: display.to_string(),
            description: None,
            reasoning_levels: vec![],
            default_reasoning: None,
        });
    }
    if models.is_empty() {
        claude_fallback_models()
    } else {
        models
    }
}

fn claude_fallback_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo { slug: "sonnet".into(), display_name: "Claude Sonnet".into(), description: Some("平衡速度与效果（推荐）".into()), reasoning_levels: vec![], default_reasoning: None },
        ModelInfo { slug: "opus".into(), display_name: "Claude Opus".into(), description: Some("旗舰能力，适合复杂任务".into()), reasoning_levels: vec![], default_reasoning: None },
        ModelInfo { slug: "haiku".into(), display_name: "Claude Haiku".into(), description: Some("最快、最经济".into()), reasoning_levels: vec![], default_reasoning: None },
    ]
}

/// 读 `~/.codex/models_cache.json`，解析真实的模型列表与 reasoning levels
async fn list_codex_models() -> AppResult<Vec<ModelInfo>> {
    let home = dirs::home_dir()
        .ok_or_else(|| AppError::Config("无法定位 HOME 目录".into()))?;
    let path = home.join(".codex").join("models_cache.json");
    if !path.exists() {
        // 回退：给一组保守默认
        return Ok(vec![
            ModelInfo {
                slug: "gpt-5.5".into(),
                display_name: "GPT-5.5".into(),
                description: None,
                reasoning_levels: vec!["low".into(), "medium".into(), "high".into(), "xhigh".into()],
                default_reasoning: Some("medium".into()),
            },
            ModelInfo {
                slug: "o3".into(),
                display_name: "o3".into(),
                description: None,
                reasoning_levels: vec!["low".into(), "medium".into(), "high".into()],
                default_reasoning: Some("medium".into()),
            },
        ]);
    }

    let data = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| AppError::Engine(format!("读取 {path:?} 失败: {e}")))?;
    let v: serde_json::Value = serde_json::from_str(&data)
        .map_err(|e| AppError::Engine(format!("解析 Codex 模型缓存失败: {e}")))?;

    // cache 结构：{ "models": [{ "slug": "...", "display_name": "...", "supported_reasoning_levels": [{"effort":"low", ...}], "default_reasoning_level":"medium", "visibility":"list", "description":"..." }, ...] }
    let arr = v
        .get("models")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for m in arr {
        // 忽略非列表可见（visibility != "list"）的特殊条目
        if let Some(vis) = m.get("visibility").and_then(|x| x.as_str()) {
            if vis != "list" {
                continue;
            }
        }
        let slug = m
            .get("slug")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        if slug.is_empty() {
            continue;
        }
        let display_name = m
            .get("display_name")
            .and_then(|x| x.as_str())
            .unwrap_or(&slug)
            .to_string();
        let description = m
            .get("description")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());
        let levels: Vec<String> = m
            .get("supported_reasoning_levels")
            .and_then(|x| x.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| e.get("effort").and_then(|v| v.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let default_reasoning = m
            .get("default_reasoning_level")
            .and_then(|x| x.as_str())
            .map(|s| s.to_string());

        out.push(ModelInfo {
            slug,
            display_name,
            description,
            reasoning_levels: levels,
            default_reasoning,
        });
    }
    Ok(out)
}

/// 去除 ANSI 颜色/控制转义码
fn strip_ansi(s: &str) -> String {
    // 匹配 CSI 序列: ESC [ ... letter
    // 以及 OSC 序列: ESC ] ... BEL / ESC \
    static ANSI_RE: once_cell::sync::Lazy<regex::Regex> = once_cell::sync::Lazy::new(|| {
        regex::Regex::new(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]")
            .unwrap()
    });
    ANSI_RE.replace_all(s, "").to_string()
}

/// 行级清洗：命中任一 regex 的行被删除
fn clean_output(raw: &str, patterns: &[String]) -> String {
    // 先剥 ANSI
    let raw = strip_ansi(raw);
    let raw = raw.as_str();

    // 特殊处理：codex exec 的分块输出
    if raw.contains("OpenAI Codex") && raw.contains("\ncodex\n") {
        if let Some(trimmed) = extract_codex_assistant_block(raw) {
            return trimmed;
        }
    }

    let regexes: Vec<regex::Regex> = patterns
        .iter()
        .filter_map(|p| regex::Regex::new(p).ok())
        .collect();

    let mut out = Vec::new();
    for line in raw.lines() {
        if regexes.iter().any(|re| re.is_match(line)) {
            let stripped: String = regexes
                .iter()
                .fold(line.to_string(), |acc, re| {
                    re.replace_all(&acc, "").to_string()
                });
            if !stripped.trim().is_empty() {
                out.push(stripped);
            }
        } else {
            out.push(line.to_string());
        }
    }
    let text = out.join("\n");
    let mut result = String::new();
    let mut prev_blank = true;
    for line in text.lines() {
        let is_blank = line.trim().is_empty();
        if is_blank && prev_blank {
            continue;
        }
        result.push_str(line);
        result.push('\n');
        prev_blank = is_blank;
    }
    result.trim().to_string()
}

/// 从 codex exec 输出中提取 `codex` 块（最后一个助手回复）
///
/// 典型结构：
/// ```text
/// OpenAI Codex v...
/// --------
/// ... banner ...
/// --------
/// user
/// <user prompt>
/// codex
/// <assistant output>
/// tokens used
/// 17,238
/// ```
fn extract_codex_assistant_block(raw: &str) -> Option<String> {
    let lines: Vec<&str> = raw.lines().collect();
    // 找最后一个 "codex" 单独行
    let start = lines
        .iter()
        .enumerate()
        .rev()
        .find(|(_, l)| l.trim() == "codex")
        .map(|(i, _)| i + 1)?;

    // 找到 "tokens used" 作为结束；没有就用文件末尾
    let end = lines[start..]
        .iter()
        .position(|l| l.trim() == "tokens used")
        .map(|p| start + p)
        .unwrap_or(lines.len());

    let content = lines[start..end].join("\n").trim().to_string();
    if content.is_empty() {
        return None;
    }
    // 去除 codex TUI 的视觉装饰：
    //   - 行首的 "> " 装饰引号
    //   - 行首两个空格的缩进（与纯代码块里的缩进不同，这里是整段统一添加的）
    let mut cleaned_lines: Vec<String> = Vec::new();
    // 先检测整体是否都有 2 空格/TAB 缩进，如果是，整体左移
    let non_empty: Vec<&str> = content.lines().filter(|l| !l.trim().is_empty()).collect();
    let should_dedent_two = !non_empty.is_empty()
        && non_empty
            .iter()
            .all(|l| l.starts_with("  ") || l.starts_with("> "));
    for line in content.lines() {
        let mut l = line.to_string();
        if should_dedent_two {
            if let Some(rest) = l.strip_prefix("> ") {
                l = rest.to_string();
            } else if let Some(rest) = l.strip_prefix("  ") {
                l = rest.to_string();
            }
        } else if let Some(rest) = l.strip_prefix("> ") {
            l = rest.to_string();
        }
        cleaned_lines.push(l);
    }
    Some(cleaned_lines.join("\n").trim().to_string())
}

fn diagnose(cmd: &str, stderr: &str) -> String {
    let lower = stderr.to_ascii_lowercase();
    if lower.contains("not inside a trusted directory")
        || lower.contains("skip-git-repo-check")
    {
        return "提示：Codex 要求在受信任目录运行。请到「设置 → CLI 模板 → Codex CLI」点「恢复默认」，已包含 --skip-git-repo-check。".into();
    }
    if lower.contains("not logged in")
        || lower.contains("unauthorized")
        || lower.contains("please log in")
        || lower.contains("authentication")
    {
        return match cmd {
            "claude" => "提示：请在终端执行 `claude` 完成登录。".into(),
            "codex" => "提示：请在终端执行 `codex login` 完成登录。".into(),
            "kiro-cli" => "提示：请在终端执行 `kiro-cli` 完成登录。".into(),
            _ => "提示：该 CLI 需要先登录。".into(),
        };
    }
    if lower.contains("command not found") || lower.contains("no such file") {
        return format!("提示：未找到可执行文件 `{cmd}`，请确认已安装且在 PATH 中。");
    }
    match cmd {
        "claude" => "提示：首次使用请在终端执行 `claude` 完成登录。".into(),
        "codex" => "提示：首次使用请执行 `codex login`。".into(),
        "kiro-cli" => "提示：首次使用请执行 `kiro-cli` 完成登录。".into(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_args_regular() {
        assert_eq!(
            build_model_args("--model", "sonnet"),
            vec!["--model", "sonnet"]
        );
    }

    #[test]
    fn model_args_equals_flag() {
        assert_eq!(
            build_model_args("-c model=", "o3"),
            vec!["-c", "model=o3"]
        );
    }

    #[test]
    fn model_args_empty() {
        assert!(build_model_args("", "anything").is_empty());
        assert!(build_model_args("--model", "").is_empty());
    }

    #[test]
    fn clean_output_strips_kiro_footer() {
        let raw = "WARNING: xxx\nOne or more mcp server oops\n------\n> PONG\n\n ▸ Credits: 0.08 • Time: 4s\n";
        let patterns = vec![
            r"^\s*>\s*".to_string(),
            r"^\s*▸.*$".to_string(),
            r"^-{3,}\s*$".to_string(),
            r"^WARNING:.*$".to_string(),
            r"^One or more mcp server.*$".to_string(),
        ];
        let out = clean_output(raw, &patterns);
        assert_eq!(out, "PONG");
    }

    #[test]
    fn clean_output_extracts_codex_block() {
        let raw = "OpenAI Codex v0.128.0 (research preview)\n--------\nworkdir: /x\nmodel: gpt-5.5\n--------\nuser\n请改写：做个网站\ncodex\n# 任务\n实现一个现代响应式网站\n\n# 背景\n- 技术栈: html + tailwind\ntokens used\n17,238\n";
        let out = clean_output(raw, &[]);
        assert_eq!(
            out,
            "# 任务\n实现一个现代响应式网站\n\n# 背景\n- 技术栈: html + tailwind"
        );
    }

    #[test]
    fn strip_ansi_removes_color_codes() {
        let raw = "\x1b[38;5;141m> \x1b[0m\x1b[38;5;252m\x1b[1m# 任务\x1b[0m\x1b[0m正文内容\x1b[0m";
        let stripped = strip_ansi(raw);
        assert_eq!(stripped, "> # 任务正文内容");
    }

    #[test]
    fn clean_output_handles_ansi_and_codex_block() {
        let raw = "\x1b[1mOpenAI Codex v0.128.0\x1b[0m\n--------\nworkdir: /x\n--------\nuser\nhi\ncodex\n\x1b[38;5;141m# 任务\x1b[0m\n实现登录功能\ntokens used\n100\n";
        let out = clean_output(raw, &[]);
        assert_eq!(out, "# 任务\n实现登录功能");
    }

    #[test]
    fn clean_output_strips_codex_quote_prefix() {
        // codex TUI 会给每行加 "> " 或 两格缩进装饰
        let raw = "OpenAI Codex v0.128.0\n--------\nuser\nhi\ncodex\n> # 任务\n  分析问题\n  \n> # 约束\n  不要修改文件\ntokens used\n100\n";
        let out = clean_output(raw, &[]);
        assert_eq!(out, "# 任务\n分析问题\n\n# 约束\n不要修改文件");
    }
}
