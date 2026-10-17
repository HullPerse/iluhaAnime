//! CHIP-8 / SUPER-CHIP interpreter core.
//!
//! Pure `no_std`-style logic with no Tauri dependencies so it can be unit
//! tested and benchmarked directly. The frontend drives execution: every
//! animation frame it asks for N cycles and receives a packed framebuffer,
//! so a closed tab costs zero CPU.

pub const MEMORY_SIZE: usize = 4096;
pub const PROGRAM_START: u16 = 0x200;
pub const FONT_START: u16 = 0x050;
pub const BIG_FONT_START: u16 = 0x0A0;
pub const MAX_PROGRAM_BYTES: usize = MEMORY_SIZE - PROGRAM_START as usize;
pub const LOW_COLS: usize = 64;
pub const LOW_ROWS: usize = 32;
pub const HIGH_COLS: usize = 128;
pub const HIGH_ROWS: usize = 64;
pub const FLAG_REGISTERS: usize = 16;

/// Per-program interpretation switches. The defaults below match the three
/// commonly cited reference profiles; per-ROM store metadata can override
/// individual flags later.
#[allow(clippy::struct_excessive_bools)] // independent switches, not foldable state
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Quirks {
    /// 8XY6/8XYE take the source from VX (SUPER-CHIP). When false the source
    /// is VY, as on the original CHIP-8.
    pub shift_uses_vx: bool,
    /// FX55/FX65 increment I (original CHIP-8).
    pub load_store_increment: bool,
    /// BNNN jumps to NNN + V0 (original CHIP-8 and SUPER-CHIP 1.0). When
    /// false it adds VX, where X is the highest nibble of NNN.
    pub jump_v0: bool,
    /// Clip sprites at the screen edge instead of wrapping around. Real
    /// hardware clips; many modern interpreters wrap by default.
    pub clip: bool,
    /// 8XY1/8XY2/8XY3 reset VF to 0 (original CHIP-8).
    pub logic_resets_vf: bool,
}

impl Quirks {
    /// COSMAC VIP, matching the Timendus conformance suite's CHIP-8 column:
    /// shifts read VY, sprites clip at the screen edge, FX55/FX65 increment
    /// I, BNNN adds V0 and logic ops reset VF.
    pub const CHIP8: Self = Self {
        shift_uses_vx: false,
        load_store_increment: true,
        jump_v0: true,
        clip: true,
        logic_resets_vf: true,
    };

    /// SUPER-CHIP 1.0 on the HP48: shifts operate on VX in place, I stays
    /// put, sprites clip. BNNN keeps the VIP V0 behaviour here; the
    /// conformance suite only records the 1.1 form of the jump quirk, so
    /// `schip11` is the closer match for its SUPER-CHIP column.
    pub const SUPER_CHIP_10: Self = Self {
        shift_uses_vx: true,
        load_store_increment: false,
        jump_v0: true,
        clip: true,
        logic_resets_vf: false,
    };

    /// SUPER-CHIP 1.1 on the HP48: like 1.0, but BNNN adds VX where X is the
    /// highest nibble of NNN.
    pub const SUPER_CHIP_11: Self = Self {
        shift_uses_vx: true,
        load_store_increment: false,
        jump_v0: false,
        clip: true,
        logic_resets_vf: false,
    };

    #[must_use]
    pub fn for_platform(platform: &str) -> Self {
        match platform {
            "schip" | "schip10" => Self::SUPER_CHIP_10,
            "schip11" => Self::SUPER_CHIP_11,
            _ => Self::CHIP8,
        }
    }
}

/// A pending `FX0A`: execution is suspended until the latched key is released.
///
/// The first key that goes down while the wait is pending supplies the value,
/// even when it was already held when `FX0A` ran; the press alone never
/// resumes execution. This matches the reference behaviour the Timendus
/// conformance suite checks: pressing and holding a key must not let the
/// instruction return.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct KeyWait {
    /// Register that receives the key code on release.
    pub register: u8,
    /// The key whose release completes the wait; `None` while no key is down.
    pub key: Option<u8>,
}

const FONT: [u8; 80] = [
    0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
    0x20, 0x60, 0x20, 0x20, 0x70, // 1
    0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
    0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
    0x90, 0x90, 0xF0, 0x10, 0x10, // 4
    0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
    0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
    0xF0, 0x10, 0x20, 0x40, 0x40, // 7
    0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
    0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
    0xF0, 0x90, 0xF0, 0x90, 0x90, // A
    0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
    0xF0, 0x80, 0x80, 0x80, 0xF0, // C
    0xE0, 0x90, 0x90, 0x90, 0xE0, // D
    0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
    0xF0, 0x80, 0xF0, 0x80, 0x80, // F
];

const BIG_FONT: [u8; 160] = [
    0x3C, 0x7E, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0x7E, 0x3C, // 0
    0x18, 0x38, 0x58, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x3C, // 1
    0x3E, 0x7F, 0xC3, 0x06, 0x0C, 0x18, 0x30, 0x60, 0xFF, 0xFF, // 2
    0x3C, 0x7E, 0xC3, 0x03, 0x0E, 0x0E, 0x03, 0xC3, 0x7E, 0x3C, // 3
    0x06, 0x0E, 0x1E, 0x36, 0x66, 0xC6, 0xFF, 0xFF, 0x06, 0x06, // 4
    0xFF, 0xFF, 0xC0, 0xC0, 0xFC, 0xFE, 0x03, 0xC3, 0x7E, 0x3C, // 5
    0x3E, 0x7C, 0xC0, 0xC0, 0xFC, 0xFE, 0xC3, 0xC3, 0x7E, 0x3C, // 6
    0xFF, 0xFF, 0x03, 0x06, 0x0C, 0x18, 0x30, 0x60, 0x60, 0x60, // 7
    0x3C, 0x7E, 0xC3, 0xC3, 0x7E, 0x7E, 0xC3, 0xC3, 0x7E, 0x3C, // 8
    0x3C, 0x7E, 0xC3, 0xC3, 0x7F, 0x3F, 0x03, 0x03, 0x3E, 0x7C, // 9
    0x18, 0x3C, 0x66, 0xC3, 0xC3, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, // A
    0xFC, 0xFE, 0xC3, 0xC3, 0xFE, 0xFE, 0xC3, 0xC3, 0xFE, 0xFC, // B
    0x3C, 0x7E, 0xC3, 0xC0, 0xC0, 0xC0, 0xC0, 0xC3, 0x7E, 0x3C, // C
    0xFC, 0xFE, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFE, 0xFC, // D
    0xFF, 0xFF, 0xC0, 0xC0, 0xFC, 0xFC, 0xC0, 0xC0, 0xFF, 0xFF, // E
    0xFF, 0xFF, 0xC0, 0xC0, 0xFC, 0xFC, 0xC0, 0xC0, 0xC0, 0xC0, // F
];

