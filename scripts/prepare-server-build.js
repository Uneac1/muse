const fs = require('fs');
const path = require('path');
const { cleanupServerProcesses } = require('./cleanup-server-processes');

function prepareServerBuild() {
  cleanupServerProcesses();

  const serverDistDir = path.resolve(__dirname, '..', 'server', 'dist');
  fs.rmSync(serverDistDir, { recursive: true, force: true });
  fs.mkdirSync(serverDistDir, { recursive: true });
}

if (require.main === module) {
  prepareServerBuild();
}

module.exports = {
  prepareServerBuild,
};
