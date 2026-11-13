use std::time::{SystemTime, UNIX_EPOCH};

/// Small deterministic xorshift64* generator. The pack seed is stored at grant
/// time, so the same seed reproduces the same page and variant choices.
#[derive(Debug, Clone)]
pub struct Rng {
    state: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed },
        }
    }

    pub fn next_u64(&mut self) -> u64 {
        let mut value = self.state;
        value ^= value >> 12;
        value ^= value << 25;
        value ^= value >> 27;
        self.state = value;
        value.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Rejection sampling keeps every bucket equally likely. Plain `% bound`
    /// would make the first buckets slightly heavier when the bound does not
    /// divide 2^64 exactly.
    pub fn next_below(&mut self, bound: u64) -> u64 {
        if bound == 0 {
            return 0;
        }
        let zone = u64::MAX - (u64::MAX % bound);
        loop {
            let value = self.next_u64();
            if value < zone {
                return value % bound;
            }
        }
    }

    pub fn shuffle<T>(&mut self, items: &mut [T]) {
        for index in (1..items.len()).rev() {
            let other = self.next_below((index + 1) as u64) as usize;
            items.swap(index, other);
        }
    }
}

/// A fresh seed for a granted pack. Nanoseconds keep two test clicks apart.
pub fn seed_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos() as u64)
        .unwrap_or(0x5EED)
        | 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_replays_the_same_sequence() {
        let mut first = Rng::new(42);
        let mut second = Rng::new(42);
        for _ in 0..32 {
            assert_eq!(first.next_u64(), second.next_u64());
        }
    }

    #[test]
    fn different_seeds_diverge() {
        let mut first = Rng::new(1);
        let mut second = Rng::new(2);
        assert_ne!(first.next_u64(), second.next_u64());
    }

    #[test]
    fn below_stays_inside_the_bound() {
        let mut rng = Rng::new(7);
        for bound in 1..20 {
            for _ in 0..50 {
                assert!(rng.next_below(bound) < bound);
            }
        }
        assert_eq!(rng.next_below(0), 0);
    }

    #[test]
    fn below_does_not_favour_the_first_buckets() {
        let mut rng = Rng::new(2026);
        let mut buckets = [0_u32; 7];
        for _ in 0..70_000 {
            buckets[rng.next_below(7) as usize] += 1;
        }
        for count in buckets {
            assert!((9_000..=11_000).contains(&count), "bucket {count}");
        }
    }

    #[test]
    fn shuffle_keeps_every_item() {
        let mut rng = Rng::new(9);
        let mut items: Vec<u32> = (0..20).collect();
        rng.shuffle(&mut items);
        items.sort_unstable();
        assert_eq!(items, (0..20).collect::<Vec<_>>());
    }

    #[test]
    fn zero_seed_is_replaced() {
        let mut rng = Rng::new(0);
        assert_ne!(rng.next_u64(), 0);
    }
}
