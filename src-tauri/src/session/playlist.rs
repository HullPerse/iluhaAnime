//! Ready gate (P1): per-peer readiness reports and the host-side summary.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::session::protocol::{ItemReport, MediaPlanItem, PeerInfo};

/// Per-peer readiness input: the guest `ready` flag plus per-item reports.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerReport {
    pub peer_id: String,
    pub items: Vec<ItemReport>,
    pub ready: bool,
}

/// Per-peer readiness verdict.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerReady {
    pub peer_id: String,
    pub ready: bool,
}

/// Host-side summary of peer readiness for a media plan.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadySummary {
    /// True when at least one peer reported and every peer is ready.
    pub all_ready: bool,
    /// Per-peer verdicts.
    pub peers: Vec<PeerReady>,
}

/// A peer is ready when its `ready` flag is set and every plan item is
/// reported as present and verified.
pub fn peer_is_ready(report: &PeerReport, plan_items: &[MediaPlanItem]) -> bool {
    if !report.ready {
        return false;
    }
    plan_items.iter().all(|item| {
        report
            .items
            .iter()
            .find(|entry| entry.item_id == item.item_id)
            .is_some_and(|entry| entry.present && entry.verified)
    })
}

/// Aggregate the roster's readiness flags against the current plan (D4).
///
/// The host's `ready` flag is always true, so a solo host with a non-empty plan
/// opens the gate. The gate stays closed until there is a plan to start and
/// every roster entry is ready.
pub fn roster_ready_summary(plan_items: &[MediaPlanItem], peers: &[PeerInfo]) -> ReadySummary {
    // A peer marked left no longer gates the room; the ready gate ignores it
    // until it reconnects.
    let peers = peers
        .iter()
        .filter(|peer| !peer.left)
        .map(|peer| PeerReady {
            peer_id: peer.peer_id.clone(),
            ready: peer.ready,
        })
        .collect::<Vec<_>>();
    let all_ready =
        !plan_items.is_empty() && !peers.is_empty() && peers.iter().all(|peer| peer.ready);
    ReadySummary { all_ready, peers }
}

/// For each plan item, the peer ids (from `peer_ids`) that have not reported it
/// present. Peer ids are sorted; the host is excluded by the caller.
pub fn missing_by_item(
    plan_items: &[MediaPlanItem],
    peer_ids: &[String],
    reports: &HashMap<String, Vec<ItemReport>>,
) -> HashMap<String, Vec<String>> {
    let mut out = HashMap::new();
    for item in plan_items {
        let mut missing: Vec<String> = peer_ids
            .iter()
            .filter(|peer_id| {
                let present = reports
                    .get(*peer_id)
                    .and_then(|items| items.iter().find(|entry| entry.item_id == item.item_id))
                    .is_some_and(|entry| entry.present);
                !present
            })
            .cloned()
            .collect();
        missing.sort();
        out.insert(item.item_id.clone(), missing);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::protocol::{ConnectionState, MediaIdentity, PeerInfo, Role, SourceInfo};

    fn plan_item(id: &str) -> MediaPlanItem {
        MediaPlanItem {
            item_id: id.into(),
            order: 0,
            title: id.into(),
            identity: MediaIdentity {
                sha256: "0".repeat(64),
                size: 1,
                duration: 1.0,
                video: None,
            },
            sources: Vec::<SourceInfo>::new(),
        }
    }

    fn plan() -> Vec<MediaPlanItem> {
        vec![plan_item("a"), plan_item("b")]
    }

    fn report(peer: &str, ready: bool, items: &[(&str, bool, bool)]) -> PeerReport {
        PeerReport {
            peer_id: peer.into(),
            ready,
            items: items
                .iter()
                .map(|(id, present, verified)| ItemReport {
                    item_id: (*id).into(),
                    present: *present,
                    verified: *verified,
                })
                .collect(),
        }
    }

    #[test]
    fn ready_peer_reports_every_item_present_and_verified() {
        let plan = plan();
        let peer = report("g1", true, &[("a", true, true), ("b", true, true)]);
        assert!(peer_is_ready(&peer, &plan));
    }

    #[test]
    fn self_reported_ready_is_not_enough_on_its_own() {
        let plan = plan();
        assert!(!peer_is_ready(
            &report("g1", false, &[("a", true, true), ("b", true, true)]),
            &plan
        ));
        assert!(!peer_is_ready(
            &report("g1", true, &[("a", true, true), ("b", true, false)]),
            &plan
        ));
        assert!(!peer_is_ready(
            &report("g1", true, &[("a", true, true)]),
            &plan
        ));
        assert!(!peer_is_ready(&report("g1", true, &[]), &plan));
    }

    fn peer(id: &str, ready: bool) -> PeerInfo {
        PeerInfo {
            peer_id: id.into(),
            display_name: id.into(),
            avatar_seed: id.into(),
            anilist_user_id: None,
            role: Role::Viewer,
            connection: ConnectionState::Direct,
            ready,
            drift_ms: 0.0,
            rtt_ms: 0.0,
            buffering: false,
            left: false,
            endpoint_id: format!("end-{id}"),
        }
    }

    #[test]
    fn roster_summary_opens_only_with_a_plan_and_every_peer() {
        let plan = plan();
        // No plan: closed even when everyone is ready.
        assert!(!roster_ready_summary(&[], &[peer("host", true)]).all_ready);
        // Plan but an empty roster: closed.
        assert!(!roster_ready_summary(&plan, &[]).all_ready);
        // Plan and a single ready host: open.
        assert!(roster_ready_summary(&plan, &[peer("host", true)]).all_ready);
        // One peer not ready: closed.
        let summary = roster_ready_summary(&plan, &[peer("host", true), peer("guest", false)]);
        assert!(!summary.all_ready);
        assert_eq!(summary.peers.len(), 2);
        // Everyone ready: open.
        assert!(roster_ready_summary(&plan, &[peer("host", true), peer("guest", true)]).all_ready);
    }

    #[test]
    fn missing_by_item_lists_only_peers_without_the_file() {
        let plan = plan();
        let peer_ids = vec!["g1".to_string(), "g2".to_string(), "g3".to_string()];
        let mut reports = HashMap::new();
        // g1 has both items; g2 has none; g3 has only "a" and never reported it.
        reports.insert(
            "g1".to_string(),
            report("g1", true, &[("a", true, true), ("b", true, true)]).items,
        );
        reports.insert("g2".to_string(), report("g2", false, &[]).items);
        reports.insert(
            "g3".to_string(),
            report("g3", false, &[("a", false, false)]).items,
        );

        let missing = missing_by_item(&plan, &peer_ids, &reports);
        assert_eq!(
            missing.get("a").expect("item a"),
            &vec!["g2".to_string(), "g3".to_string()]
        );
        assert_eq!(
            missing.get("b").expect("item b"),
            &vec!["g2".to_string(), "g3".to_string()]
        );
    }
}
