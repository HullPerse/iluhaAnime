use tauri::WebviewWindow;
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3;
use windows_core::Interface;

pub(super) async fn resume(window: &WebviewWindow) -> Result<(), String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |platform| {
            // SAFETY: Tauri runs this closure on the live controller's UI thread.
            let result = unsafe {
                let controller = platform.controller();
                (|| -> windows_core::Result<()> {
                    controller.SetIsVisible(true)?;
                    let core: ICoreWebView2_3 = controller.CoreWebView2()?.cast()?;
                    core.Resume()
                })()
            };
            let _ = sender.send(result.map_err(|error| error.to_string()));
        })
        .map_err(|error| error.to_string())?;
    receiver.await.map_err(|error| error.to_string())?
}

pub(super) async fn suspend(window: &WebviewWindow) -> Result<bool, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window
        .with_webview(move |platform| {
            let controller = platform.controller();
            // SAFETY: the controller and queried interface belong to this UI thread.
            let prepared = unsafe {
                (|| -> windows_core::Result<ICoreWebView2_3> {
                    let core = controller.CoreWebView2()?.cast()?;
                    controller.SetIsVisible(false)?;
                    Ok(core)
                })()
            };
            let core = match prepared {
                Ok(core) => core,
                Err(error) => {
                    let _ = sender.send(Err(error.to_string()));
                    return;
                }
            };
            let completion_controller = controller.clone();
            let completion_core = core.clone();
            let handler = webview2_com::TrySuspendCompletedHandler::create(Box::new(
                move |result, suspended| {
                    // SAFETY: completion runs on the controller's UI thread. A timed-out
                    // attempt may already have been resumed; never suspend a shown view.
                    unsafe {
                        let mut visible = windows_core::BOOL::default();
                        if completion_controller.IsVisible(&raw mut visible).is_ok()
                            && visible.as_bool()
                        {
                            let _ = completion_core.Resume();
                        } else if result.is_err() || !suspended {
                            let _ = completion_controller.SetIsVisible(true);
                        }
                    }
                    let _ = sender.send(result.map(|()| suspended).map_err(|e| e.to_string()));
                    Ok(())
                },
            ));
            // SAFETY: WebView2 retains the completion handler until the request completes.
            if let Err(error) = unsafe { core.TrySuspend(&handler) } {
                // SAFETY: restore controller visibility on the same UI thread after failure.
                unsafe {
                    let _ = controller.SetIsVisible(true);
                }
                tracing::debug!("player WebView2 suspend request failed: {error}");
            }
        })
        .map_err(|error| error.to_string())?;
    let outcome = tokio::time::timeout(std::time::Duration::from_secs(5), receiver)
        .await
        .map_err(|_| "player WebView2 suspend timed out".to_string())
        .and_then(|result| result.map_err(|error| error.to_string()))
        .and_then(std::convert::identity);
    if outcome.is_err() {
        resume(window).await?;
    }
    outcome
}
