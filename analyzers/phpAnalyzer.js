const { exec } = require('child_process');
const path = require('path');

function analyzePHP(filePath) {
  return new Promise((resolve) => {
    const cmd = `./vendor/bin/phpstan analyse "${filePath}" --error-format=json --no-progress 2>/dev/null`;
    exec(cmd, { cwd: process.cwd() }, (error, stdout) => {
      try {
        const result = JSON.parse(stdout);
        const issues = [];
        if (result.files) {
          Object.entries(result.files).forEach(([file, data]) => {
            data.messages.forEach(msg => {
              issues.push({
                file: path.basename(file),
                line: msg.line,
                message: msg.message,
                type: 'PHP Error'
              });
            });
          });
        }
        resolve(issues);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

module.exports = { analyzePHP };