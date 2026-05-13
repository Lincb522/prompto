// 本地规则引擎：纯文本、可组合、可扩展
//
// 设计要点：
// - 单条规则只做一件事，输入输出都是 String
// - 代码块保护：用占位符替换 ``` 包裹区域，规则执行后再还原
// - 结构化模板：在输入前后包装 `# 目标 / # 上下文 / # 约束 / # 期望输出`
use crate::config::RuleConfig;
use crate::error::AppResult;

pub fn optimize(input: &str, cfg: &RuleConfig) -> AppResult<String> {
    let input = input.to_string();
    if input.trim().is_empty() {
        return Ok(String::new());
    }

    // 1. 可选：保护代码块
    let (mut work, blocks) = if cfg.protect_code_blocks {
        extract_code_blocks(&input)
    } else {
        (input, vec![])
    };

    // 2. 按顺序跑规则（顺序很重要：先清理再结构化）
    if cfg.trim_whitespace {
        work = trim_whitespace(&work);
    }
    if cfg.collapse_blank_lines {
        work = collapse_blank_lines(&work);
    }
    if cfg.normalize_punctuation {
        work = normalize_punctuation(&work);
    }
    if cfg.remove_filler_words {
        work = remove_filler_words(&work);
    }
    if cfg.compress_if_too_long && work.chars().count() > cfg.compress_threshold {
        work = compress_content(&work, cfg.compress_threshold);
    }
    if cfg.structure_template {
        work = apply_structure_template(&work, cfg.require_action_verb);
    } else if cfg.require_action_verb {
        work = hint_action_verb(&work);
    }

    // 3. 还原代码块
    if !blocks.is_empty() {
        work = restore_code_blocks(&work, &blocks);
    }

    Ok(work)
}

// --- 规则实现 ---------------------------------------------------------------

