// 全局快捷键：解析字符串、注册、在触发时显示窗口 + 推送剪贴板内容
use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{
    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
};

/// 解析字符串成 Shortcut。支持 "CmdOrCtrl+Shift+P" 这类表达式。
fn parse(expr: &str) -> AppResult<Shortcut> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for raw in expr.split('+') {
        let token = raw.trim();
        match token.to_ascii_lowercase().as_str() {
            "cmd" | "command" | "super" | "meta" | "win" => {
                mods |= Modifiers::SUPER;
            }
            "ctrl" | "control" => {
                mods |= Modifiers::CONTROL;
            }
            "cmdorctrl" | "cmd_or_ctrl" | "commandorctrl" => {
                #[cfg(target_os = "macos")]
                {
                    mods |= Modifiers::SUPER;
                }
                #[cfg(not(target_os = "macos"))]
                {
                    mods |= Modifiers::CONTROL;
                }
            }
            "shift" => mods |= Modifiers::SHIFT,
            "alt" | "option" | "opt" => mods |= Modifiers::ALT,
            other => {
                code = Some(parse_code(other)?);
            }
        }
    }
    let code = code.ok_or_else(|| AppError::Config(format!("快捷键缺少按键: {expr}")))?;
    Ok(Shortcut::new(Some(mods), code))
}

fn parse_code(s: &str) -> AppResult<Code> {
    let up = s.to_ascii_uppercase();
    // A-Z
    if up.len() == 1 {
        let ch = up.chars().next().unwrap();
        if ch.is_ascii_alphabetic() {
            return Ok(match ch {
                'A' => Code::KeyA, 'B' => Code::KeyB, 'C' => Code::KeyC, 'D' => Code::KeyD,
                'E' => Code::KeyE, 'F' => Code::KeyF, 'G' => Code::KeyG, 'H' => Code::KeyH,
                'I' => Code::KeyI, 'J' => Code::KeyJ, 'K' => Code::KeyK, 'L' => Code::KeyL,
                'M' => Code::KeyM, 'N' => Code::KeyN, 'O' => Code::KeyO, 'P' => Code::KeyP,
                'Q' => Code::KeyQ, 'R' => Code::KeyR, 'S' => Code::KeyS, 'T' => Code::KeyT,
                'U' => Code::KeyU, 'V' => Code::KeyV, 'W' => Code::KeyW, 'X' => Code::KeyX,
                'Y' => Code::KeyY, 'Z' => Code::KeyZ,
                _ => unreachable!(),
            });
        }
        if ch.is_ascii_digit() {
            return Ok(match ch {
                '0' => Code::Digit0, '1' => Code::Digit1, '2' => Code::Digit2,
                '3' => Code::Digit3, '4' => Code::Digit4, '5' => Code::Digit5,
                '6' => Code::Digit6, '7' => Code::Digit7, '8' => Code::Digit8,
                '9' => Code::Digit9,
                _ => unreachable!(),
            });
        }
    }
    Ok(match up.as_str() {
        "SPACE" => Code::Space,
        "ENTER" | "RETURN" => Code::Enter,
        "TAB" => Code::Tab,
        "ESC" | "ESCAPE" => Code::Escape,
        "BACKSPACE" => Code::Backspace,
        "DELETE" | "DEL" => Code::Delete,
        "F1" => Code::F1, "F2" => Code::F2, "F3" => Code::F3, "F4" => Code::F4,
        "F5" => Code::F5, "F6" => Code::F6, "F7" => Code::F7, "F8" => Code::F8,
        "F9" => Code::F9, "F10" => Code::F10, "F11" => Code::F11, "F12" => Code::F12,
        other => {
            return Err(AppError::Config(format!("暂不支持的按键: {other}")));
        }
    })
}

/// 注册或替换全局快捷键
pub fn register(app: &AppHandle, expr: &str) -> AppResult<()> {
    let manager = app.global_shortcut();
    // 先解注册全部再注册新的，避免残留
    let _ = manager.unregister_all();

    if expr.trim().is_empty() {
        return Ok(());
    }
    let shortcut = parse(expr)?;
    manager
        .register(shortcut)
        .map_err(|e| AppError::Config(format!("注册快捷键失败: {e}")))?;
    Ok(())
}

/// 构建时挂在插件里的 handler
pub fn on_shortcut(app: &AppHandle, _s: &Shortcut, event: tauri_plugin_global_shortcut::ShortcutEvent) {
    if event.state() != ShortcutState::Pressed {
        return;
    }
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
    // 通知前端：读取剪贴板并填入
    let _ = app.emit("prompto://hotkey-capture", ());
}
