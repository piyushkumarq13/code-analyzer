const { exec } = require('child_process');
const path = require('path');

function analyzeCSS(filePath) {
  return new Promise((resolve) => {
    const cmd = `./node_modules/.bin/stylelint "${filePath}" --formatter json 2>/dev/null`;
    exec(cmd, { cwd: process.cwd() }, (error, stdout) => {
      try {
        const results = JSON.parse(stdout);
        const issues = [];
        results.forEach(result => {
          result.warnings.forEach(w => {
            issues.push({
              file: path.basename(result.source),
              line: w.line,
              message: w.text,
              type: w.severity === 'error' ? 'CSS Error' : 'CSS Warning',
              rule: w.rule
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

module.exports = { analyzeCSS };