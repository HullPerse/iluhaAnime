use std::collections::HashSet;

pub const MAX_ALIASES_PER_CHUNK: usize = 25;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BatchMetrics {
    pub alias_count: usize,
    pub query_bytes: usize,
    pub body_bytes: usize,
    pub chunk_count: usize,
}

#[must_use]
pub fn dedup_ids(ids: &[u64]) -> Vec<u64> {
    let mut seen = HashSet::new();
    ids.iter().filter(|id| seen.insert(**id)).copied().collect()
}

#[must_use]
pub fn split_id_chunks(ids: &[u64]) -> Vec<Vec<u64>> {
    split_id_chunks_with_limit(ids, MAX_ALIASES_PER_CHUNK)
}

#[must_use]
pub fn split_id_chunks_with_limit(ids: &[u64], max_aliases: usize) -> Vec<Vec<u64>> {
    let max_aliases = if max_aliases == 0 {
        MAX_ALIASES_PER_CHUNK
    } else {
        max_aliases
    };
    dedup_ids(ids)
        .chunks(max_aliases)
        .map(<[u64]>::to_vec)
        .collect()
}

pub(super) static BATCH_CONCURRENCY: tokio::sync::Semaphore =
    tokio::sync::Semaphore::const_new(super::client::MAX_CONCURRENT_REQUESTS);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AliasBatchOutcome<T> {
    pub values: Vec<T>,
    pub metrics: BatchMetrics,
}

