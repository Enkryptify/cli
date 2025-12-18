import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

console.log("🔧 Patching 1Password SDK for bundled execution...\n");

const sdkPath = resolve("node_modules/@1password/sdk-core/nodejs/index.js");

if (!existsSync(sdkPath)) {
    console.warn("⚠️  1Password SDK not found yet at:", sdkPath);
    console.warn("   This is normal during initial install. SDK will be patched after installation completes.");
    console.warn("   If you see this after install, run: bun run patch:1password\n");
    process.exit(0); // Exit successfully, don't fail the install
}

let content = readFileSync(sdkPath, "utf-8");

// Check if already patched
if (content.includes("// ENKRYPTIFY BUNDLING PATCH")) {
    console.log("✅ SDK already patched for bundled execution");
    process.exit(0);
}

// Find the WASM loading pattern
const patterns = [
    /var bytes = __require\("fs"\)\.readFileSync\(path3\);/g,
    /const bytes = require\("fs"\)\.readFileSync\(wasmPath\);/g,
    /fs\.readFileSync\(.*?\.wasm['"]\)/g,
];

let patched = false;

for (const pattern of patterns) {
    if (pattern.test(content)) {
        content = content.replace(
            pattern,
            `// ENKRYPTIFY BUNDLING PATCH
  var fs = __require("fs") || require("fs");
  var path = __require("path") || require("path");
  var wasmPath = path3 || arguments[0];
  
  // When bundled, look for WASM next to the executable
  if (process.execPath && (process.execPath.includes('ek-darwin') || process.execPath.includes('ek-linux') || process.execPath.includes('ek.exe'))) {
    var execDir = path.dirname(process.execPath);
    var bundledWasm = path.join(execDir, 'core_bg.wasm');
    if (fs.existsSync(bundledWasm)) {
      wasmPath = bundledWasm;
      console.log('📦 Using bundled WASM:', bundledWasm);
    }
  }
  
  var bytes = fs.readFileSync(wasmPath);`,
        );
        patched = true;
        break;
    }
}

if (patched) {
    writeFileSync(sdkPath, content);
    console.log("✅ Successfully patched 1Password SDK!");
    console.log("   WASM will be loaded from executable directory when bundled\n");
} else {
    console.warn("⚠️  Could not find WASM loading pattern in SDK");
    console.warn("   The SDK structure may have changed");
    console.warn("   Build will continue, but runtime may fail\n");

    // Don't exit with error - let the build continue
    // The developer will see the runtime error if this fails
}