pub struct Chip8 {
    pub memory: [u8; MEMORY_SIZE],
    pub v: [u8; 16],
    pub i: u16,
    pub pc: u16,
    stack: [u16; 16],
    sp: usize,
    pub delay_timer: u8,
    pub sound_timer: u8,
    /// Bit-packed framebuffer: row `y` lives in words `y * 2` and `y * 2 + 1`,
    /// pixel `x` is bit `63 - x % 64` of word `y * 2 + x / 64`.
    fb: [u64; 128],
    pub keys: [bool; 16],
    pub quirks: Quirks,
    pub hires: bool,
    /// Pending FX0A; ticks are skipped until the key it latches is released.
    pub waiting_key: Option<KeyWait>,
    /// Program executed 00FD (SUPER-CHIP exit).
    pub halted: bool,
    /// A draw, clear, or scroll happened since the last frame read.
    pub dirty: bool,
    cycle_count: u64,
    rng: u64,
    /// RPL-style flags (FX75/FX85) kept per session.
    flags: [u8; FLAG_REGISTERS],
}

impl Chip8 {
    #[must_use]
    pub fn new(quirks: Quirks) -> Self {
        Self::with_seed(quirks, 0x9E37_79B9_7F4A_7C15)
    }

    #[must_use]
    pub fn with_seed(quirks: Quirks, seed: u64) -> Self {
        let mut vm = Self {
            memory: [0; MEMORY_SIZE],
            v: [0; 16],
            i: 0,
            pc: PROGRAM_START,
            stack: [0; 16],
            sp: 0,
            delay_timer: 0,
            sound_timer: 0,
            fb: [0; 128],
            keys: [false; 16],
            quirks,
            hires: false,
            waiting_key: None,
            halted: false,
            dirty: true,
            cycle_count: 0,
            rng: seed | 1,
            flags: [0; FLAG_REGISTERS],
        };
        vm.memory[FONT_START as usize..FONT_START as usize + FONT.len()].copy_from_slice(&FONT);
        vm.memory[BIG_FONT_START as usize..BIG_FONT_START as usize + BIG_FONT.len()]
            .copy_from_slice(&BIG_FONT);
        vm
    }

    /// Loads a program at `PROGRAM_START` and resets the execution state.
    ///
    /// # Errors
    ///
    /// Returns an error when the ROM is empty or larger than
    /// `MAX_PROGRAM_BYTES` (the room between `PROGRAM_START` and the end of
    /// memory).
    pub fn load(&mut self, rom: &[u8]) -> Result<(), String> {
        if rom.is_empty() {
            return Err("the ROM file is empty".to_string());
        }
        if rom.len() > MAX_PROGRAM_BYTES {
            return Err(format!(
                "the ROM is {} bytes, the CHIP-8 address space fits {MAX_PROGRAM_BYTES}",
                rom.len()
            ));
        }
        self.reset();
        self.memory[PROGRAM_START as usize..PROGRAM_START as usize + rom.len()]
            .copy_from_slice(rom);
        Ok(())
    }

    pub const fn reset(&mut self) {
        self.v = [0; 16];
        self.i = 0;
        self.pc = PROGRAM_START;
        self.sp = 0;
        self.delay_timer = 0;
        self.sound_timer = 0;
        self.fb = [0; 128];
        self.keys = [false; 16];
        self.hires = false;
        self.waiting_key = None;
        self.halted = false;
        self.dirty = true;
        self.cycle_count = 0;
    }

    #[must_use]
    pub const fn cols(&self) -> usize {
        if self.hires {
            HIGH_COLS
        } else {
            LOW_COLS
        }
    }

    #[must_use]
    pub const fn rows(&self) -> usize {
        if self.hires {
            HIGH_ROWS
        } else {
            LOW_ROWS
        }
    }

    #[must_use]
    pub const fn frame_len(&self) -> usize {
        self.rows() * self.cols() / 8
    }

    /// Packs the framebuffer the way the frontend expects it: one bit per
    /// pixel, rows top to bottom, most significant bit leftmost.
    pub fn pack_frame(&self, out: &mut Vec<u8>) {
        out.clear();
        let words_per_row = self.cols() / 64;
        out.reserve(self.rows() * words_per_row * 8);
        for row in 0..self.rows() {
            for word in 0..words_per_row {
                let bits = self.fb[row * 2 + word];
                for shift in 0..8 {
                    out.push(((bits >> (56 - shift * 8)) & 0xFF) as u8);
                }
            }
        }
    }

    #[must_use]
    pub const fn pixel(&self, x: usize, y: usize) -> bool {
        if x >= self.cols() || y >= self.rows() {
            return false;
        }
        let word = self.fb[y * 2 + x / 64];
        word & (1u64 << (63 - x % 64)) != 0
    }

    pub const fn set_pixel(&mut self, x: usize, y: usize) {
        if x >= self.cols() || y >= self.rows() {
            return;
        }
        self.fb[y * 2 + x / 64] |= 1u64 << (63 - x % 64);
        self.dirty = true;
    }

    pub const fn clear_display(&mut self) {
        self.fb = [0; 128];
        self.dirty = true;
    }

    pub fn scroll_down(&mut self, rows: usize) {
        let rows = rows.min(self.rows());
        for y in (0..self.rows()).rev() {
            if y >= rows {
                let (from_lo, from_hi) = (self.fb[(y - rows) * 2], self.fb[(y - rows) * 2 + 1]);
                self.fb[y * 2] = from_lo;
                self.fb[y * 2 + 1] = from_hi;
            } else {
                self.fb[y * 2] = 0;
                self.fb[y * 2 + 1] = 0;
            }
        }
        self.dirty = true;
    }

    pub fn scroll_left(&mut self) {
        let words = self.cols() / 64;
        for y in 0..self.rows() {
            if words == 2 {
                let value = (u128::from(self.fb[y * 2]) << 64) | u128::from(self.fb[y * 2 + 1]);
                let shifted = value << 4;
                self.fb[y * 2] = (shifted >> 64) as u64;
                self.fb[y * 2 + 1] = shifted as u64;
            } else {
                self.fb[y * 2] <<= 4;
            }
        }
        self.dirty = true;
    }

    pub fn scroll_right(&mut self) {
        let words = self.cols() / 64;
        for y in 0..self.rows() {
            if words == 2 {
                let value = (u128::from(self.fb[y * 2]) << 64) | u128::from(self.fb[y * 2 + 1]);
                let shifted = value >> 4;
                self.fb[y * 2] = (shifted >> 64) as u64;
                self.fb[y * 2 + 1] = shifted as u64;
            } else {
                self.fb[y * 2] >>= 4;
            }
        }
        self.dirty = true;
    }