pub async fn execute_alias_batches<T, B, F, Fut, P>(
    ids: &[u64],
    max_aliases: usize,
    build_body: B,
    request_page: F,
    mut parse_alias: P,
) -> Result<AliasBatchOutcome<T>, String>
where
    T: Send,
    B: Fn(&[u64]) -> serde_json::Value,
    F: Fn(serde_json::Value) -> Fut + Send + Sync + 'static,
    Fut: std::future::Future<Output = Result<serde_json::Value, String>> + Send,
    P: FnMut(usize, u64, &serde_json::Value) -> Option<T> + Send,
{
    let chunks = split_id_chunks_with_limit(ids, max_aliases);
    if chunks.is_empty() {
        return Ok(AliasBatchOutcome {
            values: Vec::new(),
            metrics: BatchMetrics {
                alias_count: 0,
                query_bytes: 0,
                body_bytes: 0,
                chunk_count: 0,
            },
        });
    }
    let request_page = std::sync::Arc::new(request_page);
    let mut bodies: Vec<(Vec<u64>, serde_json::Value)> = Vec::new();
    let mut query_bytes = 0usize;
    let mut body_bytes = 0usize;
    for chunk in chunks {
        let body = build_body(&chunk);
        query_bytes += body
            .get("query")
            .and_then(serde_json::Value::as_str)
            .map_or(0, str::len);
        body_bytes += serde_json::to_vec(&body).map_or(0, |bytes| bytes.len());
        bodies.push((chunk, body));
    }
    let chunk_count = bodies.len();
    let mut set = tokio::task::JoinSet::new();
    for (index, (chunk, body)) in bodies.into_iter().enumerate() {
        let request_page = std::sync::Arc::clone(&request_page);
        set.spawn(async move {
            let permit = BATCH_CONCURRENCY
                .acquire()
                .await
                .map_err(|_| "batch semaphore closed".to_string())?;
            let json = request_page(body).await?;
            drop(permit);
            Ok::<_, String>((index, chunk, json))
        });
    }
    let mut ordered: Vec<(usize, Vec<u64>, serde_json::Value)> = Vec::new();
    let mut first_err: Option<String> = None;
    while let Some(joined) = set.join_next().await {
        match joined {
            Ok(Ok(row)) => ordered.push(row),
            Ok(Err(err)) => {
                if first_err.is_none() {
                    first_err = Some(err);
                }
            }
            Err(err) => {
                if first_err.is_none() {
                    first_err = Some(format!("batch task failed: {err}"));
                }
            }
        }
    }
    if let Some(err) = first_err {
        return Err(err);
    }
    ordered.sort_by_key(|(index, _, _)| *index);
    let mut values = Vec::new();
    let mut alias_count = 0usize;
    for (_, chunk, json) in &ordered {
        for (alias_index, id) in chunk.iter().enumerate() {
            alias_count += 1;
            if let Some(value) = parse_alias(alias_index, *id, json) {
                values.push(value);
            }
        }
    }
    let metrics = BatchMetrics {
        alias_count,
        query_bytes,
        body_bytes,
        chunk_count,
    };
    Ok(AliasBatchOutcome { values, metrics })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dedup_keeps_first_order_and_drops_repeats() {
        assert_eq!(dedup_ids(&[3, 1, 3, 2, 1]), vec![3, 1, 2]);
        assert!(dedup_ids(&[]).is_empty());
    }

    #[test]
    fn split_packs_twenty_five_per_chunk() {
        let ids: Vec<u64> = (1..=51).collect();
        let chunks = split_id_chunks(&ids);
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 25);
        assert_eq!(chunks[1].len(), 25);
        assert_eq!(chunks[2], vec![51]);
        assert!(split_id_chunks(&[]).is_empty());
    }

    #[test]
    fn split_dedups_before_chunking() {
        let chunks = split_id_chunks(&[1, 1, 2, 2, 3]);
        assert_eq!(chunks, vec![vec![1, 2, 3]]);
    }

    #[test]
    fn split_with_zero_limit_falls_back_to_default() {
        let ids: Vec<u64> = (1..=30).collect();
        let chunks = split_id_chunks_with_limit(&ids, 0);
        assert_eq!(chunks.len(), 2);
        assert_eq!(chunks[0].len(), 25);
    }

    use std::sync::atomic::{AtomicUsize, Ordering};

    fn fixture_body(chunk: &[u64]) -> serde_json::Value {
        serde_json::json!({ "query": "query { x }", "ids": chunk })
    }

    #[tokio::test]
    async fn executor_merges_chunks_in_order_with_dedup() {
        let mut ids: Vec<u64> = (1..=30).collect();
        ids.extend([1, 2]);
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let calls_in = std::sync::Arc::clone(&calls);
        let outcome = execute_alias_batches(
            &ids,
            0,
            fixture_body,
            move |body| {
                calls_in.fetch_add(1, Ordering::Relaxed);
                let _ = body;
                async { Ok(serde_json::json!({ "data": "ok" })) }
            },
            |index, id, _| Some((id, index)),
        )
        .await
        .expect("batch should succeed");
        assert_eq!(calls.load(Ordering::Relaxed), 2);
        let mut expected: Vec<(u64, usize)> = (1..=25).map(|id| (id, (id - 1) as usize)).collect();
        expected.extend((26..=30).map(|id| (id, (id - 26) as usize)));
        assert_eq!(outcome.values, expected);
        assert_eq!(outcome.metrics.alias_count, 30);
        assert_eq!(outcome.metrics.chunk_count, 2);
        assert!(outcome.metrics.query_bytes > 0);
        assert!(outcome.metrics.body_bytes > 0);
    }

    #[tokio::test]
    async fn executor_skips_missing_alias_without_failing_chunk() {
        let ids: Vec<u64> = (1..=10).collect();
        let outcome = execute_alias_batches(
            &ids,
            0,
            fixture_body,
            |body| {
                let _ = body;
                async { Ok(serde_json::json!({ "data": "ok" })) }
            },
            |_, id, _| if id == 7 { None } else { Some(id) },
        )
        .await
        .expect("batch should succeed");
        assert_eq!(outcome.values.len(), 9);
        assert!(!outcome.values.contains(&7));
        assert_eq!(outcome.metrics.alias_count, 10);
    }

    #[tokio::test]
    async fn executor_returns_empty_outcome_without_requests() {
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let calls_in = std::sync::Arc::clone(&calls);
        let outcome = execute_alias_batches(
            &[],
            0,
            fixture_body,
            move |body| {
                calls_in.fetch_add(1, Ordering::Relaxed);
                let _ = body;
                async { Ok(serde_json::json!({ "data": "ok" })) }
            },
            |_, id, _| Some(id),
        )
        .await
        .expect("empty batch should succeed");
        assert!(outcome.values.is_empty());
        assert_eq!(calls.load(Ordering::Relaxed), 0);
        assert_eq!(outcome.metrics.chunk_count, 0);
    }

    #[tokio::test]
    async fn executor_fails_batch_on_chunk_error() {
        let ids: Vec<u64> = (1..=26).collect();
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let calls_in = std::sync::Arc::clone(&calls);
        let err = execute_alias_batches(
            &ids,
            0,
            fixture_body,
            move |body| {
                calls_in.fetch_add(1, Ordering::Relaxed);
                let fails = body["ids"]
                    .as_array()
                    .is_some_and(|ids| ids.iter().any(|id| id.as_u64() == Some(26)));
                async move {
                    if fails {
                        Err("fixture failure".to_string())
                    } else {
                        Ok(serde_json::json!({ "data": "ok" }))
                    }
                }
            },
            |_, id, _| Some(id),
        )
        .await
        .expect_err("batch should fail");
        assert_eq!(err, "fixture failure");
        assert_eq!(calls.load(Ordering::Relaxed), 2);
    }

    #[tokio::test]
    async fn executor_never_exceeds_three_in_flight() {
        let ids: Vec<u64> = (1..=101).collect();
        let current = std::sync::Arc::new(AtomicUsize::new(0));
        let max_seen = std::sync::Arc::new(AtomicUsize::new(0));
        let current_in = std::sync::Arc::clone(&current);
        let max_in = std::sync::Arc::clone(&max_seen);
        let calls = std::sync::Arc::new(AtomicUsize::new(0));
        let calls_in = std::sync::Arc::clone(&calls);
        let outcome = execute_alias_batches(
            &ids,
            0,
            fixture_body,
            move |body| {
                let _ = body;
                calls_in.fetch_add(1, Ordering::Relaxed);
                let current = std::sync::Arc::clone(&current_in);
                let max_seen = std::sync::Arc::clone(&max_in);
                async move {
                    let now = current.fetch_add(1, Ordering::Relaxed) + 1;
                    max_seen.fetch_max(now, Ordering::Relaxed);
                    tokio::task::yield_now().await;
                    current.fetch_sub(1, Ordering::Relaxed);
                    Ok(serde_json::json!({ "data": "ok" }))
                }
            },
            |_, id, _| Some(id),
        )
        .await
        .expect("batch should succeed");
        assert_eq!(calls.load(Ordering::Relaxed), 5);
        assert_eq!(outcome.values.len(), 101);
        assert!(max_seen.load(Ordering::Relaxed) <= 3);
    }
}
