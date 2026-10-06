//! Crash host election (lobby.md §14.7): deterministic successor over replicated roster.

use crate::session::protocol::{PeerInfo, Role};

/// Host rank exists only for the filter.
const fn rank(role: Role) -> u8 {
    match role {
        Role::Moderator => 0,
        Role::Viewer => 1,
        Role::Host => 2,
    }
}

/// Host and left peers excluded.
pub fn elect_host(roster: &[PeerInfo]) -> Option<String> {
    roster
        .iter()
        .filter(|peer| peer.role != Role::Host && !peer.left)
        .min_by(|a, b| {
            rank(a.role)
                .cmp(&rank(b.role))
                .then_with(|| a.peer_id.cmp(&b.peer_id))
        })
        .map(|peer| peer.peer_id.clone())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CrashAction {
    Wait,
    /// Own endpoint; id already in rosters.
    Promote,
    Follow {
        peer_id: String,
        endpoint_id: String,
    },
}

/// Deterministic per roster; missing/unknown endpoint waits.
pub fn crash_action(host_gone: bool, roster: &[PeerInfo], me: Option<&str>) -> CrashAction {
    if !host_gone {
        return CrashAction::Wait;
    }
    // No Welcome yet = no identity to compare.
    let Some(me) = me else {
        return CrashAction::Wait;
    };
    let Some(winner) = elect_host(roster) else {
        return CrashAction::Wait;
    };
    if winner == me {
        return CrashAction::Promote;
    }
    roster
        .iter()
        .find(|peer| peer.peer_id == winner && !peer.endpoint_id.is_empty())
        .map_or(CrashAction::Wait, |peer| CrashAction::Follow {
            peer_id: peer.peer_id.clone(),
            endpoint_id: peer.endpoint_id.clone(),
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::protocol::{ConnectionState, PeerInfo, Role};

    fn peer(id: &str, role: Role) -> PeerInfo {
        PeerInfo {
            peer_id: id.into(),
            display_name: id.into(),
            avatar_seed: id.into(),
            anilist_user_id: None,
            role,
            connection: ConnectionState::Direct,
            ready: true,
            drift_ms: 0.0,
            rtt_ms: 0.0,
            buffering: false,
            left: false,
            endpoint_id: format!("end-{id}"),
        }
    }

    #[test]
    fn empty_and_host_only_rosters_have_no_successor() {
        assert_eq!(elect_host(&[]), None);
        assert_eq!(elect_host(&[peer("host", Role::Host)]), None);
    }

    #[test]
    fn a_moderator_beats_viewers_regardless_of_id() {
        let roster = vec![
            peer("host", Role::Host),
            peer("aaa", Role::Viewer),
            peer("zzz", Role::Moderator),
        ];
        assert_eq!(elect_host(&roster).as_deref(), Some("zzz"));
    }

    #[test]
    fn ties_break_by_lexicographic_peer_id() {
        let roster = vec![
            peer("host", Role::Host),
            peer("bbb", Role::Viewer),
            peer("aaa", Role::Viewer),
            peer("ccc", Role::Viewer),
        ];
        assert_eq!(elect_host(&roster).as_deref(), Some("aaa"));
    }

    #[test]
    fn a_left_peer_is_not_a_candidate() {
        let mut gone = peer("aaa", Role::Moderator);
        gone.left = true;
        let roster = vec![peer("host", Role::Host), gone, peer("bbb", Role::Viewer)];
        assert_eq!(elect_host(&roster).as_deref(), Some("bbb"));
    }

    #[test]
    fn the_choice_is_idempotent_and_independent_of_roster_order() {
        let roster = vec![
            peer("host", Role::Host),
            peer("m1", Role::Moderator),
            peer("v1", Role::Viewer),
            peer("m0", Role::Moderator),
        ];
        let first = elect_host(&roster);
        assert_eq!(first.as_deref(), Some("m0"));
        assert_eq!(elect_host(&roster), first);

        let reversed: Vec<PeerInfo> = roster.iter().rev().cloned().collect();
        assert_eq!(elect_host(&reversed), first);
    }

    #[test]
    fn crash_action_waits_while_the_host_is_alive() {
        let roster = vec![peer("host", Role::Host), peer("v1", Role::Viewer)];
        assert_eq!(crash_action(false, &roster, Some("v1")), CrashAction::Wait);
    }

    #[test]
    fn crash_action_waits_without_an_identity_or_successor() {
        let roster = vec![peer("host", Role::Host), peer("v1", Role::Viewer)];
        assert_eq!(crash_action(true, &roster, None), CrashAction::Wait);
        let host_only = vec![peer("host", Role::Host)];
        assert_eq!(
            crash_action(true, &host_only, Some("v1")),
            CrashAction::Wait
        );
    }

    #[test]
    fn crash_action_promotes_the_elected_peer() {
        let roster = vec![
            peer("host", Role::Host),
            peer("winner", Role::Moderator),
            peer("v1", Role::Viewer),
        ];
        assert_eq!(
            crash_action(true, &roster, Some("winner")),
            CrashAction::Promote
        );
        assert_eq!(
            crash_action(true, &roster, Some("v1")),
            CrashAction::Follow {
                peer_id: "winner".into(),
                endpoint_id: "end-winner".into(),
            }
        );
    }

    #[test]
    fn crash_action_waits_when_the_successor_endpoint_is_unknown() {
        let mut winner = peer("aaa", Role::Viewer);
        winner.endpoint_id = String::new();
        let roster = vec![peer("host", Role::Host), winner, peer("zzz", Role::Viewer)];
        assert_eq!(crash_action(true, &roster, Some("zzz")), CrashAction::Wait);
    }

    #[test]
    fn crash_action_is_identical_for_every_peer() {
        let roster = vec![
            peer("host", Role::Host),
            peer("m1", Role::Moderator),
            peer("m0", Role::Moderator),
        ];
        assert_eq!(
            crash_action(true, &roster, Some("m0")),
            CrashAction::Promote
        );
        assert_eq!(
            crash_action(true, &roster, Some("m1")),
            CrashAction::Follow {
                peer_id: "m0".into(),
                endpoint_id: "end-m0".into(),
            }
        );
    }
}
