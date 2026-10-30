import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
  ...ultracite,
  printWidth: 100,
  sortImports: false,
  jsPlugins: [{ name: "react-doctor", specifier: "oxlint-plugin-react-doctor" }],
  ignorePatterns: [...(ultracite.ignorePatterns ?? []), "src-tauri/**", "md/**"],
});