    pub fn set_key(&mut self, key: u8, pressed: bool) {
        if key >= 16 {
            return;
        }
        self.keys[key as usize] = pressed;
        let Some(wait) = self.waiting_key else {
            return;
        };
        if pressed {
            // The first key that goes down while FX0A is pending supplies the
            // value, even one that was already held; the press alone resumes
            // nothing.
            if wait.key.is_none() {
                self.waiting_key = Some(KeyWait {
                    key: Some(key),
                    ..wait
                });
            }
        } else if wait.key == Some(key) {
            // Releasing the latched key completes the instruction.
            self.v[wait.register as usize] = key;
            self.waiting_key = None;
        }
    }

    pub fn tick_timers(&mut self, ticks: u32) {
        self.delay_timer = self.delay_timer.saturating_sub(ticks.min(255) as u8);
        self.sound_timer = self.sound_timer.saturating_sub(ticks.min(255) as u8);
    }

    #[must_use]
    pub const fn sound_active(&self) -> bool {
        self.sound_timer > 0
    }

    #[must_use]
    pub const fn waiting_for_key(&self) -> bool {
        self.waiting_key.is_some()
    }

    #[must_use]
    pub const fn cycles(&self) -> u64 {
        self.cycle_count
    }

    /// Executes a single instruction.
    pub fn tick(&mut self) {
        if self.halted || self.waiting_key.is_some() {
            return;
        }
        self.cycle_count += 1;
        let pc = self.pc;
        let slot = pc as usize & (MEMORY_SIZE - 1);
        let opcode = u16::from_be_bytes([
            self.memory[slot],
            self.memory[(pc as usize + 1) & (MEMORY_SIZE - 1)],
        ]);
        self.pc = pc.wrapping_add(2);
        self.execute(opcode, pc);
    }

    const fn rng_next(&mut self) -> u8 {
        let mut x = self.rng;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.rng = x;
        (x >> 33) as u8
    }

    const fn memory_at(&self, address: u16) -> u8 {
        self.memory[(address as usize) & (MEMORY_SIZE - 1)]
    }

    fn execute(&mut self, opcode: u16, pc: u16) {
        let x = ((opcode >> 8) & 0x0F) as usize;
        let y = ((opcode >> 4) & 0x0F) as usize;
        let n = (opcode & 0x0F) as u8;
        let nn = (opcode & 0xFF) as u8;
        let nnn = opcode & 0x0FFF;

        match opcode >> 12 {
            0x0 => match opcode {
                // A machine call of zero means "stop" for Octo programs.
                0x0000 => self.halted = true,
                0x00E0 => self.clear_display(),
                0x00EE => {
                    if self.sp > 0 {
                        self.sp -= 1;
                        self.pc = self.stack[self.sp];
                    }
                }
                0x00FB => self.scroll_right(),
                0x00FC => self.scroll_left(),
                0x00FD => self.halted = true,
                0x00FE => {
                    self.hires = false;
                    self.clear_display();
                }
                0x00FF => {
                    self.hires = true;
                    self.clear_display();
                }
                _ if opcode & 0x00F0 == 0x00C0 => self.scroll_down(n as usize),
                // 0NNN (machine code call) is ignored on every modern host.
                _ => {}
            },
            0x1 => self.pc = nnn,
            0x2 => {
                if self.sp < self.stack.len() {
                    self.stack[self.sp] = pc.wrapping_add(2);
                    self.sp += 1;
                    self.pc = nnn;
                }
            }
            0x3 => {
                if self.v[x] == nn {
                    self.pc = self.pc.wrapping_add(2);
                }
            }
            0x4 => {
                if self.v[x] != nn {
                    self.pc = self.pc.wrapping_add(2);
                }
            }
            0x5 => {
                if self.v[x] == self.v[y] {
                    self.pc = self.pc.wrapping_add(2);
                }
            }
            0x6 => self.v[x] = nn,
            0x7 => self.v[x] = self.v[x].wrapping_add(nn),
            0x8 => match n {
                0x0 => self.v[x] = self.v[y],
                0x1 => {
                    self.v[x] |= self.v[y];
                    if self.quirks.logic_resets_vf {
                        self.v[0xF] = 0;
                    }
                }
                0x2 => {
                    self.v[x] &= self.v[y];
                    if self.quirks.logic_resets_vf {
                        self.v[0xF] = 0;
                    }
                }
                0x3 => {
                    self.v[x] ^= self.v[y];
                    if self.quirks.logic_resets_vf {
                        self.v[0xF] = 0;
                    }
                }
                0x4 => {
                    let (result, carry) = self.v[x].overflowing_add(self.v[y]);
                    self.v[x] = result;
                    self.v[0xF] = u8::from(carry);
                }
                0x5 => {
                    let (result, borrow) = self.v[x].overflowing_sub(self.v[y]);
                    self.v[x] = result;
                    self.v[0xF] = u8::from(!borrow);
                }
                0x6 => {
                    let source = if self.quirks.shift_uses_vx {
                        self.v[x]
                    } else {
                        self.v[y]
                    };
                    self.v[x] = source >> 1;
                    self.v[0xF] = source & 1;
                }
                0x7 => {
                    let (result, borrow) = self.v[y].overflowing_sub(self.v[x]);
                    self.v[x] = result;
                    self.v[0xF] = u8::from(!borrow);
                }
                0xE => {
                    let source = if self.quirks.shift_uses_vx {
                        self.v[x]
                    } else {
                        self.v[y]
                    };
                    self.v[x] = source << 1;
                    self.v[0xF] = (source >> 7) & 1;
                }
                _ => {}
            },
            0x9 => {
                if self.v[x] != self.v[y] {
                    self.pc = self.pc.wrapping_add(2);
                }
            }
            0xA => self.i = nnn,
            0xB => {
                let offset = if self.quirks.jump_v0 {
                    self.v[0]
                } else {
                    self.v[x]
                };
                self.pc = nnn.wrapping_add(u16::from(offset));
            }
            0xC => self.v[x] = self.rng_next() & nn,
            0xD => {
                let collision = self.draw(self.v[x], self.v[y], n);
                self.v[0xF] = u8::from(collision);
            }
            0xE => match (nn, self.keys[self.v[x] as usize % 16]) {
                (0x9E, true) | (0xA1, false) => self.pc = self.pc.wrapping_add(2),
                _ => {}
            },
            0xF => match nn {
                0x07 => self.v[x] = self.delay_timer,
                0x0A => {
                    let held = self.keys.iter().position(|pressed| *pressed);
                    self.waiting_key = Some(KeyWait {
                        register: x as u8,
                        key: held.map(|key| key as u8),
                    });
                }
                0x15 => self.delay_timer = self.v[x],
                0x18 => self.sound_timer = self.v[x],
                0x1E => self.i = self.i.wrapping_add(u16::from(self.v[x])),
                0x29 => {
                    // Values above 0x0F select the big digits (SUPER-CHIP).
                    let digit = self.v[x];
                    self.i = if digit < 16 {
                        FONT_START + u16::from(digit) * 5
                    } else {
                        BIG_FONT_START + u16::from((digit - 16).min(15)) * 10
                    };
                }
                0x30 => {
                    // FX30 addresses every big hex digit 0-F (Octo's `bighex`).
                    self.i = BIG_FONT_START + u16::from(self.v[x] & 0x0F) * 10;
                }
                0x33 => {
                    let value = self.v[x];
                    self.memory[self.i as usize & (MEMORY_SIZE - 1)] = value / 100;
                    self.memory[(self.i as usize + 1) & (MEMORY_SIZE - 1)] = value / 10 % 10;
                    self.memory[(self.i as usize + 2) & (MEMORY_SIZE - 1)] = value % 10;
                }
                0x55 => {
                    for register in 0..=x {
                        let address = self.i.wrapping_add(register as u16);
                        self.memory[address as usize & (MEMORY_SIZE - 1)] = self.v[register];
                    }
                    if self.quirks.load_store_increment {
                        self.i = self.i.wrapping_add(x as u16 + 1);
                    }
                }
                0x65 => {
                    for register in 0..=x {
                        let address = self.i.wrapping_add(register as u16);
                        self.v[register] = self.memory[address as usize & (MEMORY_SIZE - 1)];
                    }
                    if self.quirks.load_store_increment {
                        self.i = self.i.wrapping_add(x as u16 + 1);
                    }
                }
                0x75 => {
                    for register in 0..=x {
                        self.flags[register] = self.v[register];
                    }
                }
                0x85 => {
                    for register in 0..=x {
                        self.v[register] = self.flags[register];
                    }
                }
                _ => {}
            },
            _ => {}
        }
    }