fn trim_whitespace(s: &str) -> String {
    s.lines()
        .map(|l| l.trim_end())
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn collapse_blank_lines(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut blank = 0usize;
    for line in s.lines() {
        if line.trim().is_empty() {
            blank += 1;
            if blank <= 1 {
                out.push('\n');
            }
        } else {
            blank = 0;
            out.push_str(line);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

/// 半角标点 → 全角（仅在中文上下文中执行较保守的替换）
fn normalize_punctuation(s: &str) -> String {
    // 仅替换行内且前后有中文字符的半角逗号、句号、问号、感叹号
    let mut chars: Vec<char> = s.chars().collect();
    let is_chinese = |c: char| ('\u{4E00}'..='\u{9FFF}').contains(&c);
    for i in 0..chars.len() {
        let prev = if i > 0 { chars[i - 1] } else { ' ' };
        let next = if i + 1 < chars.len() { chars[i + 1] } else { ' ' };
        let neighbor_cn = is_chinese(prev) || is_chinese(next);
        if !neighbor_cn {
            continue;
        }
        chars[i] = match chars[i] {
            ',' => ',',
            '.' => '。',
            '?' => '？',
            '!' => '！',
            ':' => '：',
            ';' => '；',
            '(' => '(',
            ')' => ')',
            other => other,
        };
    }
    chars.into_iter().collect()
}

/// 去掉口水/客套词，保持技术性
fn remove_filler_words(s: &str) -> String {
    const FILLERS: &[&str] = &[
        "麻烦你", "麻烦", "如果可以", "如果方便", "可以的话", "拜托了",
        "求求你", "帮忙", "辛苦了", "请问一下", "请问",
        "我想请你", "我想让你", "我希望你能",
        "please kindly", "kindly", "could you please", "would you mind",
    ];
    let mut out = s.to_string();
    for f in FILLERS {
        out = out.replace(f, "");
    }
    // 连续空白清理
    let mut cleaned = String::with_capacity(out.len());
    let mut last_was_space = false;
    for ch in out.chars() {
        if ch == ' ' || ch == '\t' {
            if !last_was_space {
                cleaned.push(' ');
            }
            last_was_space = true;
        } else {
            cleaned.push(ch);
            last_was_space = false;
        }
    }
    cleaned
}

/// 在动词不明显时给出提示
fn hint_action_verb(s: &str) -> String {
    let starts_with_verb = starts_with_action_verb(s);
    if starts_with_verb {
        s.to_string()
    } else {
        format!("请帮我完成以下任务：\n\n{}", s.trim())
    }
}

fn starts_with_action_verb(s: &str) -> bool {
    let first_line = s
        .lines()
        .next()
        .unwrap_or("")
        .trim_start()
        .to_lowercase();
    if first_line.is_empty() {
        return false;
    }
    const VERBS_EN: &[&str] = &[
        "create", "build", "implement", "fix", "refactor", "add", "remove",
        "update", "write", "generate", "design", "analyze", "explain",
        "optimize", "review", "test", "debug", "convert", "migrate",
    ];
    if VERBS_EN
        .iter()
        .any(|v| first_line.starts_with(v) || first_line.starts_with(&format!("please {}", v)))
    {
        return true;
    }
    const VERBS_CN: &[&str] = &[
        "实现", "创建", "构建", "新建", "添加", "修复", "重构", "删除",
        "更新", "编写", "生成", "设计", "分析", "解释", "优化", "审查",
        "测试", "调试", "转换", "迁移", "写一个", "做一个", "帮我写",
        "帮我做", "帮我实现", "请实现", "请创建", "请帮我", "完成",
    ];
    VERBS_CN.iter().any(|v| first_line.starts_with(v))
}

/// 结构化模板：目标 / 上下文 / 约束 / 期望输出
fn apply_structure_template(s: &str, require_verb: bool) -> String {
    let body = s.trim();
    if body.is_empty() {
        return String::new();
    }

    // 尝试从原文中拆分「约束/要求」线索
    let mut goal_lines: Vec<&str> = Vec::new();
    let mut constraint_lines: Vec<&str> = Vec::new();
    let mut output_lines: Vec<&str> = Vec::new();

    for line in body.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let lower = l.to_lowercase();
        let is_constraint = lower.starts_with("不要")
            || lower.starts_with("必须")
            || lower.starts_with("避免")
            || lower.starts_with("禁止")
            || lower.starts_with("限制")
            || lower.starts_with("must ")
            || lower.starts_with("don't ")
            || lower.starts_with("do not ")
            || lower.starts_with("avoid ");
        let is_output = lower.starts_with("输出")
            || lower.starts_with("返回")
            || lower.starts_with("output")
            || lower.starts_with("return")
            || lower.starts_with("格式为")
            || lower.contains("markdown 格式");

        if is_constraint {
            constraint_lines.push(line);
        } else if is_output {
            output_lines.push(line);
        } else {
            goal_lines.push(line);
        }
    }

    let mut goal = goal_lines.join("\n").trim().to_string();
    if require_verb && !starts_with_action_verb(&goal) && !goal.is_empty() {
        goal = format!("请帮我完成以下任务：{}", goal);
    }
    if goal.is_empty() {
        goal = body.to_string();
    }

    let mut result = String::new();
    result.push_str("# 目标\n");
    result.push_str(goal.trim());
    result.push_str("\n\n# 约束\n");
    if constraint_lines.is_empty() {
        result.push_str("- 保持现有代码风格与命名\n- 不引入未经许可的新依赖\n");
    } else {
        for l in constraint_lines {
            result.push_str("- ");
            result.push_str(l.trim_start_matches(['-', '*', ' ', '\t']));
            result.push('\n');
        }
    }
    result.push_str("\n# 期望输出\n");
    if output_lines.is_empty() {
        result.push_str("- 先用 2-4 句话说明实现思路\n- 再给出完整、可运行的代码\n- 指出需要修改/新增的文件\n");
    } else {
        for l in output_lines {
            result.push_str("- ");
            result.push_str(l.trim_start_matches(['-', '*', ' ', '\t']));
            result.push('\n');
        }
    }
    result.trim_end().to_string()
}

/// 粗暴压缩：保留前 N 字符 + 末尾换行摘要提示
fn compress_content(s: &str, threshold: usize) -> String {
    let chars: Vec<char> = s.chars().collect();
    if chars.len() <= threshold {
        return s.to_string();
    }
    let head: String = chars.iter().take(threshold * 2 / 3).collect();
    let tail: String = chars.iter().skip(chars.len() - threshold / 3).collect();
    format!("{head}\n\n…（中间内容因过长被省略，共 {} 字符）…\n\n{tail}", chars.len())
}

// --- 代码块保护 -------------------------------------------------------------

fn extract_code_blocks(s: &str) -> (String, Vec<String>) {
    let mut out = String::with_capacity(s.len());
    let mut blocks: Vec<String> = Vec::new();
    let mut rest = s;
    loop {
        match rest.find("```") {
            None => {
                out.push_str(rest);
                break;
            }
            Some(start) => {
                out.push_str(&rest[..start]);
                let after = &rest[start + 3..];
                match after.find("```") {
                    None => {
                        // 未闭合，原样保留
                        out.push_str(&rest[start..]);
                        break;
                    }
                    Some(end_rel) => {
                        let full_block = &rest[start..start + 3 + end_rel + 3];
                        let token = format!("\x00PROMPTO_CODEBLOCK_{}\x00", blocks.len());
                        blocks.push(full_block.to_string());
                        out.push_str(&token);
                        rest = &rest[start + 3 + end_rel + 3..];
                    }
                }
            }
        }
    }
    (out, blocks)
}

fn restore_code_blocks(s: &str, blocks: &[String]) -> String {
    let mut out = s.to_string();
    for (i, b) in blocks.iter().enumerate() {
        let token = format!("\x00PROMPTO_CODEBLOCK_{}\x00", i);
        out = out.replace(&token, b);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_collapses() {
        let cfg = RuleConfig {
            trim_whitespace: true,
            collapse_blank_lines: true,
            protect_code_blocks: false,
            remove_filler_words: false,
            structure_template: false,
            normalize_punctuation: false,
            require_action_verb: false,
            compress_if_too_long: false,
            compress_threshold: 1000,
        };
        let out = optimize("  hello   \n\n\n\nworld   ", &cfg).unwrap();
        assert_eq!(out, "hello\n\nworld");
    }

    #[test]
    fn protects_code_blocks() {
        let cfg = RuleConfig {
            trim_whitespace: true,
            collapse_blank_lines: true,
            protect_code_blocks: true,
            remove_filler_words: true,
            structure_template: false,
            normalize_punctuation: false,
            require_action_verb: false,
            compress_if_too_long: false,
            compress_threshold: 1000,
        };
        let src = "麻烦你写代码\n```\nfn main() { println!(\"hi\"); }\n```\n";
        let out = optimize(src, &cfg).unwrap();
        assert!(out.contains("```"));
        assert!(out.contains("fn main()"));
        assert!(!out.contains("麻烦你"));
    }
}
