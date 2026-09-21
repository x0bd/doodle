mod menu;

use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
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
