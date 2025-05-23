const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.resolve(__dirname, "shared/types.ts");
const frontendDest = path.resolve(__dirname, "frontend/shared/types.ts");
const backendDest = path.resolve(__dirname, "backend/shared/types.ts");

function copySharedFile(dest) {
	if (!fs.existsSync(path.dirname(dest))) {
		fs.mkdirSync(path.dirname(dest), { recursive: true });
	}

	fs.copyFileSync(sourcePath, dest);
	console.log(`✅ Copied to: ${dest}`);
}

try {
	if (!fs.existsSync(sourcePath)) {
		console.error("❌ Source file 'shared/types.ts' not found.");
		process.exit(1);
	}

	copySharedFile(frontendDest);
	copySharedFile(backendDest);

	console.log("🎉 Shared file synced successfully.");
} catch (error) {
	console.error("❌ Error syncing shared file:", error);
	process.exit(1);
}
