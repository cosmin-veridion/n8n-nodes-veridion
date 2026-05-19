const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'nodes');
const targetDir = path.join(__dirname, '..', 'dist', 'nodes');

function copySvgFiles(currentSourceDir, currentTargetDir) {
	fs.mkdirSync(currentTargetDir, { recursive: true });

	for (const entry of fs.readdirSync(currentSourceDir, { withFileTypes: true })) {
		const sourcePath = path.join(currentSourceDir, entry.name);
		const targetPath = path.join(currentTargetDir, entry.name);

		if (entry.isDirectory()) {
			copySvgFiles(sourcePath, targetPath);
			continue;
		}

		if (entry.isFile() && entry.name.endsWith('.svg')) {
			fs.copyFileSync(sourcePath, targetPath);
		}
	}
}

copySvgFiles(sourceDir, targetDir);
