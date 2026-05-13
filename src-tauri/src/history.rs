// 历史记录：JSON 文件存储；支持置顶、单条删除、搜索在前端做
use crate::config::config_dir;
use crate::error::AppResult;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// 非置顶记录的最大保留条数。置顶记录不计入上限。
const MAX_UNPINNED: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoryItem {
    pub id: String,
    pub created_at: i64, // 毫秒时间戳
    pub engine: String,
    pub target_cli: Option<String>,
    pub original: String,
    pub optimized: String,
    #[serde(default)]
    pub pinned: bool,
}

fn history_path() -> AppResult<PathBuf> {
    Ok(config_dir()?.join("history.json"))
}

pub fn load_history() -> AppResult<Vec<HistoryItem>> {
    let path = history_path()?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let data = std::fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&data).unwrap_or_default())
}

pub fn save_history(items: &[HistoryItem]) -> AppResult<()> {
    let path = history_path()?;
    let data = serde_json::to_string_pretty(items)?;
    std::fs::write(path, data)?;
    Ok(())
}

/// 插入一条新记录到列表顶部；非置顶部分超出 MAX_UNPINNED 的最旧记录被丢弃。
pub fn append_history(item: HistoryItem) -> AppResult<Vec<HistoryItem>> {
    let mut items = load_history()?;
    items.insert(0, item);
    trim_unpinned(&mut items);
    save_history(&items)?;
    Ok(items)
}

/// 删除一条记录
pub fn delete_item(id: &str) -> AppResult<Vec<HistoryItem>> {
    let mut items = load_history()?;
    items.retain(|it| it.id != id);
    save_history(&items)?;
    Ok(items)
}

/// 切换置顶状态
pub fn toggle_pin(id: &str) -> AppResult<Vec<HistoryItem>> {
    let mut items = load_history()?;
    for it in items.iter_mut() {
        if it.id == id {
            it.pinned = !it.pinned;
            break;
        }
    }
    trim_unpinned(&mut items);
    save_history(&items)?;
    Ok(items)
}

pub fn clear_history() -> AppResult<()> {
    // 仅清空非置顶；置顶记录保留
    let items = load_history()?;
    let pinned: Vec<_> = items.into_iter().filter(|i| i.pinned).collect();
    save_history(&pinned)
}

pub fn clear_all() -> AppResult<()> {
    save_history(&[])
}

pub fn new_item(
    engine: String,
    target_cli: Option<String>,
    original: String,
    optimized: String,
) -> HistoryItem {
    HistoryItem {
        id: uuid::Uuid::new_v4().to_string(),
        created_at: Utc::now().timestamp_millis(),
        engine,
        target_cli,
        original,
        optimized,
        pinned: false,
    }
}

/// 将非置顶记录裁剪到上限
fn trim_unpinned(items: &mut Vec<HistoryItem>) {
    let mut unpinned_count = 0usize;
    // 从旧到新统计：但这里列表已按 created_at 倒序（新的在前），
    // 所以正向遍历时 unpinned_count 越大说明越靠后（即越旧）
    let mut to_keep = Vec::with_capacity(items.len());
    for it in items.drain(..) {
        if it.pinned {
            to_keep.push(it);
        } else if unpinned_count < MAX_UNPINNED {
            unpinned_count += 1;
            to_keep.push(it);
        }
        // 否则（非置顶 且 已超上限）丢弃
    }
    *items = to_keep;
}
