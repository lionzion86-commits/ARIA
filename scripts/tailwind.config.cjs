/* The home page's Tailwind, built once instead of compiled on every
   phone (scripts/build-tailwind.mjs). Default theme, no plugins: the
   same as the cdn.tailwindcss.com runtime it replaces. Content is every
   file that writes class names into the home page. */
const path = require("node:path");
const root = path.join(__dirname, "..");
module.exports = {
  content: [path.join(root, "index.html"), path.join(root, "build", "*.js")],
};