    /// Draws an `8 x n` sprite, or the `16 x 16` double-size sprite when
    /// `n == 0` (two bytes per row), and reports a collision.
    fn draw(&mut self, x: u8, y: u8, n: u8) -> bool {
        let cols = self.cols();
        let rows = self.rows();
        let double = n == 0;
        let tall = if double { 16 } else { usize::from(n) };
        let wide = if double { 16 } else { 8 };
        let mut collision = false;
        for row in 0..tall {
            let sprite: u32 = if double {
                let high = u32::from(self.memory_at(self.i.wrapping_add((row * 2) as u16)));
                let low = u32::from(self.memory_at(self.i.wrapping_add((row * 2 + 1) as u16)));
                (high << 8) | low
            } else {
                u32::from(self.memory_at(self.i.wrapping_add(row as u16)))
            };
            if sprite == 0 {
                continue;
            }
            // Coordinates wrap first and only the part past the edge is
            // clipped, so an off-screen sprite reappears where it crosses.
            let py = usize::from(y) % rows + row;
            for bit in 0..wide {
                if sprite & (1u32 << (wide - 1 - bit)) == 0 {
                    continue;
                }
                let px = usize::from(x) % cols + bit;
                let (px, py) = if px >= cols || py >= rows {
                    if self.quirks.clip {
                        continue;
                    }
                    (px % cols, py % rows)
                } else {
                    (px, py)
                };
                let index = py * 2 + px / 64;
                let mask = 1u64 << (63 - px % 64);
                if self.fb[index] & mask != 0 {
                    collision = true;
                }
                self.fb[index] ^= mask;
            }
        }
        self.dirty = true;
        collision
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    impl Chip8 {
        /// Runs one raw opcode as if it were fetched at the current PC.
        fn execute_wrapped(&mut self, opcode: u16) {
            let pc = self.pc;
            self.execute(opcode, pc);
        }
    }

    fn vm(rom: &[u8]) -> Chip8 {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(rom).expect("load rom");
        vm
    }

    fn run(vm: &mut Chip8, cycles: usize) {
        for _ in 0..cycles {
            vm.tick();
        }
    }

    /// Hand-assembled smoke program: draws a 5-row bar every iteration, walks
    /// V0 and beeps, looping forever through `30 40` / `60 00`. Keeps the
    /// draw + sound + long-run coverage without an asset dependency.
    const SAMPLE: &[u8] = &[
        0xA2, 0x10, // I = 0x210 (sprite)
        0xD0, 0x15, // draw 5 rows at (V0, V1)
        0x70, 0x01, // V0 += 1
        0x6A, 0x05, // VA = 5
        0xFA, 0x18, // sound timer = VA
        0x30, 0x40, // skip next if V0 != 0x40
        0x60, 0x00, // V0 = 0
        0x12, 0x02, // jmp 0x202
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, // 8x5 solid sprite at 0x210
    ];

    #[test]
    fn sample_program_draws_and_beeps() {
        let mut vm = vm(SAMPLE);
        let mut drawn = false;
        // The bar is drawn at a new position every iteration, so scan while it
        // runs instead of trusting a single final frame.
        for _ in 0..1000 {
            vm.tick();
            drawn |= (0..vm.rows()).any(|y| (0..vm.cols()).any(|x| vm.pixel(x, y)));
        }
        let mut frame = Vec::new();
        vm.pack_frame(&mut frame);
        assert_eq!(frame.len(), LOW_ROWS * LOW_COLS / 8);
        assert!(drawn, "nothing was drawn");
        assert!(vm.sound_timer > 0, "the sample beep never fired");
    }

    #[test]
    fn sample_program_stays_alive_for_a_long_run() {
        let mut vm = vm(SAMPLE);
        run(&mut vm, 200_000);
        assert!(!vm.halted);
        assert_eq!(vm.cycles(), 200_000);
        assert!(vm.v[0] < 0x40, "V0 walked past its wrap: {}", vm.v[0]);
    }

    #[test]
    fn clear_and_pack_frame_bytes() {
        let mut vm = vm(&[0xD0, 0x11, 0x00, 0xE0]);
        vm.i = 0x200;
        vm.set_pixel(0, 0);
        let mut frame = Vec::new();
        vm.pack_frame(&mut frame);
        assert_eq!(frame[0], 0x80);
        assert!(frame[1..].iter().all(|byte| *byte == 0));
        run(&mut vm, 2); // D011 draws memory[0x200]=0xD0 at (0,0), then clear
        vm.pack_frame(&mut frame);
        assert!(frame.iter().all(|byte| *byte == 0), "clear did not happen");
    }

    #[test]
    fn draw_sets_collision_flag() {
        let mut program = Chip8::new(Quirks::CHIP8);
        program.memory[0x200] = 0xD0;
        program.memory[0x201] = 0x12;
        program.memory[0x300] = 0xF0;
        program.i = 0x300;
        program.v[0] = 5;
        program.v[1] = 2;
        program.tick();
        assert!(program.pixel(5, 2));
        assert!(program.pixel(8, 2));
        assert!(!program.pixel(9, 2));
        assert_eq!(program.v[0xF], 0, "first draw must not collide");

        program.pc = 0x200;
        program.tick();
        assert_eq!(program.v[0xF], 1, "second identical draw must collide");
        assert!(!program.pixel(5, 2), "XOR draw must erase");
    }

    #[test]
    fn draw_wraps_and_clips_per_quirk() {
        let build = |clip: bool| {
            let mut quirks = Quirks::CHIP8;
            quirks.clip = clip;
            let mut vm = Chip8::new(quirks);
            vm.memory[0x200] = 0xD0;
            vm.memory[0x201] = 0x11;
            vm.i = 0x300;
            vm.memory[0x300] = 0xFF;
            vm.v[0] = 62; // 8px sprite at x=62: two columns wrap or clip
            vm.v[1] = 0;
            vm.tick();
            vm
        };
        let wrapped = build(false);
        assert!(wrapped.pixel(62, 0));
        assert!(wrapped.pixel(1, 0), "wrap must place a pixel at x=1");
        let clipped = build(true);
        assert!(clipped.pixel(62, 0));
        assert!(!clipped.pixel(1, 0), "clip must drop the wrapped pixel");
    }

    #[test]
    fn clipping_keeps_the_part_inside_the_screen() {
        let mut quirks = Quirks::CHIP8;
        quirks.clip = true;
        let mut vm = Chip8::new(quirks);
        vm.memory[0x200] = 0xD0;
        vm.memory[0x201] = 0x11;
        vm.memory[0x300] = 0xFF;
        vm.i = 0x300;
        vm.v[0] = 70; // wraps to column 6 before any clipping applies
        vm.tick();
        assert!(vm.pixel(6, 0), "clipping must keep the visible part");
        assert!(vm.pixel(13, 0));
        assert!(!vm.pixel(5, 0), "the sprite starts at the wrapped column");
    }

    #[test]
    fn double_height_sprites_read_two_bytes_per_row() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.memory[0x200] = 0xD0;
        vm.memory[0x201] = 0x10; // DXY0: 16x16 at (V0, V1)
        vm.memory[0x300] = 0x80;
        vm.memory[0x301] = 0x01; // row 0: columns 0 and 15
        vm.memory[0x302] = 0x00;
        vm.memory[0x303] = 0x80; // row 1: column 8
        vm.i = 0x300;
        vm.tick();
        assert!(vm.pixel(0, 0));
        assert!(vm.pixel(15, 0));
        assert!(vm.pixel(8, 1));
        assert!(!vm.pixel(1, 0));
        assert_eq!(vm.v[0xF], 0, "a fresh double draw must not collide");

        let mut quirks = Quirks::CHIP8;
        quirks.clip = false; // wrap the tail to pin the modulo-first draw order
        let mut hi = Chip8::new(quirks);
        hi.memory[0x200] = 0xD0;
        hi.memory[0x201] = 0x10;
        hi.memory[0x300] = 0x00;
        hi.memory[0x301] = 0x01; // rightmost column of the 16-wide sprite
        hi.i = 0x300;
        hi.hires = true;
        hi.v[0] = 120;
        hi.tick();
        assert!(
            hi.pixel(7, 0),
            "the tail of a double sprite must wrap in hi-res"
        );
    }

