import * as z from "zod/mini";

export const SessionConfigSchema = z.compile(
  z.object({
    fastresume: z.boolean(),
    ipv4Only: z.boolean(),
    peerConnectTimeout: z.number(),
    peerReadWriteTimeout: z.number(),
    listenPort: z.number(),
    enableUpnp: z.boolean(),
    dhtEnabled: z.boolean(),
    disablePersistence: z.boolean(),
    proxyUrl: z.nullable(z.string()),
    fileOrder: z.enum(["list", "torrent"]),
  })
);
