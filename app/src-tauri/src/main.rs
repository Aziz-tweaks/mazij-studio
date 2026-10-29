// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // تطبيقُ Claude أو Codex يشغّلان مزيج بهذه الوسيطة جسرًا لأدواته — بلا نافذة.
    if std::env::args().any(|a| a == "--mcp-stdio") {
        app_lib::link::run_stdio_proxy();
        return;
    }
    app_lib::run()
}
