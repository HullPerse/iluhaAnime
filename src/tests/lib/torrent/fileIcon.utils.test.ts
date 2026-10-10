import { describe, expect, it } from "vitest";

import { torrentFileIcon } from "@/lib/torrent/fileIcon.utils";

describe("torrentFileIcon", () => {
  it("maps video extensions to the player icon", () => {
    expect(torrentFileIcon("episode-01.mkv")).toBe("w2k_wmp_11.ico");
    expect(torrentFileIcon("movie.MP4")).toBe("w2k_wmp_11.ico");
  });

  it("maps audio extensions to the sound icon", () => {
    expect(torrentFileIcon("track01.flac")).toBe("w2k_3.ico");
    expect(torrentFileIcon("song.mp3")).toBe("w2k_3.ico");
  });

  it("maps subtitle extensions to the message icon", () => {
    expect(torrentFileIcon("episode-01.ass")).toBe("w98_message_file.ico");
    expect(torrentFileIcon("subs.srt")).toBe("w98_message_file.ico");
  });

  it("maps archives, fonts, images and text to their icons", () => {
    expect(torrentFileIcon("backup.zip")).toBe("w2k_zip_file.ico");
    expect(torrentFileIcon("font.ttf")).toBe("w2k_fonts.ico");
    expect(torrentFileIcon("cover.jpg")).toBe("w2k_jpeg_image.ico");
    expect(torrentFileIcon("readme.nfo")).toBe("w2k_notepad_1.ico");
  });

  it("falls back to the generic icon for unknown extensions", () => {
    expect(torrentFileIcon("data.bin")).toBe("w2k_multiple_files.ico");
    expect(torrentFileIcon("noextension")).toBe("w2k_multiple_files.ico");
  });
});
