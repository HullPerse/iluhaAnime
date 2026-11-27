# Vendored librqbit-dht 9.1.0

Copy of the published 9.1.0 package (rqbit commit
4309d38769ef93f6ee4f01a1ab147009a197fa8f), Apache-2.0. The license omitted
from the crate archive is included from that commit's repository root.

Local U7 patch: Cargo.toml replaces unmaintained chrono with time 0.3.55
(std, serde, formatting, parsing only). src/peer_store.rs stores
OffsetDateTime through the RFC3339 serde adapter and obtains new times in UTC.
No routing, token, peer-selection or persistence-field change.

Old UTC timestamps and nanosecond precision remain readable. The adapter can
normalize redundant fractional trailing zeros while retaining the same instant;
offset-bearing input remains valid RFC3339. tests/dht_persistence.rs in the app
exercises the actual PeerStore serde type through DhtConfig, without sockets or
user-profile access. Cargo.toml.orig remains as published.

Removal condition: upstream DHT drops chrono with compatible persisted data.
When updating, reapply only the time dependency/type/serde/clock changes and run
the app's locked dht_persistence integration test, native torrent tests and audit.
