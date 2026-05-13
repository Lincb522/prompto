// OpenAI 兼容端点调用，支持流式（SSE）与一次性两种模式
use crate::config::CustomApiConfig;
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    temperature: f32,
    stream: bool,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatMessageOwned,
}

#[derive(Deserialize)]
struct ChatMessageOwned {
    content: String,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct DeltaChoice {
    delta: DeltaContent,
}

#[derive(Deserialize)]
struct DeltaContent {
    #[serde(default)]
    content: Option<String>,
}

#[derive(Deserialize)]
struct DeltaChunk {
    choices: Vec<DeltaChoice>,
}

pub const EVT_STREAM_CHUNK: &str = "prompto://optimize-chunk";

fn build_client() -> AppResult<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()?)
}

fn validate(cfg: &CustomApiConfig) -> AppResult<()> {
    if cfg.base_url.trim().is_empty() {
        return Err(AppError::Config("未配置自定义 API Base URL".into()));
    }
    if cfg.model.trim().is_empty() {
        return Err(AppError::Config("未配置自定义 API 模型".into()));
    }
    Ok(())
}

fn endpoint(cfg: &CustomApiConfig) -> String {
    format!(
        "{}/chat/completions",
        cfg.base_url.trim_end_matches('/')
    )
}

/// 非流式调用：等整段结果返回
pub async fn optimize(
    cfg: &CustomApiConfig,
    system: &str,
    user_input: &str,
) -> AppResult<String> {
    validate(cfg)?;
    let body = ChatRequest {
        model: &cfg.model,
        messages: vec![
            ChatMessage { role: "system", content: system },
            ChatMessage { role: "user", content: user_input },
        ],
        temperature: cfg.temperature.max(0.0).min(2.0),
        stream: false,
    };

    let mut req = build_client()?.post(endpoint(cfg)).json(&body);
    if !cfg.api_key.is_empty() {
        req = req.bearer_auth(&cfg.api_key);
    }

    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Engine(format!(
            "API 调用失败 {}: {}",
            status, text
        )));
    }

    let data: ChatResponse = resp.json().await?;
    let content = data
        .choices
        .into_iter()
        .next()
        .map(|c| c.message.content)
        .unwrap_or_default();

    if content.trim().is_empty() {
        return Err(AppError::Engine("API 返回为空".into()));
    }
    Ok(content.trim().to_string())
}

/// 流式调用：每拿到一个 token 就通过事件推给前端，最终返回完整字符串
pub async fn optimize_stream(
    app: &AppHandle,
    request_id: &str,
    cfg: &CustomApiConfig,
    system: &str,
    user_input: &str,
) -> AppResult<String> {
    validate(cfg)?;
    let body = ChatRequest {
        model: &cfg.model,
        messages: vec![
            ChatMessage { role: "system", content: system },
            ChatMessage { role: "user", content: user_input },
        ],
        temperature: cfg.temperature.max(0.0).min(2.0),
        stream: true,
    };

    let mut req = build_client()?.post(endpoint(cfg)).json(&body);
    if !cfg.api_key.is_empty() {
        req = req.bearer_auth(&cfg.api_key);
    }

    let resp = req.send().await?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(AppError::Engine(format!(
            "API 调用失败 {}: {}",
            status, text
        )));
    }

    let mut stream = resp.bytes_stream();
    let mut buf = String::new();
    let mut full = String::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let text = String::from_utf8_lossy(&chunk);
        buf.push_str(&text);

        // SSE: 以空行分隔事件
        while let Some(idx) = buf.find("\n\n") {
            let raw_event = buf[..idx].to_string();
            buf.drain(..idx + 2);

            for line in raw_event.lines() {
                let line = line.trim_start();
                if !line.starts_with("data:") {
                    continue;
                }
                let data = line.trim_start_matches("data:").trim();
                if data == "[DONE]" {
                    return Ok(full);
                }
                // 解析 delta
                if let Ok(chunk) = serde_json::from_str::<DeltaChunk>(data) {
                    for c in chunk.choices {
                        if let Some(piece) = c.delta.content {
                            if !piece.is_empty() {
                                full.push_str(&piece);
                                let _ = app.emit(
                                    EVT_STREAM_CHUNK,
                                    StreamPayload {
                                        request_id: request_id.to_string(),
                                        delta: piece,
                                    },
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    if full.trim().is_empty() {
        return Err(AppError::Engine("流式响应无内容".into()));
    }
    Ok(full)
}

#[derive(Serialize, Clone)]
struct StreamPayload {
    request_id: String,
    delta: String,
}
