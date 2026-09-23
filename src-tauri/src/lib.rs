mod archive;
mod codex;
mod commands;
mod mcp;
mod menu;
mod thumbs;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::save_graph,
            commands::load_graph,
            commands::graph_exists,
            commands::save_record,
            commands::load_record,
            commands::duplicate_graph,
            commands::import_asset,
            commands::read_asset,
            commands::write_asset,
            thumbs::read_thumb,
            mcp::mcp_reply,
            commands::write_text,
            archive::export_archive,
            archive::import_archive,
            codex::codex_status,
            codex::codex_text,
            codex::codex_image,
            codex::codex_turn,
            codex::codex_interrupt
        ])
        .manage(codex::CodexState::default())
        .setup(|app| {
            // Doodle's own tools for the agent's turns, on this machine only
            mcp::start(app.handle());
            // The boring things live on the platform's own menu bar. Every
            // item that is Doodle's (not the platform's) reports to the
            // front end by id, and the front end does the work.
            app.set_menu(menu::build(app)?)?;
            app.on_menu_event(|app, event| {
                let _ = app.emit("menu", event.id().0.clone());
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running doodle");
}
