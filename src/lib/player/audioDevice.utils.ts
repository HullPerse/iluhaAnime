import { invokeTyped } from "@/lib/core/system/invoke.utils";
import { AudioDeviceListSchema } from "@/schemas/player.schema";

export async function readAudioDevices() {
  const raw: unknown = await invokeTyped("player_get_property", {
    name: "audio-device-list",
    format: "json",
  });
  const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;

  return AudioDeviceListSchema.parse(value);
}
