// 引擎接口：根据 AppConfig 分发
pub mod cli_passthrough;
pub mod custom_api;
pub mod rule_based;

use crate::config::{AppConfig, EngineKind};
use crate::error::AppResult;
use tauri::AppHandle;

pub const DEFAULT_SYSTEM_PROMPT: &str = r#"你是 Prompto，一个专业的提示词工程师。你的工作是接收开发者写给 AI 编程助手（如 Claude Code、Codex、Kiro、Cursor 等）的原始提示词，将其改写为更清晰、更完整、更容易被正确执行的版本。

你的身份定位：
你不是执行任务的人，你是"翻译官"——把开发者脑子里模糊的想法翻译成 AI 编程助手能精确理解的指令。你熟悉各种编程场景，知道 AI 助手需要哪些信息才能一次做对。

改写方法论：

第一步：识别意图类型
判断这是哪种任务：
- 新功能开发：需要明确做什么、用什么技术、放在哪里、怎么和现有代码衔接
- Bug 修复：需要明确现象、期望行为、复现步骤、相关文件
- 重构：需要明确改什么、为什么改、改完要保持什么行为不变
- 代码解释：需要明确解释的范围、深度、面向谁
- 配置/部署：需要明确环境、工具版本、目标状态
- 调研/对比：需要明确评估维度、决策标准

第二步：补全关键信息
检查原文是否缺少以下维度，缺的就补上：
- 具体要做什么（把"优化一下"变成"把列表渲染从 O(n²) 改成 O(n)"）
- 技术上下文（框架、语言、版本、相关文件路径）
- 输入输出（数据长什么样、接口返回什么格式）
- 边界情况（空值怎么办、并发怎么办、权限不够怎么办）
- 验收标准（怎么算做完了）

第三步：组织表达
- 先说目标（一句话），再说背景，再说细节
- 多个要求时用编号列出，方便 AI 逐条对照
- 相关的信息放在一起，不要东一句西一句

第四步：检查是否过度改写
- 如果原文已经很清楚（比如"把 Button 组件的 onClick 改成 async"），不要展开成一大段
- 简单任务保持简短，复杂任务才需要详细展开
- 不要加原文没提到的新功能或新需求

处理信息不足的策略：
- 能从上下文合理推断的，直接补上（比如提到 React 组件，就默认 TypeScript + 函数组件）
- 不能推断的关键信息，在改写中标注"待确认"并说明为什么需要这个信息
- 不要编造具体的文件路径、变量名、API 地址——这些必须来自用户

输出格式要求：
- 纯文本输出，不要使用任何 Markdown 标记（不要 #、**、-、*、```）
- 需要列举时用数字编号（1. 2. 3.）
- 需要分段时用空行隔开
- 代码片段或命令直接写在句子里，不要用代码块包裹
- 直接输出改写结果，不要写"以下是改写后的版本"之类的前缀

语言风格：
- 跟随用户的语言：用户写中文你就输出中文，写英文就输出英文
- 保持专业但不死板，像一个资深同事在帮你理清需求
- 不要用"您"、"请问"这类客套话，直接说事"#;

pub fn effective_system_prompt(cfg: &AppConfig) -> String {
    if cfg.system_prompt.trim().is_empty() {
        DEFAULT_SYSTEM_PROMPT.to_string()
    } else {
        cfg.system_prompt.clone()
    }
}

/// 去 markdown：把 `# 标题` / `**粗体**` / `- 列表` / ``` 包裹 / `` `inline` `` 还原为纯文本。
/// 对所有引擎的最终输出做统一清理。
pub fn strip_markdown(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_code_fence = false;

    for line in input.lines() {
        // 丢弃代码围栏本身（``` 或 ```lang），保留内部代码当作普通段落
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_code_fence = !in_code_fence;
            continue;
        }

        let mut l = line.to_string();

        // 行首 ATX 标题：`# `, `## ` ... 去掉
        let ltrim_start = l.trim_start();
        if let Some(stripped) = strip_heading(ltrim_start) {
            let lead: String = l.chars().take(l.len() - ltrim_start.len()).collect();
            l = format!("{lead}{stripped}");
        }

        // 行首无序列表 `- ` / `* ` / `+ ` 转成 「· 」
        if let Some(stripped) = strip_bullet(&l) {
            l = stripped;
        }

        // 粗体 **xxx** / __xxx__ → xxx
        l = strip_wrapper(&l, "**");
        l = strip_wrapper(&l, "__");

        // 斜体 *xxx* / _xxx_ → xxx （保守：只处理没有空格紧贴的）
        l = strip_single_wrapper(&l, '*');
        l = strip_single_wrapper(&l, '_');

        // 行内代码 `xxx` → xxx
        l = strip_single_wrapper(&l, '`');

        // 行首 blockquote `> `
        let ltrim = l.trim_start();
        if let Some(rest) = ltrim.strip_prefix("> ") {
            let lead: String = l.chars().take(l.len() - ltrim.len()).collect();
            l = format!("{lead}{rest}");
        } else if l.trim() == ">" {
            l = String::new();
        }

        out.push_str(&l);
        out.push('\n');
    }

    // 合并多余空行
    let mut result = String::new();
    let mut prev_blank = true;
    for line in out.lines() {
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

fn strip_heading(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i] == b'#' {
        i += 1;
    }
    if i == 0 || i > 6 {
        return None;
    }
    // 后面必须跟空格或结束
    if i < bytes.len() && bytes[i] != b' ' {
        return None;
    }
    let rest = s[i..].trim_start();
    Some(rest.to_string())
}

