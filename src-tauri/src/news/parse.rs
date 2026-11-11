use std::sync::LazyLock;

use ego_tree::NodeRef;
use scraper::node::Node;
use scraper::{ElementRef, Html, Selector};

use crate::news::models::{
    NewsAttachment, NewsAttachmentKind, NewsBlock, NewsBlockKind, NewsRun,
};

const BLOCK_TAGS: &[&str] = &[
    "div", "p", "section", "article", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6",
];

static ATTACHMENT_SELECTOR: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse("a.b-image, a.video-link").expect("valid news attachment selector")
});
static IMAGE_SELECTOR: LazyLock<Selector> =
    LazyLock::new(|| Selector::parse("img").expect("valid img selector"));

enum Inline {
    Run(NewsRun),
    Break,
}

/// Splits `html_body` into paragraphs and quotes. Unknown tags are unwrapped and their text kept.
pub fn parse_blocks(html: &str) -> Vec<NewsBlock> {
    let document = Html::parse_fragment(html);
    collect_children(document.root_element(), NewsBlockKind::Paragraph)
}

/// Splits `html_footer` into images and videos, preserving document order.
pub fn parse_attachments(html: &str) -> Vec<NewsAttachment> {
    let document = Html::parse_fragment(html);
    let mut attachments = Vec::new();

    for element in document.select(&ATTACHMENT_SELECTOR) {
        let Some(preview_url) = element
            .select(&IMAGE_SELECTOR)
            .next()
            .and_then(|image| image.value().attr("src"))
            .and_then(normalize_url)
        else {
            continue;
        };
        let classes = element.value().classes().collect::<Vec<_>>();

        if classes.contains(&"b-image") {
            attachments.push(NewsAttachment {
                kind: NewsAttachmentKind::Image,
                preview_url,
                full_url: element.value().attr("href").and_then(normalize_url),
                embed_url: None,
                page_url: None,
            });
            continue;
        }

        let embed_url = element.value().attr("data-href").and_then(normalize_url);
        let page_url = element.value().attr("href").and_then(normalize_url);
        let kind = match embed_url.as_deref() {
            Some(url) if url.contains("youtube.com/embed") || url.contains("youtube-nocookie.com/embed") => {
                NewsAttachmentKind::Youtube
            }
            Some(_) => NewsAttachmentKind::Vk,
            None => continue,
        };
        attachments.push(NewsAttachment {
            kind,
            preview_url,
            full_url: None,
            embed_url,
            page_url,
        });
    }

    attachments
}

fn collect_children(parent: ElementRef<'_>, kind: NewsBlockKind) -> Vec<NewsBlock> {
    let mut blocks = Vec::new();
    let mut inline = Vec::new();

    for child in parent.children() {
        if let Node::Element(element) = child.value() {
            match element.name() {
                "script" | "style" => continue,
                "blockquote" => {
                    flush_inline(&mut inline, kind, &mut blocks);
                    let mut quote = Vec::new();
                    collect_inline(child, false, false, None, &mut quote);
                    flush_inline(&mut quote, NewsBlockKind::Quote, &mut blocks);
                    continue;
                }
                _ => {}
            }
        }

        collect_inline(child, false, false, None, &mut inline);
        if is_block(child) {
            flush_inline(&mut inline, kind, &mut blocks);
        }
    }

    flush_inline(&mut inline, kind, &mut blocks);
    blocks
}

fn collect_inline(
    node: NodeRef<'_, Node>,
    bold: bool,
    italic: bool,
    href: Option<&str>,
    out: &mut Vec<Inline>,
) {
    match node.value() {
        Node::Text(text) => push_run(out, &text.text, bold, italic, href),
        Node::Element(element) => match element.name() {
            "br" => out.push(Inline::Break),
            "script" | "style" => {}
            "strong" | "b" => {
                for child in node.children() {
                    collect_inline(child, true, italic, href, out);
                }
            }
            "em" | "i" => {
                for child in node.children() {
                    collect_inline(child, bold, true, href, out);
                }
            }
            "a" => {
                let link = element
                    .attr("href")
                    .filter(|value| value.starts_with("https://") || value.starts_with("http://"));
                for child in node.children() {
                    collect_inline(child, bold, italic, link.or(href), out);
                }
            }
            _ => {
                for child in node.children() {
                    collect_inline(child, bold, italic, href, out);
                }
            }
        },
        _ => {}
    }
}

fn push_run(out: &mut Vec<Inline>, text: &str, bold: bool, italic: bool, href: Option<&str>) {
    if text.is_empty() {
        return;
    }
    let link = href.map(str::to_string);
    if let Some(Inline::Run(last)) = out.last_mut() {
        if last.bold == bold && last.italic == italic && last.href == link {
            last.text.push_str(text);
            return;
        }
    }
    out.push(Inline::Run(NewsRun {
        text: text.to_string(),
        bold,
        italic,
        href: link,
    }));
}

/// A single break joins lines, a blank line (two breaks) starts a new block.
fn flush_inline(inline: &mut Vec<Inline>, kind: NewsBlockKind, blocks: &mut Vec<NewsBlock>) {
    let mut runs: Vec<NewsRun> = Vec::new();
    let mut breaks = 0;

    for item in inline.drain(..) {
        match item {
            Inline::Break => breaks += 1,
            Inline::Run(run) => {
                if breaks >= 2 {
                    push_block(&mut runs, kind, blocks);
                } else if breaks == 1 {
                    if let Some(last) = runs.last_mut() {
                        last.text.push(' ');
                    }
                }
                breaks = 0;
                runs.push(run);
            }
        }
    }

    push_block(&mut runs, kind, blocks);
}

