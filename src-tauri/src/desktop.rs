use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Window, WindowEvent,
};

#[derive(Default)]
pub(super) struct QuitState {
    requested: AtomicBool,
    ready: AtomicBool,
    approved: AtomicBool,
}

#[tauri::command]
pub(super) fn request_quit(app: AppHandle) -> Result<(), String> {
    let state = app.state::<QuitState>();
    state.requested.store(true, Ordering::SeqCst);
    if state.ready.load(Ordering::SeqCst) {
        app.emit_to("main", "tier-studio:quit-requested", ())
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub(super) fn quit_ready(app: AppHandle) -> Result<(), String> {
    let state = app.state::<QuitState>();
    state.ready.store(true, Ordering::SeqCst);
    if state.requested.load(Ordering::SeqCst) {
        request_quit(app)?;
    }
    Ok(())
}

#[tauri::command]
pub(super) fn complete_quit(app: AppHandle) {
    app.state::<QuitState>()
        .approved
        .store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
pub(super) fn cancel_quit(app: AppHandle) {
    app.state::<QuitState>()
        .requested
        .store(false, Ordering::SeqCst);
    show_main_window(&app);
}

pub(super) fn on_exit_requested(app: &AppHandle, api: tauri::ExitRequestApi) {
    if !app.state::<QuitState>().approved.load(Ordering::SeqCst) {
        api.prevent_exit();
        if let Err(error) = request_quit(app.clone()) {
            show_main_window(app);
            eprintln!("Could not request a safe quit: {error}");
        }
    }
}

pub(super) fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let result = window
            .show()
            .and_then(|_| window.unminimize())
            .and_then(|_| window.set_focus());
        if let Err(error) = result {
            eprintln!("Could not restore the main window: {error}");
        }
    }
}

pub(super) fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "tray-show", "Show Tier Studio", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "tray-quit", "Quit Tier Studio", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &separator, &quit])?;
    let icon = app
        .default_window_icon()
        .ok_or_else(|| std::io::Error::other("The application icon is missing."))?
        .clone();

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Tier Studio")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "tray-show" => show_main_window(app),
            "tray-quit" => {
                if let Err(error) = request_quit(app.clone()) {
                    show_main_window(app);
                    eprintln!("Could not request a safe quit: {error}");
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

pub(super) fn on_window_event(window: &Window, event: &WindowEvent) {
    if window.label() != "main" {
        return;
    }
    if let WindowEvent::CloseRequested { api, .. } = event {
        match window.hide() {
            Ok(()) => api.prevent_close(),
            Err(error) => eprintln!("Could not hide the main window: {error}"),
        }
    }
}
