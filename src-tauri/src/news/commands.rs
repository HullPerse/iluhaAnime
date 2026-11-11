use crate::news::client;
use crate::news::models::NewsPage;
use crate::scrapers::clients::resolve_proxy;

#[allow(non_snake_case)]
#[tauri::command]
pub async fn news_feed(
    page: u32,
    proxy_url: Option<String>,
    proxyUrl: Option<String>,
) -> Result<NewsPage, String> {
    let proxy = resolve_proxy(proxy_url, proxyUrl);
    client::fetch_page(page, proxy).await
}