fn push_block(runs: &mut Vec<NewsRun>, kind: NewsBlockKind, blocks: &mut Vec<NewsBlock>) {
    let mut cleaned: Vec<NewsRun> = runs
        .drain(..)
        .filter(|run| !run.text.trim().is_empty() || run.href.is_some())
        .collect();

    if let Some(first) = cleaned.first_mut() {
        first.text = first.text.trim_start().to_string();
    }
    if let Some(last) = cleaned.last_mut() {
        last.text = last.text.trim_end().to_string();
    }
    cleaned.retain(|run| !run.text.is_empty() || run.href.is_some());
    if cleaned.is_empty() {
        return;
    }

    blocks.push(NewsBlock { kind, runs: cleaned });
}

fn is_block(node: NodeRef<'_, Node>) -> bool {
    match node.value() {
        Node::Element(element) => BLOCK_TAGS.contains(&element.name()),
        _ => false,
    }
}

fn normalize_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.starts_with("https://") || trimmed.starts_with("http://") {
        return Some(trimmed.to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("//") {
        return Some(format!("https://{rest}"));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(blocks: &[NewsBlock]) -> Vec<(NewsBlockKind, String)> {
        blocks
            .iter()
            .map(|block| {
                (
                    block.kind,
                    block
                        .runs
                        .iter()
                        .map(|run| run.text.as_str())
                        .collect::<String>(),
                )
            })
            .collect()
    }

    #[test]
    fn splits_paragraphs_on_blank_lines() {
        let html = "Первый<br class=\"br\"><br class=\"br\">Второй";
        let blocks = parse_blocks(html);
        assert_eq!(
            plain(&blocks),
            vec![
                (NewsBlockKind::Paragraph, "Первый".to_string()),
                (NewsBlockKind::Paragraph, "Второй".to_string()),
            ]
        );
    }

    #[test]
    fn keeps_single_breaks_as_spaces() {
        let blocks = parse_blocks("Первая строка<br>вторая");
        assert_eq!(plain(&blocks), vec![(NewsBlockKind::Paragraph, "Первая строка вторая".to_string())]);
    }

    #[test]
    fn marks_bold_italic_and_links() {
        let blocks = parse_blocks(
            "В <strong>Arknights</strong> и <em>Endfield</em> <a href=\"https://shikimori.io/x\">ссылка</a>",
        );
        let runs = &blocks[0].runs;
        let bold = runs
            .iter()
            .find(|run| run.bold)
            .expect("bold run missing");
        assert_eq!(bold.text, "Arknights");
        let italic = runs
            .iter()
            .find(|run| run.italic)
            .expect("italic run missing");
        assert_eq!(italic.text, "Endfield");
        let link = runs
            .iter()
            .find(|run| run.href.is_some())
            .expect("link run missing");
        assert_eq!(link.href.as_deref(), Some("https://shikimori.io/x"));
        assert!(link.text.contains("ссылка"));
    }

    #[test]
    fn drops_non_http_links_but_keeps_text() {
        let blocks = parse_blocks("<a href=\"javascript:alert(1)\">текст</a>");
        assert_eq!(blocks[0].runs[0].text, "текст");
        assert!(blocks[0].runs[0].href.is_none());
    }

    #[test]
    fn turns_blockquotes_into_quote_blocks() {
        let blocks = parse_blocks("До<blockquote>Цитата</blockquote>После");
        assert_eq!(
            plain(&blocks),
            vec![
                (NewsBlockKind::Paragraph, "До".to_string()),
                (NewsBlockKind::Quote, "Цитата".to_string()),
                (NewsBlockKind::Paragraph, "После".to_string()),
            ]
        );
    }

    #[test]
    fn ignores_scripts_and_empty_input() {
        assert!(parse_blocks("<script>alert(1)</script>").is_empty());
        assert!(parse_blocks("").is_empty());
    }

    #[test]
    fn parses_image_and_video_attachments() {
        let footer = "<div class=\"b-shiki_wall\">\
            <a class=\"b-image\" href=\"https://shikimori.io/a.png\"><img src=\"https://shikimori.io/a-preview.png\"></a>\
            <div class=\"b-video vk\"><a class=\"video-link\" data-href=\"https://vkvideo.ru/video_ext.php?oid=-1&amp;id=2\" href=\"https://vk.com/video-1_2\"><img src=\"//iv.okcdn.ru/p.jpg\"></a></div>\
            <div class=\"b-video\"><a class=\"video-link\" data-href=\"https://www.youtube.com/embed/U-M6dQImHrI\" href=\"https://youtu.be/U-M6dQImHrI\"><img src=\"https://img.youtube.com/vi/U-M6dQImHrI/0.jpg\"></a></div>\
            </div>";
        let attachments = parse_attachments(footer);
        assert_eq!(attachments.len(), 3);

        assert_eq!(attachments[0].kind, NewsAttachmentKind::Image);
        assert_eq!(attachments[0].full_url.as_deref(), Some("https://shikimori.io/a.png"));

        assert_eq!(attachments[1].kind, NewsAttachmentKind::Vk);
        assert_eq!(
            attachments[1].embed_url.as_deref(),
            Some("https://vkvideo.ru/video_ext.php?oid=-1&id=2")
        );
        assert_eq!(attachments[1].preview_url, "https://iv.okcdn.ru/p.jpg");

        assert_eq!(attachments[2].kind, NewsAttachmentKind::Youtube);
    }

    #[test]
    fn skips_unknown_attachment_markup() {
        assert!(parse_attachments("").is_empty());
        assert!(parse_attachments("<div class=\"b-image\"></div>").is_empty());
        assert!(
            parse_attachments("<a class=\"video-link\" data-href=\"ftp://x\"><img src=\"https://x/1.png\"></a>")
                .is_empty()
        );
    }
}
