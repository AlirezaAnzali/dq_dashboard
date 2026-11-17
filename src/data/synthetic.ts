import csv from '../../synthetic-dq-results.csv?raw';

export type Dimension = 'Completeness' | 'Validity';
export type DQRow = {
  id: string; table: string; month: string; cde: string; dimension: Dimension;
  recordsEvaluated: number | null; recordsPassed: number | null;
  amountEvaluated: number | null; amountPassed: number | null;
  recordThreshold: number | null; amountThreshold: number | null;
};

export type OverviewFilters = {month: string; dataset: string; dimension: string};

// The committed CSV contains one physical line per evaluation and uses standard CSV quoting.
function fields(line: string) {
  return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(cell => cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell);
}

const [header, ...records] = csv.trim().split(/\r?\n/);
const columns = fields(header);
const numeric = (value: string) => value === '' ? null : Number(value);
export const rows: DQRow[] = records.map(line => {
  const cells = fields(line);
  const row = Object.fromEntries(columns.map((column, index) => [column, cells[index]]));
  return {
    id: row.CDE_ID, table: row.TableName, month: row.ReportingMonth.slice(0, 7), cde: row.CDE_Name,
    dimension: row.DQ_Dimension as Dimension,
    recordsEvaluated: numeric(row.Record_Evaluated), recordsPassed: numeric(row.Record_Passed),
    amountEvaluated: numeric(row.Amount_Evaluated), amountPassed: numeric(row.Amount_Passed),
    recordThreshold: numeric(row.Record_Threshold), amountThreshold: numeric(row.Amount_Threshold),
  };
});

export const datasets = [...new Set(rows.map(row => row.table))].sort();
export const months = [...new Set(rows.map(row => row.month))].sort();
export const dimensions = [...new Set(rows.map(row => row.dimension))].sort();
export const sampleCSV = () => csv;

export function overviewRows({month, dataset, dimension}: OverviewFilters) {
  return rows.filter(row => row.month === month && row.table === dataset && row.dimension === dimension);
}
