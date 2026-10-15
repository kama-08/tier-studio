#[cfg(desktop)]
mod desktop;
#[cfg(all(windows, debug_assertions))]
mod test_webview;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(all(windows, debug_assertions))]
    test_webview::trace("entered the app runtime");
    let builder = tauri::Builder::default();
    let context = tauri::generate_context!();
    #[cfg(all(windows, debug_assertions))]
    let (context, builder) = {
        let mut context = context;
        let test_window = test_webview::configure(context.config_mut())
            .expect("Invalid native smoke-test configuration");
        (context, builder.manage(test_window))
    };

    // This must run before other plugins or windows are initialized.
    #[cfg(desktop)]
    let builder = builder
        .manage(desktop::QuitState::default())
        .invoke_handler(tauri::generate_handler![
            desktop::request_quit,
            desktop::quit_ready,
            desktop::complete_quit,
            desktop::cancel_quit
        ])
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            desktop::show_main_window(app);
        }))
        .setup(|app| {
            #[cfg(all(windows, debug_assertions))]
            test_webview::trace("entered the setup hook");
            #[cfg(all(windows, debug_assertions))]
            test_webview::create_window(app)?;
            desktop::setup(app)
        })
        .on_window_event(desktop::on_window_event);

    let app = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .build(context)
        .expect("Could not start Tier Studio");
    #[cfg(all(windows, debug_assertions))]
    test_webview::trace("built the app; starting its event loop");

    app.run(|_app, _event| {
        match _event {
            #[cfg(desktop)]
            tauri::RunEvent::ExitRequested { api, .. } => desktop::on_exit_requested(_app, api),
            // Clicking the Dock icon reopens the hidden window on macOS.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => desktop::show_main_window(_app),
            _ => {}
        }
    });
}
