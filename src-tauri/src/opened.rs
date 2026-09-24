//! What the Finder hands Doodle: a project double-clicked, an archive
//! dropped on the Dock icon, *Open With* — and a manuscript, which the page
//! imports into chapters. The platform says so through the
//! app delegate (`RunEvent::Opened`) — often before the page is listening,
//! at launch — so the paths wait here until the page takes them; the `opened`
//! event only tells it there is something to take.
//!
//! And the platform's own *File › Open Recent*, fed by the page's list of
//! what this machine has opened.

use std::path::PathBuf;
use std::sync::Mutex;

use tauri::menu::{MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Wry};

static WAITING: Mutex<Vec<String>> = Mutex::new(Vec::new());

/// a project, an archive, or a manuscript to import, by its name
fn ours(p: &PathBuf) -> bool {
    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    matches!(ext.as_str(), "doodle" | "doodlebox" | "md" | "markdown" | "mdown" | "txt" | "text" | "fountain" | "spmd" | "docx" | "pdf")
}

pub fn arrived(app: &AppHandle, paths: Vec<PathBuf>) {
    let mine: Vec<String> = paths.into_iter().filter(ours).map(|p| p.to_string_lossy().into_owned()).collect();
    if mine.is_empty() {
        return;
    }
    WAITING.lock().unwrap().extend(mine);
    let _ = app.emit("opened", ());
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// A project or an archive named on the command line
/// (`Doodle.app/Contents/MacOS/doodle ~/Books/Mara.doodle`, or
/// `pnpm tauri dev -- -- <path>`) arrives the way the Finder's would.
/// With `DOODLE_GATHER=1`, the documents and pictures named with it are
/// laid on the book's board instead (`gather:` before each) — how a drop on
/// a board is tried without the Finder.
pub fn from_args() {
    let gather = std::env::var_os("DOODLE_GATHER").is_some();
    let picture = |p: &PathBuf| matches!(p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(), Some("png" | "jpg" | "jpeg" | "webp" | "gif" | "heic" | "heif" | "tif" | "tiff"));
    let mine: Vec<String> = std::env::args()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| ours(p) || (gather && picture(p)))
        .map(|p| {
            let s = p.to_string_lossy().into_owned();
            let project = matches!(p.extension().and_then(|e| e.to_str()), Some("doodle") | Some("doodlebox"));
            if gather && !project { format!("gather:{s}") } else { s }
        })
        .collect();
    WAITING.lock().unwrap().extend(mine);
}

/// what the Finder has handed over since the page last asked
#[tauri::command]
pub fn take_opened() -> Vec<String> {
    std::mem::take(&mut *WAITING.lock().unwrap())
}

/// File › Open Recent, which the menu builds empty and the page fills
pub struct Recent(pub Submenu<Wry>);

/// The page's list, by name and newest first, as the menu's rows:
/// `recent.<n>` opens the page's n-th, `recent.clear` forgets them all.
#[tauri::command]
pub fn set_recent(app: AppHandle, names: Vec<String>) -> Result<(), String> {
    let Some(menu) = app.try_state::<Recent>() else { return Ok(()) };
    let menu = &menu.0;
    for old in menu.items().map_err(|e| e.to_string())? {
        let _ = menu.remove(&old);
    }
    for (i, name) in names.iter().enumerate() {
        let row = MenuItemBuilder::with_id(format!("recent.{i}"), name).build(&app).map_err(|e| e.to_string())?;
        menu.append(&row).map_err(|e| e.to_string())?;
    }
    if !names.is_empty() {
        menu.append(&PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    }
    let clear = MenuItemBuilder::with_id("recent.clear", "Clear Menu").enabled(!names.is_empty()).build(&app).map_err(|e| e.to_string())?;
    menu.append(&clear).map_err(|e| e.to_string())?;
    Ok(())
}
