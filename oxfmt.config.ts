import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  printWidth: 100,
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), "src-tauri/**", "md/**"],
});
