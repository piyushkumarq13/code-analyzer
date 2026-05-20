const { exec } = require('child_process');
const path = require('path');

function analyzeHTML(filePath) {
  return new Promise((resolve) => {
    const cmd = `./node_modules/.bin/htmlhint "${filePath}" --format json 2>/dev/null`;
    exec(cmd, { cwd: process.cwd() }, (error, stdout) => {
      try {
        const results = JSON.parse(stdout);
        const issues = [];
        if (Array.isArray(results)) {
          results.forEach(result => {
            if (result.messages) {
              result.messages.forEach(msg => {
                issues.push({
                  file: path.basename(filePath),
                  line: msg.line,
                  message: msg.message,
                  type: 'HTML Issue',
                  rule: msg.rule ? msg.rule.id : ''
                });
              });
            }
          });
        }
        resolve(issues);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

module.exports = { analyzeHTML };