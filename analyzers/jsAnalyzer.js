const { exec } = require('child_process');
const path = require('path');

function analyzeJS(filePath) {
  return new Promise((resolve) => {
    const cmd = `./node_modules/.bin/eslint "${filePath}" --format json 2>/dev/null`;
    exec(cmd, { cwd: process.cwd() }, (error, stdout) => {
      try {
        const results = JSON.parse(stdout);
        const issues = [];
        results.forEach(result => {
          result.messages.forEach(msg => {
            issues.push({
              file: path.basename(result.filePath),
              line: msg.line,
              message: msg.message,
              type: msg.severity === 2 ? 'JS Error' : 'JS Warning',
              rule: msg.ruleId
            });
          });
        });
        resolve(issues);
      } catch (e) {
        resolve([]);
      }
    });
  });
}

module.exports = { analyzeJS };