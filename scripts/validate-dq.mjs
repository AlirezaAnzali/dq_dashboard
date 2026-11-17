import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function load(file, dependencies) {
  const exports = {};
  const {outputText} = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: {target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true},
  });
  new Function('exports', 'require', outputText)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), 'Unexpected validation dependency ' + name);
    return dependencies[name];
  });
  return exports;
}

const csv = readFileSync(new URL('../synthetic-dq-results.csv', import.meta.url), 'utf8');
const data = load('../src/data/synthetic.ts', {'../../synthetic-dq-results.csv?raw': csv});
const metrics = load('../src/lib/metrics.ts', {'../data/synthetic': data});
const {rows, months, datasets, dimensions, overviewRows, sampleCSV} = data;
const {recordRate, amountRate, status, gap, failedMetric, aggregate, evaluationHistory, breachSummary} = metrics;
assert.equal(sampleCSV(), csv);
assert.match(csv, /^ReportingMonth,|^"ReportingMonth",/);
assert.deepEqual(datasets, ['Table A', 'Table B', 'Table C', 'Table D']);
assert.deepEqual(dimensions, ['Completeness', 'Validity']);
assert.deepEqual(months, ['2026-04','2026-05','2026-06','2026-07','2026-08','2026-09']);
const keys = new Set();
const identities = new Map();
for (const row of rows) {
  const key = [row.table, row.id, row.dimension, row.month].join('~');
  assert.ok(!keys.has(key), 'Duplicate evaluation ' + key);
  keys.add(key);
  const identity = [row.table, row.cde, row.dimension].join('~');
  assert.equal(identities.get(row.id) ?? identity, identity);
  identities.set(row.id, identity);
  assert.match(row.id, new RegExp('^' + row.table.at(-1) + '\\|'));
  for (const [passed, evaluated, threshold, rate] of [
    [row.recordsPassed, row.recordsEvaluated, row.recordThreshold, recordRate(row)],
    [row.amountPassed, row.amountEvaluated, row.amountThreshold, amountRate(row)],
  ]) {
    if (evaluated === null) {
      assert.equal(passed, null);
      assert.equal(threshold, null);
      assert.equal(rate, null);
    } else {
      assert.ok(Number.isInteger(passed) && Number.isInteger(evaluated) && passed >= 0 && passed <= evaluated);
      assert.ok(Number.isFinite(threshold) && threshold >= 0 && threshold <= 1);
      if (evaluated > 0) assert.ok(rate >= 0 && rate <= 1);
      else assert.equal(rate, null);
    }
  }
  const recordFails = row.recordsEvaluated > 0 && row.recordThreshold !== null &&
    row.recordsPassed < row.recordsEvaluated * row.recordThreshold;
  const amountFails = row.amountEvaluated > 0 && row.amountThreshold !== null &&
    row.amountPassed < row.amountEvaluated * row.amountThreshold;
  assert.equal(failedMetric(row), recordFails && amountFails ? 'Both' : recordFails ? 'Record Count' : amountFails ? 'Dollar Amount' : null);
  assert.equal(status(row) === 'Fail', recordFails || amountFails);
}

let combinations = 0;
for (const dataset of datasets) for (const dimension of dimensions) for (const month of months) {
  const filters = {dataset, dimension, month};
  const current = overviewRows(filters);
  assert.ok(current.length);
  const history = evaluationHistory(filters);
  const summary = breachSummary(history);
  const distinct = new Set(current.filter(row => status(row) === 'Fail').map(row => row.id));
  assert.equal(summary.latest.month, month);
  assert.equal(history.length, months.indexOf(month) + 1);
  assert.equal(summary.latest.count, distinct.size);
  assert.equal(summary.details.length, distinct.size);
  assert.deepEqual(new Set(summary.details.map(item => item.row.id)), distinct);
  assert.equal(Object.values(summary.distribution).reduce((a,b) => a+b), distinct.size);
  assert.ok(summary.details.every((item, i) => item.duration >= 1 && item.duration <= history.length &&
    item.worst === gap(item.row) && (!i || summary.details[i-1].worst <= item.worst)));
  for (const [name, passed, evaluated] of [
    ['record','recordsPassed','recordsEvaluated'], ['amount','amountPassed','amountEvaluated'],
  ]) {
    const sum = key => current.reduce((total,row) => total + (row[key] ?? 0), 0);
    assert.equal(aggregate(current)[name], sum(evaluated) ? sum(passed) / sum(evaluated) : null);
  }
  combinations++;
}

const row = rows[0];
const unassessed = {...row, recordsPassed: 0, recordsEvaluated: 0, amountPassed: null, amountEvaluated: null, amountThreshold: null};
assert.equal(recordRate(unassessed), null);
assert.equal(gap(unassessed), null);
assert.equal(status(unassessed), 'N/A');
const failed = {...row, recordsPassed: 0, recordThreshold: 0.99};
const period = (month, evaluations, breaches) => ({month, evaluations: new Map(evaluations.map(r => [r.id,r])), breaches, count: breaches.length});
const prior = period('2026-04', [], []);
const breach = period('2026-05', [failed], [failed]);
const missing = period('2026-06', [unassessed], []);
assert.equal(breachSummary([prior, breach]).newCount, 0);
assert.equal(breachSummary([prior, breach]).details[0].trend, 'N/A');
assert.equal(breachSummary([breach, missing]).resolved, 0);
assert.equal(breachSummary([missing, breach]).newCount, 0);
console.log('Validated ' + rows.length + ' evaluations, ' + combinations + ' filter combinations, and missing/zero-denominator cases.');
