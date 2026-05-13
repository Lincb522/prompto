// 用户配置：引擎、目标 CLI、自定义 API、快捷键、规则引擎配置
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum EngineKind {
    /// 通过目标 CLI 二次调用（复用其凭据）
    CliPassthrough,
    /// 自定义 OpenAI 兼容 API
    CustomApi,
    /// 本地规则引擎
    RuleBased,
}

impl Default for EngineKind {
    fn default() -> Self {
        Self::CliPassthrough
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "kebab-case")]
pub enum TargetCli {
    Codex,
    Claude,
    Kiro,
}

impl TargetCli {
    pub fn slug(&self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Kiro => "kiro",
        }
    }
}

impl Default for TargetCli {
    fn default() -> Self {
        Self::Claude
    }
}

/// CLI 执行模板
///
/// - `command` 可执行文件名。
/// - `args` 参数数组，支持占位符：`{prompt}` 替换整段 prompt；`{model}` 替换模型名。
/// - `model_flag` 模型参数名（例如 `--model`、`-c model=`）。空字符串表示这个 CLI 不支持模型切换。
/// - `stdin_mode` 没有 `{prompt}` 占位符时，从 stdin 注入 prompt。
/// - `model` 用户为这个 CLI 选择的默认模型。
/// - `strip_patterns` 输出清洗正则（行级匹配，命中行整行删除）。应对 kiro-cli 这种带脚注/警告的输出。
/// - `supports_passthrough` 是否支持 AI 透传；否则 UI 会引导用户改命令或切换引擎。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct CliTemplate {
    pub command: String,
    pub args: Vec<String>,
    pub stdin_mode: bool,
    pub model: String,
    pub model_flag: String,
    /// 思考强度 / reasoning effort（可选，仅部分 CLI 支持）
    pub reasoning_effort: String,
    pub strip_patterns: Vec<String>,
    pub supports_passthrough: bool,
}

impl Default for CliTemplate {
    fn default() -> Self {
        Self {
            command: String::new(),
            args: vec![],
            stdin_mode: true,
            model: String::new(),
            model_flag: String::new(),
            reasoning_effort: String::new(),
            strip_patterns: vec![],
            supports_passthrough: true,
        }
    }
}

