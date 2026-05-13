// Tauri 命令入口
use crate::config::{self, AppConfig, ConfigState, TargetCli};
use crate::engines::{self, cli_passthrough};
use crate::error::AppResult;
use crate::history::{self, HistoryItem};
use crate::shortcut;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Serialize)]
pub struct OptimizeResult {
    pub optimized: String,
    pub item: HistoryItem,
}

#[tauri::command]
pub async fn optimize_prompt(
    request_id: String,
    input: String,
    app: AppHandle,
    state: State<'_, ConfigState>,
) -> AppResult<OptimizeResult> {
    let cfg = { state.0.lock().unwrap().clone() };

    let optimized = engines::optimize_streaming(&app, &request_id, &cfg, &input).await?;

    let engine_label = match cfg.engine {
        crate::config::EngineKind::CliPassthrough => "cli-passthrough",
        crate::config::EngineKind::CustomApi => "custom-api",
        crate::config::EngineKind::RuleBased => "rule-based",
    }
    .to_string();
    let target = matches!(cfg.engine, crate::config::EngineKind::CliPassthrough)
        .then(|| cfg.target_cli.slug().to_string());

    let item = history::new_item(engine_label, target, input, optimized.clone());
    let _ = history::append_history(item.clone());
    Ok(OptimizeResult { optimized, item })
}

#[derive(Serialize)]
pub struct CliStatus {
    pub cli: String,
    pub installed: bool,
    pub version: Option<String>,
    pub command: String,
}

