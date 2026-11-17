import {months, overviewRows, type DQRow, type OverviewFilters} from '../data/synthetic';

export const ratio = (passed: number | null, evaluated: number | null) =>
  passed !== null && evaluated !== null && evaluated > 0 ? passed / evaluated : null;
export const pct = (value: number | null) => value === null ? 'N/A' : (value * 100).toFixed(2) + '%';
export const pp = (value: number | null) => value === null ? 'N/A' :
  (value >= 0 ? '+' : '') + (value * 100).toFixed(2) + ' pp';

export const recordRate = (row: DQRow) => ratio(row.recordsPassed, row.recordsEvaluated);
export const amountRate = (row: DQRow) => ratio(row.amountPassed, row.amountEvaluated);
const thresholdGap = (rate: number | null, threshold: number | null) =>
  rate === null || threshold === null ? null : rate - threshold;
export const recordGap = (row: DQRow) => thresholdGap(recordRate(row), row.recordThreshold);
export const amountGap = (row: DQRow) => thresholdGap(amountRate(row), row.amountThreshold);

export function gap(row: DQRow) {
  const applicable = [recordGap(row), amountGap(row)].filter(value => value !== null);
  return applicable.length ? Math.min(...applicable) : null;
}

export const status = (row: DQRow) => {
  const worst = gap(row);
  return worst === null ? 'N/A' : worst < 0 ? 'Fail' : 'Pass';
};

export function failedMetric(row: DQRow) {
  const record = (recordGap(row) ?? 0) < 0;
  const amount = (amountGap(row) ?? 0) < 0;
  return record && amount ? 'Both' : record ? 'Record Count' : amount ? 'Dollar Amount' : null;
}

export function aggregate(rows: DQRow[]) {
  // Sum evaluation exposures. Distinct underlying records cannot be inferred from evaluation totals.
  const records = rows.filter(row => recordRate(row) !== null);
  const amounts = rows.filter(row => amountRate(row) !== null);
  return {
    record: ratio(records.reduce((sum, row) => sum + row.recordsPassed!, 0),
      records.reduce((sum, row) => sum + row.recordsEvaluated!, 0)),
    amount: ratio(amounts.reduce((sum, row) => sum + row.amountPassed!, 0),
      amounts.reduce((sum, row) => sum + row.amountEvaluated!, 0)),
  };
}

export const rateOrder = (a: number | null, b: number | null) => (a ?? Infinity) === (b ?? Infinity)
  ? 0 : (a ?? Infinity) - (b ?? Infinity);

export function evaluationHistory(filters: OverviewFilters) {
  return months.filter(month => month <= filters.month).map(month => {
    const evaluations = new Map(overviewRows({...filters, month}).map(row => [row.id, row]));
    const breaches = [...evaluations.values()].filter(row => status(row) === 'Fail');
    return {month, evaluations, breaches, count: breaches.length};
  });
}

export function breachSummary(history: ReturnType<typeof evaluationHistory>) {
  const latest = history[history.length - 1];
  const prior = history[history.length - 2];
  const previousStatus = (row: DQRow) => {
    const evaluation = prior?.evaluations.get(row.id);
    return evaluation ? status(evaluation) : 'N/A';
  };
  const current = [...latest.breaches].sort((a, b) => rateOrder(gap(a), gap(b)));
  const newCount = prior ? current.filter(row => previousStatus(row) === 'Pass').length : null;
  const persistent = prior ? current.filter(row => previousStatus(row) === 'Fail').length : null;
  const resolved = prior?.breaches.filter(row => {
    const evaluation = latest.evaluations.get(row.id);
    return evaluation && status(evaluation) === 'Pass';
  }).length ?? null;
  const distribution = {'Both': 0, 'Record Count': 0, 'Dollar Amount': 0};
  const details = current.map(row => {
    const metric = failedMetric(row)!;
    distribution[metric]++;
    const previous = prior?.evaluations.get(row.id);
    const worst = gap(row)!;
    const previousGap = previous ? gap(previous) : null;
    const trend = previousGap === null ? 'N/A' : previousGap >= 0 ? 'New'
      : pp(worst) === pp(previousGap) ? 'Stable' : worst > previousGap ? 'Improving' : 'Worsening';
    let duration = 0;
    for (let index = history.length - 1; index >= 0; index--) {
      const result = history[index].evaluations.get(row.id);
      if (!result || status(result) !== 'Fail') break;
      duration++;
    }
    return {row, metric, worst, trend, duration};
  });
  return {latest, prior, newCount, persistent, resolved, distribution, details};
}
