import fs from 'node:fs';
import path from 'node:path';

// Do not trust success:true when a Vitest worker did not deliver every result.
function validateVitestReport(report, expectedNames) {
  const demand = (condition, message) => { if (!condition) throw new Error(message); };
  demand(report && report.success === true, 'Vitest did not report success');
  demand(Array.isArray(report.testResults) && report.testResults.length > 0, 'No test files were received');
  const expected = new Set(expectedNames);
  const actual = new Set(report.testResults.map(row => row.name));
  demand(expected.size > 0 && actual.size === report.testResults.length, 'Empty expected set or duplicate file reports');
  demand(actual.size === expected.size && [...expected].every(name => actual.has(name)), 'Expected test files are missing or unexpected files were reported');
  demand(report.testResults.every(row => row.status === 'passed' && Array.isArray(row.assertionResults)), 'An entire test file did not pass');
  const assertions = report.testResults.flatMap(row => row.assertionResults);
  demand(Number.isInteger(report.numTotalTests) && report.numTotalTests > 0, 'Invalid assertion count');
  demand(report.numTotalTests === report.numPassedTests && report.numTotalTests === assertions.length, 'Assertion counts are incomplete');
  demand(['numFailedTests', 'numPendingTests', 'numTodoTests'].every(key => report[key] === 0), 'Failed, skipped or todo cases were reported');
  demand(assertions.every(row => row.status === 'passed'), 'An assertion did not pass');
  return { status: 'PASS', files: actual.size, tests: assertions.length, failed: 0, pending: 0, todo: 0 };
}

function globMatcher(pattern) {
  let source = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    if (pattern.slice(i, i + 3) === '**/') { source += '(?:.*/)?'; i += 2; }
    else if (pattern[i] === '*') source += '[^/]*';
    else source += pattern[i].replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  }
  return new RegExp(source + '$');
}

const root = process.cwd();
const config = fs.readFileSync(path.join(root, 'tests/model-selection/integrated.vitest.config.mts'), 'utf8');
const include = config.match(/include:\s*\[([\s\S]*?)\]/);
if (!include) throw new Error('Canonical Vitest include list is missing');
const patterns = [...include[1].matchAll(/'([^']+)'/g)].map(match => globMatcher(match[1]));
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return ['.git', 'node_modules', '.next'].includes(entry.name) ? [] : walk(absolute);
    return entry.isFile() ? [path.relative(root, absolute).split(path.sep).join('/')] : [];
  });
}
const expected = walk(root).filter(name => patterns.some(pattern => pattern.test(name)));
if (!process.argv[2]) throw new Error('Pass the JSON report path');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (Array.isArray(report.testResults)) report.testResults = report.testResults.map(row => ({
  ...row, name: path.relative(root, path.resolve(root, row.name)).split(path.sep).join('/'),
}));
console.log(JSON.stringify(validateVitestReport(report, expected)));
