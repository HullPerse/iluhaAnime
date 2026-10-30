import { describe, expect, it } from "vitest";

import {
  findDuplicateByHash,
  normalizeInfoHash,
  parseInfoHashFromMagnet,
} from "@/lib/core/duplicate.utils";
import type { TorrentInfo } from "@/types/torrent/torrent";

const HEX = "0123456789abcdef0123456789abcdef01234567";
const HEX_UPPER = HEX.toUpperCase();

function row(id: number, info_hash: string, name = `Torrent ${id}`): TorrentInfo {
  return {
    download_order: [],
    download_speed: 0,
    error: null,
    eta_secs: null,
    finished: false,
    id,
    info_hash,
    missing_files: false,
    external_changes: false,
    external_changed_files: [],
    name,
    peers_connected: 0,
    progress: 0,
    progress_bytes: 0,
    save_dir: "/dl",
    sequential_download: false,
    sequential_file: null,
    share_ratio: 0,
    state: "live",
    total_bytes: 1000,
    upload_speed: 0,
    uploaded_bytes: 0,
  };
}

describe("torrent/duplicate", () => {
  describe("parseInfoHashFromMagnet", () => {
    it("reads a lowercase hex hash", () => {
      expect(parseInfoHashFromMagnet(`magnet:?xt=urn:btih:${HEX}`)).toBe(HEX);
    });

    it("lowercases an uppercase hex hash", () => {
      expect(parseInfoHashFromMagnet(`magnet:?xt=urn:btih:${HEX_UPPER}`)).toBe(HEX);
    });

    it("reads the first xt param among others", () => {
      expect(parseInfoHashFromMagnet(`magnet:?dn=Show&xt=urn:btih:${HEX}&tr=udp://t`)).toBe(HEX);
    });

    it("decodes a base32 hash to hex", () => {
      expect(parseInfoHashFromMagnet("magnet:?xt=urn:btih:I3VMTXKYUM5LFJ7T6D7SYULNOGVQD6U7")).toBe(
        "46eac9dd58a33ab2a7f3f0ff2c516d71ab01fa9f"
      );
    });

    it("returns null without a btih param", () => {
      expect(parseInfoHashFromMagnet("magnet:?dn=Show")).toBeNull();
      expect(parseInfoHashFromMagnet("not a magnet")).toBeNull();
      expect(parseInfoHashFromMagnet("")).toBeNull();
    });

    it("returns null for a short hash", () => {
      expect(parseInfoHashFromMagnet("magnet:?xt=urn:btih:abc123")).toBeNull();
    });
  });

  describe("findDuplicateByHash", () => {
    it("matches case-insensitively", () => {
      const list = [row(1, HEX), row(2, "ffffffffffffffffffffffffffffffffffffffff")];
      expect(findDuplicateByHash(list, HEX_UPPER)?.id).toBe(1);
    });

    it("never matches on name alone", () => {
      const list = [row(1, HEX, "Same Name")];
      expect(
        findDuplicateByHash(list, "ffffffffffffffffffffffffffffffffffffffff")?.id
      ).toBeUndefined();
      expect(findDuplicateByHash(list, "Same Name")).toBeNull();
    });

    it("returns null for an empty library or a bad hash", () => {
      expect(findDuplicateByHash([], HEX)).toBeNull();
      expect(findDuplicateByHash([row(1, HEX)], "zzz")).toBeNull();
    });
  });

  describe("normalizeInfoHash", () => {
    it("trims and lowercases hex", () => {
      expect(normalizeInfoHash(`  ${HEX_UPPER} `)).toBe(HEX);
    });
  });
});
