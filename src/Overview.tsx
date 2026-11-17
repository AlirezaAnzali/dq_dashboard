import {CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis} from 'recharts';
import {datasets, months, dimensions, overviewRows, type OverviewFilters} from './data/synthetic';
import {aggregate, amountGap, amountRate, gap, pct, pp, rateOrder, recordGap, recordRate, status} from './lib/metrics';
import './overview.css';

const recordColor = '#2155a4';
const amountColor = '#087c77';

function KpiCard({label, value, valueClass}: {label: string; value: string | number; valueClass?: string}) {
  return <div className="kpi overview-rate">
    <div className="kpi-label">{label}</div>
    <div className={['kpi-value', valueClass].filter(Boolean).join(' ')}>{value}</div>
  </div>;
}

function LowestRate({label, cde, rate, threshold}: {
  label: string; cde?: string; rate: number | null; threshold: number | null;
}) {
  return <div>
    <span>{label}</span>
    {cde && <b className="overview-exception-cde">{cde}</b>}
    <strong className={rate !== null && threshold !== null && rate < threshold ? 'overview-warning-rate' : undefined}>{pct(rate)}</strong>
    {rate !== null && threshold !== null && <small>vs. threshold of {pct(threshold)}</small>}
  </div>;
}

function Panel({title, children}: {title: string; children: React.ReactNode}) {
  return <section className="panel">
    <div className="panel-head"><h3>{title}</h3></div>
    <div className="panel-body">{children}</div>
  </section>;
}

export function DashboardFilters({filters, onChange, prettyMonth}: {
  filters: OverviewFilters;
  onChange: (filters: OverviewFilters) => void;
  prettyMonth: (month: string) => string;
}) {
  return (
    <div className="filters dashboard-filters">
      <label className="overview-table-filter">Table
        <select value={filters.dataset} onChange={event => onChange({...filters, dataset: event.target.value})}>
          {datasets.map(dataset => <option key={dataset}>{dataset}</option>)}
        </select>
      </label>
      <label>Reporting Period
        <select value={filters.month} onChange={event => onChange({...filters, month: event.target.value})}>
          {months.map(month => <option key={month} value={month}>{prettyMonth(month)}</option>)}
        </select>
      </label>
      <label>DQ Dimension
        <select value={filters.dimension} onChange={event => onChange({...filters, dimension: event.target.value})}>
          {dimensions.map(dimension => <option key={dimension}>{dimension}</option>)}
        </select>
      </label>
    </div>
  );
}

export default function Overview({filters, prettyMonth}: {filters: OverviewFilters; prettyMonth: (month: string) => string}) {
  const current = overviewRows(filters);
  const metrics = aggregate(current);
  const history = months.filter(month => month <= filters.month).map(month => ({
    month, ...aggregate(overviewRows({...filters, month})),
  }));
  const observed = history.flatMap(({record, amount}) => [record, amount]).filter(rate => rate !== null);
  const lower = Math.max(0, Math.min(0.998, Math.floor((Math.min(1, ...observed) - 0.00005) * 2000) / 2000));
  const ticks = Array.from({length: 5}, (_, index) => lower + (1 - lower) * index / 4);
  const failures = current.filter(row => status(row) === 'Fail').sort((a, b) => rateOrder(gap(a), gap(b)));
  const lowestRecord = [...current].sort((a, b) => rateOrder(recordRate(a), recordRate(b)))[0];
  const lowestAmount = current.filter(row => amountRate(row) !== null)
    .sort((a, b) => (amountRate(a) ?? 1) - (amountRate(b) ?? 1))[0];

  return <div className="overview">
    <div className="overview-rates">
      <KpiCard label="Record Count Pass Rate" value={pct(metrics.record)} valueClass="overview-record"/>
      <KpiCard label="Dollar Amount Pass Rate" value={pct(metrics.amount)} valueClass="overview-amount"/>
      <KpiCard label="Evaluated CDEs" value={current.length}/>
    </div>
    <Panel title="Monthly Pass Rate Trend">
      <p className="overview-note">{filters.dataset} through {prettyMonth(filters.month)} · Y-axis {pct(lower)}–100%</p>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{top: 12, right: 18, bottom: 4, left: 4}}>
            <CartesianGrid stroke="#e9eef5" vertical={false}/>
            <XAxis dataKey="month" tickFormatter={prettyMonth} tick={{fontSize: 11}} padding={{left: 14, right: 14}}/>
            <YAxis domain={[lower, 1]} ticks={ticks} width={64} tickFormatter={pct} tick={{fontSize: 11}}/>
            <Tooltip formatter={(value: number) => pct(value)} labelFormatter={prettyMonth}/>
            <Legend/>
            <Line name="Record Count" dataKey="record" stroke={recordColor} strokeWidth={3} dot={{r: 4}}/>
            <Line name="Dollar Amount" dataKey="amount" stroke={amountColor} strokeWidth={3} dot={{r: 4}}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Panel>
    <Panel title="Priority CDE Exceptions">
      <div className="overview-exception-summary">
        <LowestRate label="Lowest Record Count Pass Rate" cde={lowestRecord?.cde}
          rate={lowestRecord ? recordRate(lowestRecord) : null} threshold={lowestRecord?.recordThreshold ?? null}/>
        <LowestRate label="Lowest Dollar Amount Pass Rate" cde={lowestAmount?.cde}
          rate={lowestAmount ? amountRate(lowestAmount) : null} threshold={lowestAmount?.amountThreshold ?? null}/>
        <div className={failures.length ? 'overview-threshold-count overview-warning' : 'overview-threshold-count'}>
          <span>CDEs Below Threshold</span>
          <strong>{failures.length}</strong>
          <small>of {current.length} evaluated CDEs</small>
        </div>
      </div>
      {failures.length ?
        <div className="table-wrap">
        <table className="overview-breaches">
          <thead><tr><th scope="col">CDE</th><th scope="col">Dimension</th><th scope="col">Metric Below Threshold</th><th scope="col">Pass Rate</th><th scope="col">Threshold</th><th scope="col">Gap</th></tr></thead>
          <tbody>{failures.flatMap(row => {
            const breaches = [
              {name: 'Record Count', rate: recordRate(row), threshold: row.recordThreshold, gap: recordGap(row)},
              {name: 'Dollar Amount', rate: amountRate(row), threshold: row.amountThreshold, gap: amountGap(row)},
            ];
            return breaches.map(({name, rate, threshold, gap}) => gap !== null && gap < 0 &&
              <tr key={row.id + '|' + name}>
                <th scope="row">{row.cde}</th><td>{row.dimension}</td><td>{name}</td>
                <td>{pct(rate)}</td><td>{pct(threshold)}</td>
                <td className="negative">{pp(gap)}</td>
              </tr>);
          })}</tbody>
        </table>
      </div> : <div className="empty">No CDEs below their applicable thresholds for this selection.</div>}
    </Panel>
  </div>;
}