    #[test]
    fn add_to_index_keeps_the_flag_register() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.v[3] = 0x20;
        vm.i = 0x300;
        vm.v[0xF] = 7;
        vm.execute_wrapped(0xF31E);
        assert_eq!(vm.i, 0x320);
        assert_eq!(vm.v[0xF], 7, "FX1E must not touch VF");
    }

    #[test]
    fn machine_call_zero_halts() {
        let mut vm = vm(&[0x00, 0x00, 0x60, 0x01]);
        vm.tick();
        assert!(vm.halted);
        let cycles = vm.cycles();
        vm.tick();
        assert_eq!(vm.cycles(), cycles, "halted ticks must do nothing");
    }

    #[test]
    fn skip_ops_and_subroutines() {
        // 6005 3005 120A 6007 220C 6009 61 01 00EE
        let mut vm = vm(&[
            0x60, 0x05, // 0x200: V0 = 5
            0x30, 0x05, // 0x202: skip if V0 == 5
            0x12, 0x08, // 0x204: jmp 0x208 (must be skipped)
            0x60, 0x07, // 0x206: V0 = 7
            0x22, 0x0C, // 0x208: call 0x20C
            0x60, 0x09, // 0x20A: V0 = 9 (after return)
            0x61, 0x01, // 0x20C: V1 = 1
            0x00, 0xEE, // 0x20E: return
        ]);
        run(&mut vm, 2);
        assert_eq!(vm.pc, 0x206, "skip must land past the jump");
        run(&mut vm, 1);
        assert_eq!(vm.v[0], 7, "the skipped branch must have run");
        run(&mut vm, 4);
        assert_eq!(vm.v[1], 1, "the subroutine must have run");
        assert_eq!(vm.v[0], 9, "control must return from the subroutine");
    }

    #[test]
    fn arithmetic_flags() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.v[0] = 0xFF;
        vm.v[1] = 0x02;
        vm.execute_wrapped(0x8014);
        assert_eq!(vm.v[0], 0x01);
        assert_eq!(vm.v[0xF], 1, "carry must be reported");
        vm.execute_wrapped(0x8015);
        assert_eq!(vm.v[0], 0xFF, "1 - 2 wraps");
        assert_eq!(vm.v[0xF], 0, "borrow must clear VF");
    }

    #[test]
    fn shift_quirks_choose_the_source_register() {
        // The conformance suite's CHIP-8 column: shifts read VY, the
        // shifted value is stored into VX ("SHIFTING off").
        let mut legacy = Chip8::new(Quirks::CHIP8);
        legacy.v[1] = 0b0110_0100;
        legacy.v[2] = 0b1000_0001;
        legacy.execute_wrapped(0x8126); // V1 = V2 >> 1, VF = bit0 of V2
        assert_eq!(legacy.v[1], 0b0100_0000);
        assert_eq!(legacy.v[0xF], 1);

        // SUPER-CHIP operates on VX in place and ignores VY ("SHIFTING on").
        let mut modern = Chip8::new(Quirks::SUPER_CHIP_10);
        modern.v[1] = 0b0110_0100;
        modern.v[2] = 0b1000_0001;
        modern.execute_wrapped(0x8126); // V1 >>= 1, VF = bit0 of V1
        assert_eq!(modern.v[1], 0b0011_0010);
        assert_eq!(modern.v[0xF], 0);
    }

    #[test]
    fn load_store_increment_quirk() {
        let mut legacy = Chip8::new(Quirks::CHIP8);
        legacy.i = 0x300;
        legacy.v[0] = 1;
        legacy.v[1] = 2;
        legacy.execute_wrapped(0xF155);
        assert_eq!((legacy.memory[0x300], legacy.memory[0x301]), (1, 2));
        assert_eq!(legacy.i, 0x302, "legacy FX55 must advance I");

        let mut modern = Chip8::new(Quirks::SUPER_CHIP_10);
        modern.i = 0x300;
        modern.v[0] = 3;
        modern.execute_wrapped(0xF055);
        assert_eq!(modern.memory[0x300], 3);
        assert_eq!(modern.i, 0x300, "modern FX55 must keep I");
    }

    #[test]
    fn jump_b_offset_quirk() {
        let mut legacy = Chip8::new(Quirks::CHIP8);
        legacy.v[0] = 4;
        legacy.v[5] = 9;
        legacy.execute_wrapped(0xB200);
        assert_eq!(legacy.pc, 0x204, "BNNN uses V0 by default");

        let mut modern = Chip8::new(Quirks::SUPER_CHIP_11);
        modern.v[0] = 4;
        modern.v[5] = 9;
        modern.execute_wrapped(0xB500);
        assert_eq!(modern.pc, 0x509, "BXNN uses VX on SUPER-CHIP 1.1");
    }

    #[test]
    fn logic_resets_vf_only_in_legacy_mode() {
        let mut legacy = Chip8::new(Quirks::CHIP8);
        legacy.v[0xF] = 7;
        legacy.execute_wrapped(0x8011);
        assert_eq!(legacy.v[0xF], 0);

        let mut modern = Chip8::new(Quirks::SUPER_CHIP_10);
        modern.v[0xF] = 7;
        modern.execute_wrapped(0x8011);
        assert_eq!(modern.v[0xF], 7);
    }

    #[test]
    fn wait_for_key_resumes_on_release() {
        let mut vm = vm(&[0xF0, 0x0A, 0x60, 0x01]);
        vm.tick();
        assert!(vm.waiting_for_key(), "FX0A must block when no key is held");
        let pc = vm.pc;
        vm.tick();
        assert_eq!(vm.pc, pc, "blocked ticks must not advance or execute");
        vm.set_key(0xC, true);
        assert!(vm.waiting_for_key(), "the press alone must not resume FX0A");
        assert_eq!(vm.v[0], 0, "VX is filled on release, not on the press");
        vm.set_key(0xC, false);
        assert_eq!(vm.v[0], 0xC);
        assert!(!vm.waiting_for_key());
        vm.tick();
        assert_eq!(vm.v[0], 1, "execution resumes after the key is released");
    }

    #[test]
    fn wait_for_key_latches_a_held_key_until_its_release() {
        let mut vm = vm(&[0xF0, 0x0A, 0x60, 0x01]);
        vm.set_key(0x3, true); // held before FX0A runs
        vm.tick();
        assert!(vm.waiting_for_key(), "a held key must not resume FX0A");
        vm.set_key(0x5, true); // a second key must not steal the wait
        assert!(vm.waiting_for_key());
        vm.set_key(0x5, false);
        assert!(vm.waiting_for_key(), "only the latched key completes it");
        vm.set_key(0x3, false);
        assert_eq!(vm.v[0], 0x3);
        assert!(!vm.waiting_for_key());
    }

    #[test]
    fn bcd_and_font_addressing() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.i = 0x400;
        vm.v[3] = 234;
        vm.execute_wrapped(0xF333);
        assert_eq!(&vm.memory[0x400..0x403], &[2, 3, 4]);

        vm.v[3] = 0xA;
        vm.execute_wrapped(0xF329);
        assert_eq!(vm.i, FONT_START + 50);
        vm.v[3] = 16;
        vm.execute_wrapped(0xF329);
        assert_eq!(vm.i, BIG_FONT_START, "digit 16 selects the big zero");
        vm.v[3] = 3;
        vm.execute_wrapped(0xF330);
        assert_eq!(vm.i, BIG_FONT_START + 30, "FX30 always uses the big font");
        vm.v[3] = 0xA;
        vm.execute_wrapped(0xF330);
        assert_eq!(
            vm.i,
            BIG_FONT_START + 100,
            "FX30 must address the hex digits A-F"
        );
    }

    #[test]
    fn random_is_masked_and_deterministic_per_seed() {
        let mut a = Chip8::with_seed(Quirks::CHIP8, 42);
        let mut b = Chip8::with_seed(Quirks::CHIP8, 42);
        for _ in 0..64 {
            a.v[0] = 0;
            b.v[0] = 0;
            a.execute_wrapped(0xC00F);
            b.execute_wrapped(0xC00F);
            assert_eq!(a.v[0], b.v[0]);
            assert!(a.v[0] <= 0x0F, "CXNN must mask to NN");
        }
    }

    #[test]
    fn mode_switch_changes_frame_size() {
        let mut vm = vm(&[0x00, 0xFF, 0x00, 0xFE]);
        assert_eq!(vm.frame_len(), LOW_ROWS * LOW_COLS / 8);
        vm.tick();
        assert!(vm.hires);
        assert_eq!(vm.frame_len(), HIGH_ROWS * HIGH_COLS / 8);
        vm.tick();
        assert!(!vm.hires);
        assert_eq!(vm.frame_len(), LOW_ROWS * LOW_COLS / 8);
    }

    #[test]
    fn scrolls_move_the_right_pixels() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.set_pixel(0, 5);
        vm.scroll_down(1);
        assert!(vm.pixel(0, 6));
        assert!(!vm.pixel(0, 5));
        vm.clear_display();
        vm.set_pixel(10, 0);
        vm.scroll_left();
        assert!(vm.pixel(6, 0));
        vm.clear_display();
        vm.set_pixel(10, 0);
        vm.scroll_right();
        assert!(vm.pixel(14, 0));
        vm.hires = true;
        vm.clear_display();
        vm.set_pixel(70, 0);
        vm.scroll_left();
        assert!(vm.pixel(66, 0), "hi-res scroll crosses the word boundary");
    }

    #[test]
    fn timers_decrement_and_saturate() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.sound_timer = 3;
        vm.delay_timer = 1;
        vm.tick_timers(2);
        assert_eq!(vm.sound_timer, 1);
        assert_eq!(vm.delay_timer, 0);
        vm.tick_timers(10);
        assert_eq!(vm.sound_timer, 0);
        assert!(!vm.sound_active());
    }

    #[test]
    fn rejecting_bad_rom_sizes() {
        let mut vm = Chip8::new(Quirks::CHIP8);
        assert!(vm.load(&[]).is_err());
        let too_big = vec![0u8; MAX_PROGRAM_BYTES + 1];
        assert!(vm.load(&too_big).is_err());
    }

    /// Optional conformance run against a local ROM (for example the Timendus
    /// chip8-test-suite, kept in the gitignored `roms.local/chip8-test-suite/`).
    /// Not committed: `ILUHA_CHIP8_ROM=path cargo test
    /// --manifest-path src-tauri/Cargo.toml run_local_rom -- --ignored --nocapture`
    #[test]
    #[ignore = "requires ILUHA_CHIP8_ROM"]
    fn run_local_rom() {
        let path = std::env::var("ILUHA_CHIP8_ROM").expect("ILUHA_CHIP8_ROM is not set");
        let bytes = std::fs::read(&path).expect("read rom");
        let mut vm = Chip8::new(Quirks::CHIP8);
        vm.load(&bytes).expect("load rom");
        for _ in 0..2_000_000 {
            vm.tick();
            if vm.halted {
                break;
            }
        }
        println!(
            "rom={path} cycles={} v={:?} i={:#05X} pc={:#05X} halted={}",
            vm.cycles(),
            vm.v,
            vm.i,
            vm.pc,
            vm.halted
        );
    }

    /// Results of one simulated minute of play, used by the smoke run below.
    #[derive(Default)]
    struct SmokeReport {
        cycles: u64,
        draws: u32,
        first_draw: Option<u32>,
        last_draw: Option<u32>,
        waits: u32,
        halt: Option<u32>,
        idle_max: u32,
        idle_from: u32,
        oob: u32,
        oob_first: Option<u32>,
        sound: u32,
        hires: u32,
    }

    impl SmokeReport {
        /// A ROM looks broken when it runs off the end of its own code, never
        /// draws anything, or sits static for half of the simulated minute
        /// while being neither halted nor blocked on a key.
        fn suspicious(&self) -> bool {
            self.oob > 0
                || (self.halt.is_none() && self.draws == 0)
                || (self.halt.is_none() && self.idle_max >= 1_800)
        }
    }

    fn optional(value: Option<u32>) -> String {
        value.map_or_else(|| "-".to_string(), |value| value.to_string())
    }

    /// Key schedule shared by the smoke and dump runs: tap each keypad key in
    /// turn so menus and FX0A waits progress without a human. `held_long`
    /// stretches the press so a pending FX0A observes a release only several
    /// ticks after it latched the key (what the conformance suite wants).
    fn scripted_key(frame: u32, held_long: bool) -> Option<u8> {
        let (window, press) = if held_long { (64, 24) } else { (32, 4) };
        if frame % window >= press {
            return None;
        }
        Some(u8::try_from((frame / window) % 16).expect("key index fits"))
    }

    /// Runs frames of the frontend contract — cycles, then one 60 Hz timer
    /// tick, then the scripted keypad tap — and hands every frame to `visit`.
    fn simulate(
        vm: &mut Chip8,
        frames: u32,
        cycles_per_frame: u32,
        held_long: bool,
        mut visit: impl FnMut(&mut Chip8, u32, bool),
    ) {
        let mut held: Option<u8> = None;
        for frame in 0..frames {
            let wanted = scripted_key(frame, held_long);
            if wanted != held {
                if let Some(previous) = held {
                    vm.set_key(previous, false);
                }
                if let Some(next) = wanted {
                    vm.set_key(next, true);
                }
                held = wanted;
            }
            for _ in 0..cycles_per_frame {
                vm.tick();
            }
            vm.tick_timers(1);
            let drew = vm.dirty;
            vm.dirty = false;
            visit(vm, frame, drew);
        }
        if let Some(previous) = held {
            vm.set_key(previous, false);
        }
    }

    fn smoke_rom(bytes: &[u8], quirks: Quirks, schip: bool) -> SmokeReport {
        const FRAMES: u32 = 3_600; // 60 simulated seconds at 60 Hz
        let cycles_per_frame = if schip { 20 } else { 12 };
        let rom_start = u32::from(PROGRAM_START);
        let rom_end = rom_start + u32::try_from(bytes.len()).expect("rom fits the address space");
        let mut vm = Chip8::with_seed(quirks, 0x1234_5678_9ABC_DEF0);
        vm.load(bytes).expect("load rom");

        let mut report = SmokeReport::default();
        let mut idle_run = 0u32;
        let mut idle_start = 0u32;
        simulate(
            &mut vm,
            FRAMES,
            cycles_per_frame,
            false,
            |vm, frame, drew| {
                if drew {
                    report.draws += 1;
                    report.first_draw.get_or_insert(frame);
                    report.last_draw = Some(frame);
                }
                if vm.sound_active() {
                    report.sound += 1;
                }
                if vm.hires {
                    report.hires += 1;
                }
                if vm.waiting_for_key() {
                    report.waits += 1;
                }
                if vm.halted {
                    report.halt.get_or_insert(frame);
                }
                let pc = u32::from(vm.pc);
                if !(rom_start..rom_end).contains(&pc) {
                    report.oob += 1;
                    report.oob_first.get_or_insert(frame);
                }
                if drew || vm.waiting_for_key() || vm.halted {
                    idle_run = 0;
                } else {
                    if idle_run == 0 {
                        idle_start = frame;
                    }
                    idle_run += 1;
                    if idle_run > report.idle_max {
                        report.idle_max = idle_run;
                        report.idle_from = idle_start;
                    }
                }
            },
        );
        report.cycles = vm.cycles();
        report
    }

    /// Optional smoke run over the real store library kept in the gitignored
    /// `roms.local/real-games/` (copied from the chip8Archive build cache and
    /// named `<platform>__<key>.ch8`). Each ROM plays a simulated minute at
    /// the frontend's clock contract; the WARN lines flag ROMs that never
    /// draw, run off the end of their own code, or freeze.
    /// `cargo test --manifest-path src-tauri/Cargo.toml run_local_roms --
    /// --ignored --nocapture`
    #[test]
    #[ignore = "requires the local ROM set (see the doc comment)"]
    fn run_local_roms() {
        let dir = std::env::var("ILUHA_CHIP8_ROMS_DIR").map_or_else(
            |_| {
                std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("roms.local")
                    .join("real-games")
            },
            std::path::PathBuf::from,
        );
        let mut paths: Vec<std::path::PathBuf> = std::fs::read_dir(&dir)
            .unwrap_or_else(|error| panic!("read {}: {error}", dir.display()))
            .filter_map(|entry| entry.ok().map(|entry| entry.path()))
            .filter(|path| path.extension().is_some_and(|extension| extension == "ch8"))
            .collect();
        paths.sort();
        assert!(!paths.is_empty(), "no ROMs under {}", dir.display());

        let mut suspicious = 0usize;
        for path in &paths {
            let bytes = std::fs::read(path).expect("read rom");
            let stem = path
                .file_stem()
                .map_or_else(String::new, |stem| stem.to_string_lossy().into_owned());
            let (platform, key) = stem.split_once("__").unwrap_or(("chip8", stem.as_str()));
            let quirks = crate::game::store::quirks_for_bytes(&bytes)
                .unwrap_or_else(|| Quirks::for_platform(platform));
            let report = smoke_rom(&bytes, quirks, platform != "chip8");
            let flagged = report.suspicious();
            suspicious += usize::from(flagged);
            println!(
                "{} {key:<24} {platform:<6} bytes={:<5} draws={:<5} first={:<5} last={:<5} wait={:<5} idle={:<5}@{:<5} oob={:<4}@{:<5} halt={:<5} sound={:<5} hires={:<5} cycles={}",
                if flagged { "WARN" } else { "ok  " },
                bytes.len(),
                report.draws,
                optional(report.first_draw),
                optional(report.last_draw),
                report.waits,
                report.idle_max,
                report.idle_from,
                report.oob,
                optional(report.oob_first),
                optional(report.halt),
                report.sound,
                report.hires,
                report.cycles,
            );
        }
        println!("roms={} suspicious={suspicious}", paths.len());
        assert_eq!(suspicious, 0, "see the WARN lines above");
    }

    /// Renders chosen frames of one ROM as ASCII art for eyeballing:
    /// `ILUHA_CHIP8_DUMP_ROM=roms.local/... ILUHA_CHIP8_DUMP_FRAMES=30,600
    /// cargo test ... dump_rom_frames -- --ignored --nocapture`.
    /// `ILUHA_CHIP8_DUMP_PLATFORM` picks the quirk fallback,
    /// `ILUHA_CHIP8_DUMP_PATCH=0x1FF=2` patches memory after loading, and
    /// `ILUHA_CHIP8_DUMP_RAW_DIR` additionally writes each frame as raw
    /// pixels for `chip8-raw-to-png.ps1`.
    #[test]
    #[ignore = "requires ILUHA_CHIP8_DUMP_ROM"]
    fn dump_rom_frames() {
        let path = std::env::var("ILUHA_CHIP8_DUMP_ROM").expect("ILUHA_CHIP8_DUMP_ROM is not set");
        let frames: Vec<u32> = std::env::var("ILUHA_CHIP8_DUMP_FRAMES")
            .unwrap_or_else(|_| "30,300,1200,3599".to_string())
            .split(',')
            .map(|part| part.trim().parse().expect("frame number"))
            .collect();
        let platform =
            std::env::var("ILUHA_CHIP8_DUMP_PLATFORM").unwrap_or_else(|_| "chip8".to_string());
        let bytes = std::fs::read(&path).expect("read rom");
        let quirks = crate::game::store::quirks_for_bytes(&bytes)
            .unwrap_or_else(|| Quirks::for_platform(&platform));
        let mut vm = Chip8::with_seed(quirks, 0x1234_5678_9ABC_DEF0);
        vm.load(&bytes).expect("load rom");
        if let Ok(patch) = std::env::var("ILUHA_CHIP8_DUMP_PATCH") {
            for assignment in patch.split(',').filter(|part| !part.trim().is_empty()) {
                let (address, value) = assignment.split_once('=').expect("address=value");
                let address = u16::from_str_radix(address.trim().trim_start_matches("0x"), 16)
                    .expect("hex address");
                let value = u8::from_str_radix(value.trim().trim_start_matches("0x"), 16)
                    .expect("hex value");
                vm.memory[address as usize & (MEMORY_SIZE - 1)] = value;
            }
        }
        let cycles_per_frame = if platform == "chip8" { 12 } else { 20 };
        let last = frames.iter().copied().max().expect("at least one frame");
        println!("rom={path} platform={platform} frames={frames:?}");
        let raw_dir = std::env::var("ILUHA_CHIP8_DUMP_RAW_DIR").ok();
        if let Some(dir) = &raw_dir {
            std::fs::create_dir_all(dir).expect("create raw dump dir");
        }
        simulate(&mut vm, last + 1, cycles_per_frame, true, |vm, frame, _| {
            if frames.contains(&frame) {
                println!(
                    "--- frame {frame} cycles={} pc={:#05X} ---",
                    vm.cycles(),
                    vm.pc
                );
                print_art(vm);
                if let Some(dir) = &raw_dir {
                    write_raw_frame(vm, dir, frame);
                }
            }
        });
        println!(
            "--- end pc={:#05X} i={:#05X} halt={} hires={} wait={} ---",
            vm.pc,
            vm.i,
            vm.halted,
            vm.hires,
            vm.waiting_for_key()
        );
    }

    /// Writes one framebuffer as raw pixel bytes (`cols` and `rows` as
    /// little-endian u16, then one byte per pixel, left to right, top to
    /// bottom) so tooling outside cargo can turn it into an image.
    fn write_raw_frame(vm: &Chip8, dir: &str, frame: u32) {
        let cols = u16::try_from(vm.cols()).expect("cols fit");
        let rows = u16::try_from(vm.rows()).expect("rows fit");
        let mut bytes = Vec::with_capacity(4 + usize::from(cols) * usize::from(rows));
        bytes.extend_from_slice(&cols.to_le_bytes());
        bytes.extend_from_slice(&rows.to_le_bytes());
        for y in 0..vm.rows() {
            for x in 0..vm.cols() {
                bytes.push(u8::from(vm.pixel(x, y)));
            }
        }
        let path = std::path::Path::new(dir).join(format!("{frame:05}.raw"));
        std::fs::write(path, bytes).expect("write raw frame");
    }

    fn print_art(vm: &Chip8) {
        for y in 0..vm.rows() {
            let line: String = (0..vm.cols())
                .map(|x| if vm.pixel(x, y) { '#' } else { '.' })
                .collect();
            println!("{line}");
        }
    }
}
