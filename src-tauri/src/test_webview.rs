//! Native test options must reach WebView2 through its API: Runtime 150+ ignores
//! WEBVIEW2_* debugging overrides for elevated hosts such as Windows CI runners.
//! This module is compiled only for Windows debug builds.

use std::{ffi::OsString, path::PathBuf};
use tauri::{
    utils::config::{Config, WindowConfig},
    App, Manager, WebviewWindowBuilder,
};

const PORT_VARIABLE: &str = "TIER_STUDIO_TEST_DEBUG_PORT";
const PROFILE_VARIABLE: &str = "TIER_STUDIO_TEST_PROFILE";
const DEFAULT_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

pub(super) struct TestWebview {
    window: WindowConfig,
    profile: PathBuf,
}

pub(super) fn configure(config: &mut Config) -> Result<Option<TestWebview>, String> {
    apply(
        config,
        std::env::var_os(PORT_VARIABLE),
        std::env::var_os(PROFILE_VARIABLE),
    )
}

fn apply(
    config: &mut Config,
    port: Option<OsString>,
    profile: Option<OsString>,
) -> Result<Option<TestWebview>, String> {
    let (port, profile) = match (port, profile) {
        (None, None) => return Ok(None),
        (Some(port), Some(profile)) => (port, PathBuf::from(profile)),
        _ => return Err(format!("Set both {PORT_VARIABLE} and {PROFILE_VARIABLE}.")),
    };
    let port = port
        .to_str()
        .and_then(|value| value.parse::<u16>().ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| format!("{PORT_VARIABLE} must be a port between 1 and 65535."))?;
    if !profile.is_absolute() {
        return Err(format!("{PROFILE_VARIABLE} must be an absolute path."));
    }
    let window = config
        .app
        .windows
        .iter_mut()
        .find(|window| window.label == "main")
        .ok_or("The native smoke test requires the main window.")?;
    let args = window
        .additional_browser_args
        .get_or_insert_with(|| DEFAULT_ARGS.to_owned());
    args.push_str(&format!(
        " --remote-debugging-address=127.0.0.1 --remote-debugging-port={port}"
    ));
    // Config data_directory accepts relative paths only. Defer this window to
    // setup, where the builder's data_directory API accepts an absolute path.
    window.create = false;
    Ok(Some(TestWebview {
        window: window.clone(),
        profile,
    }))
}

pub(super) fn create_window(app: &mut App) -> tauri::Result<()> {
    let settings = app.state::<Option<TestWebview>>();
    if let Some(settings) = settings.inner().as_ref() {
        WebviewWindowBuilder::from_config(app, &settings.window)?
            .data_directory(settings.profile.clone())
            .build()?;
        eprintln!("Native smoke test: WebView2 API configured with an isolated profile.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        let mut config = Config::default();
        config.app.windows.push(WindowConfig::default());
        config
    }

    #[test]
    fn normal_startup_leaves_webview_options_untouched() {
        let mut config = config();
        assert!(apply(&mut config, None, None).unwrap().is_none());
        assert!(config.app.windows[0].additional_browser_args.is_none());
        assert!(config.app.windows[0].data_directory.is_none());
        assert!(config.app.windows[0].create);
    }

    #[test]
    fn test_startup_sets_loopback_debugging_and_an_isolated_profile() {
        let mut config = config();
        config.app.windows[0].additional_browser_args = Some("--test-existing-option".into());
        let profile = std::env::temp_dir().join("tier-studio-native-unit-test");
        let settings = apply(
            &mut config,
            Some("12345".into()),
            Some(profile.clone().into()),
        )
        .unwrap()
        .unwrap();
        assert_eq!(settings.profile, profile);
        assert!(!config.app.windows[0].create);
        assert!(config.app.windows[0].data_directory.is_none());
        assert_eq!(
            config.app.windows[0].additional_browser_args.as_deref(),
            Some("--test-existing-option --remote-debugging-address=127.0.0.1 --remote-debugging-port=12345")
        );
    }

    #[test]
    fn rejects_incomplete_or_invalid_options_before_changing_the_window() {
        let profile = Some(
            std::env::temp_dir()
                .join("tier-studio-native-unit-test")
                .into(),
        );
        let mut config = config();
        assert!(apply(&mut config, Some("12345".into()), None).is_err());
        assert!(apply(&mut config, None, profile.clone()).is_err());
        for port in ["0", "65536", "-1", "not-a-port"] {
            assert!(apply(&mut config, Some(port.into()), profile.clone()).is_err());
        }
        assert!(apply(
            &mut config,
            Some("12345".into()),
            Some("relative-profile".into())
        )
        .is_err());
        assert!(config.app.windows[0].additional_browser_args.is_none());
        assert!(config.app.windows[0].data_directory.is_none());
    }
}
