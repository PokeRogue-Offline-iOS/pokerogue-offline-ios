use std::net::TcpListener;
use tauri::{ipc::CapabilityBuilder, Manager, WebviewUrl, WebviewWindowBuilder};

fn pick_port() -> u16 {
    // Ask the OS for a free TCP port on IPv4. Falls back to a fixed port if
    // binding fails (e.g. in restricted AppImage sandbox environments).
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(45831)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = pick_port();

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .setup(move |app| {
            let url: tauri::Url = format!("http://localhost:{}", port).parse().unwrap();
            app.add_capability(
                CapabilityBuilder::new("localhost")
                    .remote(url.to_string())
                    .window("main"),
            )?;
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
                .title("PokéRogue Offline")
                .inner_size(1280.0, 720.0)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
