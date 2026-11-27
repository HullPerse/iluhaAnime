import { describe, expect, it } from "vitest";
import { readAudioDevices } from "@/lib/player/audioDevice.utils";
import { mockInvoke } from "@/tests/mocks";

describe("audio output boundary", () => {
  it("reads actual mpv JSON devices", async () => {
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { name: "auto", description: "Default" },
        { name: "wasapi/output", description: "Speakers" },
      ])
    );
    expect(await readAudioDevices()).toEqual([
      { name: "auto", description: "Default" },
      { name: "wasapi/output", description: "Speakers" },
    ]);
  });
  it("rejects malformed devices and query failures", async () => {
    mockInvoke.mockResolvedValueOnce('[{"name": 4}]');
    await expect(readAudioDevices()).rejects.toThrow();
    mockInvoke.mockRejectedValueOnce(new Error("mpv closed"));
    await expect(readAudioDevices()).rejects.toThrow();
  });
});
