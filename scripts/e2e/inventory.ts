import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { outRoot } from "./harness";
import { buildMediaInventory } from "./media";

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = join(outRoot(), `media-${stamp}`);
mkdirSync(outDir, { recursive: true });
const inventory = await buildMediaInventory();
writeFileSync(join(outDir, "media-inventory.json"), JSON.stringify(inventory, null, 2));
console.log(`[media] root: ${inventory.root}`);
console.log(`[media] scanned=${inventory.scannedCount} probed=${inventory.probedCount}`);
for (const { file, reasons } of inventory.selected) {
  console.log(`[media] ${reasons.join(", ")}: ${file.path}`);
}
console.log(`[media] report: ${outDir}`);