fn strip_bullet(line: &str) -> Option<String> {
    let ltrim = line.trim_start();
    // 匹配 "- "  "* "  "+ "
    let markers = ["- ", "* ", "+ "];
    for m in &markers {
        if let Some(rest) = ltrim.strip_prefix(m) {
            let lead_len = line.len() - ltrim.len();
            let lead: String = line.chars().take(lead_len).collect();
            return Some(format!("{lead}· {rest}"));
        }
    }
    None
}

/// 处理 **xxx** / __xxx__ 这类成对包裹
fn strip_wrapper(line: &str, wrap: &str) -> String {
    if !line.contains(wrap) {
        return line.to_string();
    }
    let mut out = String::with_capacity(line.len());
    let mut rest = line;
    loop {
        match rest.find(wrap) {
            None => {
                out.push_str(rest);
                break;
            }
            Some(start) => {
                out.push_str(&rest[..start]);
                let after = &rest[start + wrap.len()..];
                match after.find(wrap) {
                    None => {
                        // 未闭合，按原样写回
                        out.push_str(&rest[start..]);
                        break;
                    }
                    Some(end_rel) => {
                        out.push_str(&after[..end_rel]);
                        rest = &after[end_rel + wrap.len()..];
                    }
                }
            }
        }
    }
    out
}

/// 处理 `*x*` `_x_` `` `x` `` 这种单字符包裹，且要求两端紧贴字符
fn strip_single_wrapper(line: &str, wrap: char) -> String {
    let chars: Vec<char> = line.chars().collect();
    let mut out = String::with_capacity(line.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == wrap {
            // 查找下一个相同字符，两端不能是空格
            if i + 1 < chars.len() && !chars[i + 1].is_whitespace() {
                if let Some(rel) = chars[i + 1..].iter().position(|&c| c == wrap) {
                    let end = i + 1 + rel;
                    if end > 0 && !chars[end - 1].is_whitespace() {
                        // 匹配成功，跳过 wrap，追加中间内容
                        for c in &chars[i + 1..end] {
                            out.push(*c);
                        }
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_headings_and_bullets() {
        let raw = "# 任务\n分析问题\n\n## 背景\n- React 19\n- Tauri 2\n\n**重要**: 使用 `cargo test` 验证";
        let out = strip_markdown(raw);
        assert_eq!(
            out,
            "任务\n分析问题\n\n背景\n· React 19\n· Tauri 2\n\n重要: 使用 cargo test 验证"
        );
    }

    #[test]
    fn strips_code_fences_but_keeps_inner() {
        let raw = "代码示例：\n```rust\nfn main() {}\n```\n结束";
        let out = strip_markdown(raw);
        assert_eq!(out, "代码示例：\nfn main() {}\n结束");
    }

    #[test]
    fn keeps_plain_text_untouched() {
        let raw = "这是一段普通文本，包含数字 3.14 和标点。";
        assert_eq!(strip_markdown(raw), raw);
    }

    #[test]
    fn strips_blockquote() {
        let raw = "> 引用内容\n正文";
        assert_eq!(strip_markdown(raw), "引用内容\n正文");
    }
}

/// 统一优化入口（非流式）
pub async fn optimize(cfg: &AppConfig, input: &str) -> AppResult<String> {
    let sys = effective_system_prompt(cfg);
    let raw = match cfg.engine {
        EngineKind::CliPassthrough => {
            let tpl = cfg.cli_template(cfg.target_cli);
            cli_passthrough::optimize(&tpl, &sys, input).await?
        }
        EngineKind::CustomApi => custom_api::optimize(&cfg.custom_api, &sys, input).await?,
        EngineKind::RuleBased => rule_based::optimize(input, &cfg.rules)?,
    };
    // 规则引擎本身就是按用户配置来组织文本，不剥；其它引擎兜底剥 markdown
    Ok(match cfg.engine {
        EngineKind::RuleBased => raw,
        _ => strip_markdown(&raw),
    })
}

/// 流式优化：仅 CustomApi 支持真流式，其它引擎走一次性返回（完成后一次性推送）
pub async fn optimize_streaming(
    app: &AppHandle,
    request_id: &str,
    cfg: &AppConfig,
    input: &str,
) -> AppResult<String> {
    let sys = effective_system_prompt(cfg);
    let raw = match cfg.engine {
        EngineKind::CustomApi if cfg.custom_api.stream => {
            custom_api::optimize_stream(app, request_id, &cfg.custom_api, &sys, input).await?
        }
        _ => return optimize(cfg, input).await,
    };
    Ok(strip_markdown(&raw))
}
