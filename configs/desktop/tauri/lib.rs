use tauri::{ipc::CapabilityBuilder, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = portpicker::pick_unused_port().unwrap_or(45831);

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
                .decorations(false)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