#[tauri::command]
pub async fn detect_clis(state: State<'_, ConfigState>) -> AppResult<Vec<CliStatus>> {
    let cfg = state.0.lock().unwrap().clone();
    let mut out = Vec::new();
    for cli in [TargetCli::Claude, TargetCli::Codex, TargetCli::Kiro] {
        let tpl = cfg.cli_template(cli);
        let version = cli_passthrough::detect(cli, &tpl).await?;
        out.push(CliStatus {
            installed: version.is_some(),
            version,
            cli: cli.slug().into(),
            command: tpl.command,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn list_models(
    cli: TargetCli,
    state: State<'_, ConfigState>,
) -> AppResult<Vec<cli_passthrough::ModelInfo>> {
    let cfg = state.0.lock().unwrap().clone();
    let tpl = cfg.cli_template(cli);
    cli_passthrough::list_models(cli, &tpl).await
}

#[tauri::command]
pub fn get_config(state: State<'_, ConfigState>) -> AppResult<AppConfig> {
    Ok(state.0.lock().unwrap().clone())
}

#[tauri::command]
pub fn update_config(
    cfg: AppConfig,
    app: AppHandle,
    state: State<'_, ConfigState>,
) -> AppResult<AppConfig> {
    let mut cfg = cfg;
    cfg.fill_defaults();
    config::save_config(&cfg)?;

    // 处理快捷键变化
    let old_shortcut = { state.0.lock().unwrap().shortcut.clone() };
    {
        let mut guard = state.0.lock().unwrap();
        *guard = cfg.clone();
    }
    if old_shortcut != cfg.shortcut {
        let _ = shortcut::register(&app, &cfg.shortcut);
    }
    Ok(cfg)
}

#[tauri::command]
pub fn get_history() -> AppResult<Vec<HistoryItem>> {
    history::load_history()
}

#[tauri::command]
pub fn clear_history() -> AppResult<()> {
    history::clear_history()
}

#[tauri::command]
pub fn clear_all_history() -> AppResult<()> {
    history::clear_all()
}

#[tauri::command]
pub fn delete_history_item(id: String) -> AppResult<Vec<HistoryItem>> {
    history::delete_item(&id)
}

#[tauri::command]
pub fn toggle_history_pin(id: String) -> AppResult<Vec<HistoryItem>> {
    history::toggle_pin(&id)
}

#[tauri::command]
pub fn default_system_prompt() -> String {
    engines::DEFAULT_SYSTEM_PROMPT.to_string()
}

#[tauri::command]
pub fn show_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.unminimize();
        let _ = app.emit("prompto://activate", ());
    }
}

#[tauri::command]
pub fn open_config_dir() -> AppResult<()> {
    let dir = config::config_dir()?;
    #[cfg(target_os = "macos")]
    let _ = std::process::Command::new("open").arg(&dir).spawn();
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(all(unix, not(target_os = "macos")))]
    let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
    Ok(())
}

// ============ MCP 配置管理 ============

#[derive(Serialize, Deserialize)]
pub struct McpStatus {
    pub ide: String,
    pub installed: bool,
}

#[tauri::command]
pub fn check_mcp_status() -> AppResult<Vec<McpStatus>> {
    let targets = mcp_targets();
    let mut results = Vec::new();
    for (ide, path) in &targets {
        let installed = check_mcp_in_file(path);
        results.push(McpStatus {
            ide: ide.to_string(),
            installed,
        });
    }
    Ok(results)
}

#[tauri::command]
pub fn install_mcp(ide: String) -> AppResult<String> {
    let targets = mcp_targets();
    let path = targets
        .iter()
        .find(|(name, _)| *name == ide)
        .map(|(_, p)| p.clone())
        .ok_or_else(|| crate::error::AppError::Config(format!("未知 IDE: {}", ide)))?;

    install_mcp_to_file(&path)?;
    Ok("ok".into())
}

#[tauri::command]
pub fn uninstall_mcp(ide: String) -> AppResult<String> {
    let targets = mcp_targets();
    let path = targets
        .iter()
        .find(|(name, _)| *name == ide)
        .map(|(_, p)| p.clone())
        .ok_or_else(|| crate::error::AppError::Config(format!("未知 IDE: {}", ide)))?;

    uninstall_mcp_from_file(&path)?;
    Ok("ok".into())
}

fn mcp_targets() -> Vec<(&'static str, std::path::PathBuf)> {
    let home = dirs::home_dir().unwrap_or_default();
    vec![
        ("Kiro", home.join(".kiro/settings/mcp.json")),
        ("Cursor", home.join(".cursor/mcp.json")),
        ("Windsurf", home.join(".windsurf/mcp.json")),
        ("Codex", home.join(".codex/config.toml")),
        ("Claude Desktop", home.join("Library/Application Support/Claude/claude_desktop_config.json")),
        ("VS Code", home.join(".vscode/mcp.json")),
    ]
}

fn mcp_server_path() -> String {
    let exe = std::env::current_exe().unwrap_or_default();
    let project_root = exe
        .parent()
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .and_then(|p| p.parent())
        .unwrap_or(std::path::Path::new("."));
    project_root
        .join("mcp-server/dist/index.js")
        .to_string_lossy()
        .to_string()
}

fn is_toml_config(path: &std::path::Path) -> bool {
    path.extension().map(|e| e == "toml").unwrap_or(false)
}

fn check_mcp_in_file(path: &std::path::Path) -> bool {
    let Ok(data) = std::fs::read_to_string(path) else {
        return false;
    };
    if is_toml_config(path) {
        // Codex TOML: 检查 [mcp_servers.prompto] 是否存在
        data.contains("[mcp_servers.prompto]")
    } else {
        let Ok(v) = serde_json::from_str::<serde_json::Value>(&data) else {
            return false;
        };
        v.get("mcpServers")
            .and_then(|s| s.get("prompto"))
            .is_some()
    }
}

fn install_mcp_to_file(path: &std::path::Path) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    if is_toml_config(path) {
        // Codex TOML 格式
        let mut data = if path.exists() {
            std::fs::read_to_string(path)?
        } else {
            String::new()
        };

        if !data.contains("[mcp_servers.prompto]") {
            let server_path = mcp_server_path();
            let section = format!(
                "\n[mcp_servers.prompto]\ncommand = \"node\"\nargs = [\"{server_path}\"]\n"
            );
            data.push_str(&section);
            std::fs::write(path, data)?;
        }
        Ok(())
    } else {
        // JSON 格式
        let mut config: serde_json::Value = if path.exists() {
            let data = std::fs::read_to_string(path)?;
            serde_json::from_str(&data).unwrap_or_else(|_| serde_json::json!({}))
        } else {
            serde_json::json!({})
        };

        let servers = config
            .as_object_mut()
            .unwrap()
            .entry("mcpServers")
            .or_insert_with(|| serde_json::json!({}));

        servers.as_object_mut().unwrap().insert(
            "prompto".into(),
            serde_json::json!({
                "command": "node",
                "args": [mcp_server_path()],
                "disabled": false,
                "autoApprove": ["optimize_prompt", "list_engines"]
            }),
        );

        let data = serde_json::to_string_pretty(&config)?;
        std::fs::write(path, data)?;
        Ok(())
    }
}

fn uninstall_mcp_from_file(path: &std::path::Path) -> AppResult<()> {
    if !path.exists() {
        return Ok(());
    }

    if is_toml_config(path) {
        // Codex TOML：用 toml_edit 移除 [mcp_servers.prompto] 段
        let data = std::fs::read_to_string(path)?;
        let mut doc = data.parse::<toml_edit::DocumentMut>()
            .map_err(|e| crate::error::AppError::Config(format!("TOML 解析失败: {e}")))?;

        if let Some(servers) = doc.get_mut("mcp_servers").and_then(|t| t.as_table_like_mut()) {
            servers.remove("prompto");
        }

        std::fs::write(path, doc.to_string())?;
        Ok(())
    } else {
        let data = std::fs::read_to_string(path)?;
        let mut config: serde_json::Value =
            serde_json::from_str(&data).unwrap_or_else(|_| serde_json::json!({}));

        if let Some(servers) = config.get_mut("mcpServers").and_then(|s| s.as_object_mut()) {
            servers.remove("prompto");
        }

        let data = serde_json::to_string_pretty(&config)?;
        std::fs::write(path, data)?;
        Ok(())
    }
}
