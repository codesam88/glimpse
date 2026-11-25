use tauri::{Emitter, Manager};

fn canonical_initial_path(arg: &str) -> String {
    // Glimpse opens arbitrary user files; return an absolute, canonicalized
    // path so the fs plugin scope (and any relative-path resolution) matches
    // the location the OS actually operates on.
    std::fs::canonicalize(arg)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| arg.to_string())
}

#[tauri::command]
fn get_initial_path() -> Option<String> {
    std::env::args()
        .skip(1)
        .find(|a| !a.starts_with('-'))
        .map(|a| canonical_initial_path(&a))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if let Some(path) = argv.iter().skip(1).find(|a| !a.starts_with('-')) {
                let _ = app.emit("file-opened", canonical_initial_path(path));
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![get_initial_path])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}