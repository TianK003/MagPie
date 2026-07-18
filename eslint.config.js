// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Build output, plus the HTML/JSX design references preserved at the repo
    // root (not app code — see CLAUDE.md "Repository state").
    ignores: ["dist/*", "ios-frame.jsx", "*.html"],
  }
]);
