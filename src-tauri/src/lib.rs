mod commands;
mod config;
mod engines;
mod error;
mod history;
mod shortcut;

use std::sync::Mutex;

use config::ConfigState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = config::load_config().unwrap_or_default();
    let startup_shortcut = cfg.shortcut.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, sc, event| shortcut::on_shortcut(app, sc, event))
                .build(),
        )
        .manage(ConfigState(Mutex::new(cfg)))
        .invoke_handler(tauri::generate_handler![
            commands::optimize_prompt,
            commands::detect_clis,
            commands::list_models,
            commands::get_config,
            commands::update_config,
            commands::get_history,
            commands::clear_history,
            commands::clear_all_history,
            commands::delete_history_item,
            commands::toggle_history_pin,
            commands::default_system_prompt,
            commands::show_window,
            commands::open_config_dir,
            commands::check_mcp_status,
            commands::install_mcp,
            commands::uninstall_mcp,
        ])
        .setup(move |app| {
            // 启动时注册快捷键
            if !startup_shortcut.trim().is_empty() {
                if let Err(e) = shortcut::register(&app.handle(), &startup_shortcut) {
                    eprintln!("注册启动快捷键失败: {e}");
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}