impl CliTemplate {
    pub fn defaults_for(cli: TargetCli) -> Self {
        match cli {
            TargetCli::Claude => Self {
                command: "claude".into(),
                args: vec!["-p".into(), "{prompt}".into()],
                stdin_mode: false,
                model: String::new(),
                model_flag: "--model".into(),
                reasoning_effort: String::new(),
                strip_patterns: vec![],
                supports_passthrough: true,
            },
            TargetCli::Codex => Self {
                command: "codex".into(),
                args: vec![
                    "exec".into(),
                    "--skip-git-repo-check".into(),
                    "{prompt}".into(),
                ],
                stdin_mode: false,
                model: String::new(),
                model_flag: "-c model=".into(),
                reasoning_effort: String::new(),
                strip_patterns: vec![
                    // codex exec 的 banner 与元信息
                    r"^-{3,}\s*$".into(),
                    r"^OpenAI Codex.*$".into(),
                    r"^workdir:.*$".into(),
                    r"^model:.*$".into(),
                    r"^provider:.*$".into(),
                    r"^approval:.*$".into(),
                    r"^sandbox:.*$".into(),
                    r"^reasoning effort:.*$".into(),
                    r"^reasoning summaries:.*$".into(),
                    r"^session id:.*$".into(),
                    // 对话回显标签
                    r"^user\s*$".into(),
                    r"^codex\s*$".into(),
                    r"^assistant\s*$".into(),
                    // token 统计尾部
                    r"^tokens used\s*$".into(),
                    r"^\d+(,\d+)*\s*$".into(), // 形如 17,238 的数字行
                ],
                supports_passthrough: true,
            },
            TargetCli::Kiro => Self {
                command: "kiro-cli".into(),
                args: vec![
                    "chat".into(),
                    "--no-interactive".into(),
                    "--trust-tools=".into(),
                    "{prompt}".into(),
                ],
                stdin_mode: false,
                model: String::new(),
                model_flag: "--model".into(),
                reasoning_effort: String::new(),
                strip_patterns: vec![
                    r"^\s*>\s*".into(),
                    r"^\s*▸.*$".into(),
                    r"^-{3,}\s*$".into(),
                    r"^WARNING:.*$".into(),
                    r"^One or more mcp server.*$".into(),
                ],
                supports_passthrough: true,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
#[serde(default)]
pub struct CustomApiConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    /// 是否使用流式响应
    pub stream: bool,
    /// 温度
    pub temperature: f32,
}

/// 规则引擎配置：可启用/禁用的单独规则
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct RuleConfig {
    /// 清理多余空白
    pub trim_whitespace: bool,
    /// 折叠连续空行
    pub collapse_blank_lines: bool,
    /// 保护代码块不被规则修改
    pub protect_code_blocks: bool,
    /// 去除填充词（比如 "请", "麻烦", "可以的话" 等客套）
    pub remove_filler_words: bool,
    /// 把原文按结构化模板重写（目标/上下文/约束/输出）
    pub structure_template: bool,
    /// 把中文标点规范化为全角
    pub normalize_punctuation: bool,
    /// 如果原文缺少明确动词开头，给出提示
    pub require_action_verb: bool,
    /// 长度超过阈值时压缩重点
    pub compress_if_too_long: bool,
    /// 压缩触发的字符阈值
    pub compress_threshold: usize,
}

impl Default for RuleConfig {
    fn default() -> Self {
        Self {
            trim_whitespace: true,
            collapse_blank_lines: true,
            protect_code_blocks: true,
            remove_filler_words: true,
            structure_template: true,
            normalize_punctuation: false,
            require_action_verb: true,
            compress_if_too_long: false,
            compress_threshold: 1200,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub engine: EngineKind,
    pub target_cli: TargetCli,
    pub custom_api: CustomApiConfig,
    /// 各 CLI 独立的命令模板
    pub cli_templates: HashMap<String, CliTemplate>,
    /// 规则引擎配置
    pub rules: RuleConfig,
    /// 是否开启剪贴板监听
    pub clipboard_watch: bool,
    /// 全局快捷键，例如 "CmdOrCtrl+Shift+P"。留空则不注册。
    pub shortcut: String,
    /// 自定义系统 prompt，为空时使用默认
    pub system_prompt: String,
    /// 主题：light / dark / system
    pub theme: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let mut cli_templates = HashMap::new();
        for cli in [TargetCli::Claude, TargetCli::Codex, TargetCli::Kiro] {
            cli_templates.insert(cli.slug().to_string(), CliTemplate::defaults_for(cli));
        }
        Self {
            engine: EngineKind::default(),
            target_cli: TargetCli::default(),
            custom_api: CustomApiConfig {
                base_url: String::new(),
                api_key: String::new(),
                model: "gpt-4o-mini".into(),
                stream: true,
                temperature: 0.3,
            },
            cli_templates,
            rules: RuleConfig::default(),
            clipboard_watch: false,
            shortcut: "CmdOrCtrl+Shift+P".to_string(),
            system_prompt: String::new(),
            theme: "system".to_string(),
        }
    }
}

impl AppConfig {
    pub fn cli_template(&self, cli: TargetCli) -> CliTemplate {
        self.cli_templates
            .get(cli.slug())
            .cloned()
            .unwrap_or_else(|| CliTemplate::defaults_for(cli))
    }

    /// 合并新配置时补齐缺失的默认模板；并把已知的"旧默认"迁移到新默认
    pub fn fill_defaults(&mut self) {
        for cli in [TargetCli::Claude, TargetCli::Codex, TargetCli::Kiro] {
            let key = cli.slug().to_string();
            let default = CliTemplate::defaults_for(cli);
            self.cli_templates
                .entry(key.clone())
                .or_insert_with(|| default.clone());

            // 迁移：检测已知旧默认 → 升级到新默认（保留用户自定义的 model）
            if let Some(existing) = self.cli_templates.get_mut(&key) {
                if is_legacy_template(cli, existing) {
                    let keep_model = existing.model.clone();
                    *existing = default;
                    existing.model = keep_model;
                }
                // 若缺少 model_flag（老配置）补上
                if existing.model_flag.is_empty() && !default_flag(cli).is_empty() {
                    existing.model_flag = default_flag(cli).into();
                }
                // 补 strip_patterns（老配置里没有这个字段）
                if cli == TargetCli::Kiro && existing.strip_patterns.is_empty() {
                    existing.strip_patterns =
                        CliTemplate::defaults_for(TargetCli::Kiro).strip_patterns;
                }
            }
        }
    }
}

pub fn config_dir() -> AppResult<PathBuf> {
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Config("无法解析系统配置目录".into()))?;
    let dir = base.join("prompto");
    if !dir.exists() {
        std::fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

pub fn config_path() -> AppResult<PathBuf> {
    Ok(config_dir()?.join("config.json"))
}

pub fn load_config() -> AppResult<AppConfig> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let data = std::fs::read_to_string(&path)?;
    let mut cfg: AppConfig = serde_json::from_str(&data).unwrap_or_default();
    cfg.fill_defaults();
    Ok(cfg)
}

pub fn save_config(cfg: &AppConfig) -> AppResult<()> {
    let path = config_path()?;
    let data = serde_json::to_string_pretty(cfg)?;
    std::fs::write(path, data)?;
    Ok(())
}

pub struct ConfigState(pub Mutex<AppConfig>);

/// 已知的旧模板（之前版本写死过的）
fn is_legacy_template(cli: TargetCli, tpl: &CliTemplate) -> bool {
    match cli {
        TargetCli::Claude => tpl.command == "claude" && tpl.args == vec!["-p".to_string()],
        TargetCli::Codex => {
            tpl.command == "codex"
                && (tpl.args == vec!["exec".to_string(), "-".to_string()]
                    || tpl.args == vec!["exec".to_string(), "{prompt}".to_string()])
        }
        TargetCli::Kiro => {
            tpl.command == "kiro" // 旧版错误地指向编辑器启动器
                || (tpl.command == "kiro-cli"
                    && tpl.args == vec!["chat".to_string(), "-p".to_string()])
        }
    }
}

fn default_flag(cli: TargetCli) -> &'static str {
    match cli {
        TargetCli::Claude => "--model",
        TargetCli::Codex => "-c model=",
        TargetCli::Kiro => "--model",
    }
}
