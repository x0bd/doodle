//! The menu bar. File, Edit, View, Window, Help — the platform's shape,
//! with Doodle's own items reporting by id ("file.new", "view.zoom-in"…).

use tauri::menu::{Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{App, Manager, Wry};

pub fn build(app: &App) -> tauri::Result<Menu<Wry>> {
    let item = |id: &str, label: &str, key: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, label);
        let b = match key {
            Some(k) => b.accelerator(k),
            None => b,
        };
        b.build(app)
    };

    let doodle = SubmenuBuilder::new(app, "Doodle")
        .about(None)
        .separator()
        .item(&item("app.settings", "Settings…", Some("CmdOrCtrl+Comma"))?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // filled by the page (`opened::set_recent`) with what this machine has opened
    let recent = SubmenuBuilder::with_id(app, "file.recent", "Open Recent")
        .item(&MenuItemBuilder::with_id("recent.clear", "Clear Menu").enabled(false).build(app)?)
        .build()?;
    app.manage(crate::opened::Recent(recent.clone()));

    let file = SubmenuBuilder::new(app, "File")
        .item(&item("file.new", "New Graph", Some("CmdOrCtrl+N"))?)
        .item(&item("file.open", "Open…", Some("CmdOrCtrl+O"))?)
        .item(&recent)
        .separator()
        .item(&item("file.save", "Save", Some("CmdOrCtrl+S"))?)
        .item(&item("file.save-as", "Save As…", Some("CmdOrCtrl+Shift+S"))?)
        .item(&item("file.keep-version", "Keep a Version", Some("Alt+CmdOrCtrl+S"))?)
        .item(&item("file.versions", "Versions…", None)?)
        .separator()
        .item(&item("file.export", "Export as Markdown…", Some("Shift+CmdOrCtrl+E"))?)
        .item(&item("file.archive", "Archive Project…", None)?)
        .item(&item("file.unarchive", "Open Archive…", None)?)
        .separator()
        .item(&item("file.duplicate", "Duplicate Graph", None)?)
        .item(&item("file.reveal", "Reveal in Finder", None)?)
        .item(&item("file.tidy", "Tidy Unused Pictures…", None)?)
        .separator()
        .item(&PredefinedMenuItem::close_window(app, Some("Close Graph"))?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "Edit")
        .item(&item("edit.undo", "Undo", Some("CmdOrCtrl+Z"))?)
        .item(&item("edit.redo", "Redo", Some("Shift+CmdOrCtrl+Z"))?)
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&item("edit.duplicate", "Duplicate", Some("CmdOrCtrl+D"))?)
        .item(&item("edit.delete", "Delete", None)?)
        .separator()
        .item(&item("edit.select-all", "Select All", Some("CmdOrCtrl+A"))?)
        .build()?;

    let graph = SubmenuBuilder::new(app, "Graph")
        .item(&item("graph.run", "Run", Some("CmdOrCtrl+Enter"))?)
        .item(&item("graph.stop", "Stop and Clear Queue", Some("CmdOrCtrl+."))?)
        .build()?;

    let view = SubmenuBuilder::new(app, "View")
        .item(&item("view.search", "Search…", Some("CmdOrCtrl+K"))?)
        .separator()
        .item(&item("view.prev", "Previous", Some("Shift+CmdOrCtrl+BracketLeft"))?)
        .item(&item("view.next", "Next", Some("Shift+CmdOrCtrl+BracketRight"))?)
        .separator()
        .item(&item("view.zoom-in", "Zoom In", Some("CmdOrCtrl+Equal"))?)
        .item(&item("view.zoom-out", "Zoom Out", Some("CmdOrCtrl+Minus"))?)
        .item(&item("view.zoom-fit", "Fit to View", Some("CmdOrCtrl+0"))?)
        .item(&item("view.zoom-100", "Actual Size", Some("CmdOrCtrl+1"))?)
        .separator()
        .item(&item("view.navigator", "Navigator", Some("Alt+CmdOrCtrl+1"))?)
        .item(&item("view.inspector", "Inspector", Some("Alt+CmdOrCtrl+2"))?)
        .item(&item("view.panes", "Hide Panes", None)?)
        .separator()
        .item(&item("view.theme", "Light Appearance", None)?)
        .separator()
        .fullscreen()
        .build()?;

    let window = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    let help = SubmenuBuilder::new(app, "Help")
        .item(&item("help.shortcuts", "Keyboard Shortcuts", Some("CmdOrCtrl+Slash"))?)
        .item(&item("help.site", "Doodle on GitHub", None)?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&doodle, &file, &edit, &graph, &view, &window, &help])
        .build()
}
