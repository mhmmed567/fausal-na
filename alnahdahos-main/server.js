// Keep the entry synchronous: hosting launchers may load it with require().
// The compiled ESM server can still use top-level await behind dynamic import.
import("./dist-server/index.js").catch((error) => {
  console.error("Unable to start Nahdha CRM:", error);
  process.exitCode = 1;
});
