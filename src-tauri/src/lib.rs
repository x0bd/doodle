mod archive;
mod codex;
mod import;
mod integrity;
mod logs;
mod commands;
mod mcp;
mod menu;
mod opened;
mod recovery;
mod spell;
mod versions;
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
            opened::take_opened,
            opened::set_recent,
            import::read_import,
            import::read_bytes,
            import::keep_source,
            import::open_kept,
            spell::spell_check,
            spell::spell_guesses,
            recovery::recovery_append,
            recovery::recovery_read,
            recovery::recovery_clear,
            versions::version_save,
            versions::version_index,
            versions::version_read,
            logs::log_event,
            logs::log_path,
            logs::diagnostics_bundle,
            integrity::list_backups,
            integrity::read_backup,
            integrity::set_aside,
            integrity::unused_assets,
            integrity::trash_unused_assets,
            commands::write_text,
            commands::export_pictures,
            commands::ollama_where,
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
            logs::init(app.handle());
            logs::info("app", &format!("Doodle {} starting ({})", app.package_info().version, if cfg!(debug_assertions) { "dev" } else { "release" }));
            opened::from_args();
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
        .build(tauri::generate_context!())
        .expect("error while building doodle")
        .run(|app, event| {
            // a project or an archive opened from the Finder
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                opened::arrived(app, urls.iter().filter_map(|u| u.to_file_path().ok()).collect());
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
