use serde::Serialize;

/// Inline run of article text. Only bold, italic and http(s) links survive normalization.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsRun {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NewsBlockKind {
    Paragraph,
    Quote,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsBlock {
    pub kind: NewsBlockKind,
    pub runs: Vec<NewsRun>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum NewsAttachmentKind {
    Image,
    Youtube,
    Vk,
}

/// Attached media. Images carry preview and full size, videos carry preview, embed and page URLs.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsAttachment {
    pub kind: NewsAttachmentKind,
    pub preview_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embed_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_url: Option<String>,
}

/// Normalized news post: text and attachments only, no author or counters.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsItem {
    pub id: i64,
    pub title: String,
    pub created_at: String,
    pub site_url: String,
    pub blocks: Vec<NewsBlock>,
    pub attachments: Vec<NewsAttachment>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewsPage {
    pub items: Vec<NewsItem>,
    pub page: u32,
    pub has_more: bool,
}
