import Overview,{DashboardFilters} from './Overview';
import {useState} from 'react';
import {LayoutDashboard,Table2,Search,TrendingUp,Database,ShieldCheck,AlertTriangle,CheckCircle2,ArrowLeft,Download,PlusCircle,Repeat2} from 'lucide-react';
import {LineChart,Line,CartesianGrid,XAxis,YAxis,Tooltip,Legend,ResponsiveContainer,PieChart,Pie,Cell,LabelList} from 'recharts';
import {months,overviewRows,sampleCSV,type DQRow,type OverviewFilters} from './data/synthetic';
import {amountGap,amountRate,breachSummary,evaluationHistory,gap,pct,pp,rateOrder,recordGap,recordRate,status} from './lib/metrics';
type Page='Overview'|'CDE Performance'|'CDE Deep Dive'|'Exceptions & Trends';
const nav:[Page,typeof LayoutDashboard][]=[['Overview',LayoutDashboard],['CDE Performance',Table2],['CDE Deep Dive',Search],['Exceptions & Trends',TrendingUp]];
const prettyMonth=(m:string)=>new Date(`${m}-02T12:00:00`).toLocaleDateString('en-CA',{month:'short',year:'numeric'});
const fmt=(n:number)=>n.toLocaleString('en-CA');
const currency=(n:number)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',notation:'compact',maximumFractionDigits:1}).format(n);
function Kpi({label,value,sub,tone='normal'}:{label:React.ReactNode;value:string;sub?:string;tone?:'normal'|'bad'|'good'}){return <div className={`kpi ${tone}`}><div className="kpi-label">{label}</div><div className="kpi-value">{value}</div>{sub&&<div className="kpi-sub">{sub}</div>}</div>}
function Section({title,children,extra}:{title:string;children:React.ReactNode;extra?:React.ReactNode}){return <section className="panel"><div className="panel-head"><h3>{title}</h3>{extra}</div><div className="panel-body">{children}</div></section>}
function RateChart({data}:{data:{month:string;record:number|null;amount:number|null}[]}){return <div className="chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{top:12,right:16,bottom:4,left:-10}}><CartesianGrid stroke="#e9eef5" vertical={false}/><XAxis dataKey="month" tickFormatter={prettyMonth} tick={{fontSize:11}}/><YAxis domain={[0.9,1]} tickFormatter={v=>`${(v*100).toFixed(0)}%`} tick={{fontSize:11}}/><Tooltip formatter={(v:number)=>pct(v)} labelFormatter={prettyMonth}/><Legend/><Line name="Record Count" dataKey="record" stroke="#2155a4" strokeWidth={3} dot={{r:3}} connectNulls/><Line name="Dollar Amount" dataKey="amount" stroke="#0caaa3" strokeWidth={3} dot={{r:3}} connectNulls/></LineChart></ResponsiveContainer></div>}
function exportCSV(){
 const link=document.createElement('a');
 link.href=URL.createObjectURL(new Blob([sampleCSV()],{type:'text/csv;charset=utf-8'}));
 link.download='synthetic-dq-results.csv';
 link.click();
 setTimeout(()=>URL.revokeObjectURL(link.href),1000);
}
function Exceptions({filters}: {filters: OverviewFilters}) {
  const history = evaluationHistory(filters);
  const {latest, prior, newCount, persistent, resolved, distribution: counts, details} = breachSummary(history);
  const trendMonths = history.slice(-6);
  const peak = Math.max(...trendMonths.map(period => period.count));
  const tickStep = Math.max(1, Math.ceil((peak + 1) / 5));
  const upperBound = Math.ceil((peak + 1) / tickStep) * tickStep;
  const axisTicks = Array.from({length: upperBound / tickStep + 1}, (_, index) => index * tickStep);
  const change = prior ? latest.count - prior.count : null;
  const comparison = !prior || change === null ? 'first available period'
    : change === 0 ? 'same as ' + prettyMonth(prior.month)
    : Math.abs(change) + (change > 0 ? ' more than ' : ' fewer than ') + prettyMonth(prior.month);
  const distribution = [
    {name: 'Both Metrics', color: '#183c69', count: counts.Both},
    {name: 'Record Count Only', color: '#087c77', count: counts['Record Count']},
    {name: 'Dollar Amount Only', color: '#76b7e5', count: counts['Dollar Amount']},
  ];
  const donutSegments = distribution.filter(item => item.count > 0);
  const cards = [
    {label: 'Current Breaches', value: latest.count, Icon: AlertTriangle, tone: latest.count ? 'bad' : 'normal', sub: prior ? (change === 0 ? 'No change' : (change! > 0 ? '+' : '') + change) + ' vs. ' + prettyMonth(prior.month) : 'No previous period'},
    {label: 'New Breaches', value: newCount, Icon: PlusCircle, tone: newCount ? 'bad' : 'normal', sub: prior ? 'Passed in ' + prettyMonth(prior.month) : 'No previous period'},
    {label: 'Persistent Breaches', value: persistent, Icon: Repeat2, tone: persistent ? 'bad' : 'normal', sub: prior ? 'Also breached in ' + prettyMonth(prior.month) : 'No previous period'},
    {label: 'Resolved Breaches', value: resolved ?? null, Icon: CheckCircle2, tone: resolved ? 'good' : 'normal', sub: prior ? 'Recovered since ' + prettyMonth(prior.month) : 'No previous period'},
  ] as const;

  return <div className="exceptions-page">
    <div className="kpis">
      {cards.map(({label, value, Icon, tone, sub}) => <Kpi key={label} tone={tone} label={<><Icon size={15} aria-hidden="true"/>{label}</>}
        value={value === null ? '—' : fmt(value)}
        sub={sub}/>)}
    </div>
    <div className="two-cols exceptions-charts">
      <Section title="Monthly Exception Trend">
        <p className="exceptions-note"><strong>{latest.count} breached {latest.count === 1 ? 'CDE' : 'CDEs'}</strong> in {prettyMonth(latest.month)} · {comparison}</p>
        <div className="exceptions-trend-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendMonths.map(({month, count}) => ({month, count}))} margin={{top: 20, right: 18, left: 0, bottom: 8}}>
              <CartesianGrid stroke="#e9eef5" vertical={false}/>
              <XAxis dataKey="month" tickFormatter={month => prettyMonth(month).split(' ')[0]} tick={{fontSize: 11}} interval={0} padding={{left: 12, right: 12}}/>
              <YAxis allowDecimals={false} width={34} domain={[0, upperBound]} ticks={axisTicks}/>
              <Tooltip labelFormatter={prettyMonth}/>
              <Line dataKey="count" name="CDEs below threshold" stroke="#2155a4" strokeWidth={3} isAnimationActive={false}
                dot={({cx, cy, payload}) => <circle key={payload.month} cx={cx} cy={cy}
                  r={payload.month === latest.month ? 7 : 4.5} fill={payload.month === latest.month ? '#0b2b57' : '#2155a4'} stroke="white" strokeWidth={1.5}/>}>
                <LabelList dataKey="count" position="top" offset={10} fill="#123c70"/>
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Section>
      <Section title="Exception Distribution">
        <div className="exceptions-distribution">
          <div className="exceptions-donut" role="img" aria-label={latest.count + ' breached CDEs'}>
            {donutSegments.length ? <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donutSegments} isAnimationActive={false} dataKey="count" nameKey="name"
                  innerRadius="61%" outerRadius="94%" stroke="white" labelLine={false}
                  label={({cx, cy, midAngle, innerRadius, outerRadius, percent, index}) => {
                    const angle = -midAngle * Math.PI / 180;
                    const radius = (innerRadius + outerRadius) / 2;
                    return <text x={cx + radius * Math.cos(angle)} y={cy + radius * Math.sin(angle)}
                      textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}
                      fill={donutSegments[index]?.color === '#76b7e5' ? '#0b2b57' : 'white'}>
                      {Math.round(percent * 100)}%
                    </text>;
                  }}>
                  {donutSegments.map(item => <Cell key={item.name} fill={item.color}/>)}
                </Pie>
              </PieChart>
            </ResponsiveContainer> : <div className="exceptions-empty-ring" aria-hidden="true"/>}
            <strong className="exceptions-donut-total" aria-hidden="true">{latest.count}</strong>
          </div>
          <ul className="exceptions-legend">
            {distribution.map(item => <li key={item.name}>
              <span className="dot" style={{background: item.color}} aria-hidden="true"/>
              <span>{item.name}</span><strong>{item.count}</strong>
            </li>)}
          </ul>
        </div>
      </Section>
    </div>
    <Section title="Current Breaches">
      {details.length ? <div className="table-wrap"><table className="exceptions-current">
        <thead><tr>{['CDE Name', 'Failed Metric', 'Record Count Pass Rate (%)', 'Record Count Threshold (%)', 'Dollar Amount Pass Rate (%)', 'Dollar Amount Threshold (%)',
          'Worst Threshold Gap (pp)', 'Consecutive Breach Months', 'Trend'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{details.map(({row, metric, worst, duration, trend}) => <tr key={row.id}>
            <th scope="row">{row.cde}</th>
            <td>{metric}</td>
            <td className={(metric === 'Both' || metric === 'Record Count') ? 'negative' : undefined}>{pct(recordRate(row))}</td>
            <td>{pct(row.recordThreshold)}</td>
            <td className={(metric === 'Both' || metric === 'Dollar Amount') ? 'negative' : undefined}>{pct(amountRate(row))}</td>
            <td>{pct(row.amountThreshold)}</td>
            <td className="negative">{pp(worst)}</td>
            <td>{duration}</td>
            <td className={'breach-trend ' + trend.toLowerCase()}>{trend}</td>
          </tr>)}</tbody>
      </table></div> : <div className="empty">No CDEs below threshold in {prettyMonth(filters.month)} for this selection.</div>}
    </Section>
  </div>;
}

export default function App() {
 const [page,setPage]=useState<Page>('Overview');
 const [search,setSearch]=useState('');
 const [selected,setSelected]=useState<string>();
 const [sort,setSort]=useState<'worst'|'name'|'record'|'amount'>('worst');
 const [filters,setFilters]=useState<OverviewFilters>({month:'2026-09',dataset:'Table A',dimension:'Completeness'});
 const current=overviewRows(filters);
 const failures=current.filter(row=>status(row)==='Fail');
 const pass=current.filter(row=>status(row)==='Pass').length;
 const selectedRow=current.find(row=>row.id===selected)||current[0];
 const choose=(row:DQRow)=>{setSelected(row.id);setPage('CDE Deep Dive')};
 const sorted=current.filter(row=>row.cde.toLowerCase().includes(search.toLowerCase()))
   .sort((a,b)=>sort==='name'?a.cde.localeCompare(b.cde):sort==='record'?rateOrder(recordRate(a),recordRate(b)):sort==='amount'?rateOrder(amountRate(a),amountRate(b)):rateOrder(gap(a),gap(b)));

 return <div className="shell">
   <aside className="sidebar">
     <div className="brand"><ShieldCheck size={32}/><div>Banking<br/>Data Quality</div></div>
     <div className="nav">{nav.map(([name,Icon])=><button key={name} className={page===name?'active':''} onClick={()=>setPage(name)}><Icon size={18}/>{name}</button>)}</div>
     <div className="sidebar-foot"><Database size={17}/> SYNTHETIC DATA<br/><small>No company data used</small></div>
   </aside>
   <main className="main">
     <header>
       <div><div className="eyebrow">DATA GOVERNANCE / QUALITY MONITORING</div><h1>{page==='Overview'?'Data Quality Overview':page}</h1><p>Record Count & Dollar Amount</p></div>
       <button className="export" onClick={exportCSV}><Download size={16}/> Download Dataset</button>
     </header>
     <DashboardFilters filters={filters} onChange={setFilters} prettyMonth={prettyMonth}/>
     {page==='Overview'&&<Overview filters={filters} prettyMonth={prettyMonth}/>}
     {page==='CDE Performance'&&<>
       <div className="kpis three">
         <Kpi label="Total CDEs" value={fmt(current.length)}/>
         <Kpi label="Passing CDEs" value={fmt(pass)} sub={pct(current.length?pass/current.length:null)} tone="good"/>
         <Kpi label="Failing CDEs" value={fmt(failures.length)} sub={pct(current.length?failures.length/current.length:null)} tone="bad"/>
       </div>
       <Section title="All CDEs · Record Count and Dollar Amount" extra={<span className="muted">Click a row for drill-through</span>}>
         <div className="table-controls">
           <input aria-label="Search CDE" placeholder="Search CDE name..." value={search} onChange={e=>setSearch(e.target.value)}/>
           <select aria-label="Sort CDEs" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}>
             <option value="worst">Largest threshold gap first</option><option value="name">CDE name A–Z</option>
             <option value="record">Lowest record rate</option><option value="amount">Lowest amount rate</option>
           </select>
         </div>
         <div className="table-wrap"><table>
           <thead><tr><th>CDE</th><th>Dimension</th><th>Record Count</th><th>Dollar Amount</th><th>Record Target</th><th>Amount Target</th><th>Worst Gap</th><th>Status</th></tr></thead>
           <tbody>{sorted.map(row=><tr key={row.id} onClick={()=>choose(row)} tabIndex={0} onKeyDown={e=>{if(e.key==='Enter')choose(row)}} className="clickrow">
             <td className="cde-name">{row.cde}</td><td>{row.dimension}</td><td>{pct(recordRate(row))}</td><td>{pct(amountRate(row))}</td>
             <td>{pct(row.recordThreshold)}</td><td>{pct(row.amountThreshold)}</td><td className={(gap(row)??0)<0?'negative':'positive'}>{pp(gap(row))}</td>
             <td><span className={'status '+status(row).toLowerCase()}>{status(row)}</span></td>
           </tr>)}</tbody>
         </table></div>
         <div className="table-foot">Select any CDE to open its detailed analysis. All values are synthetic.</div>
       </Section>
     </>}
     {page==='CDE Deep Dive'&&<div className="filters">
       <label>Choose CDE
         <select value={selectedRow?.id ?? ''} onChange={event=>setSelected(event.target.value)} disabled={!current.length}>
           {!current.length&&<option value="">No CDEs available</option>}
           {[...current].sort((a,b)=>a.cde.localeCompare(b.cde)).map(row=><option key={row.id} value={row.id}>{row.cde}</option>)}
         </select>
       </label>
     </div>}
     {page==='CDE Deep Dive'&&selectedRow&&<>
       <div className="detail-head"><div>
         <button className="back" onClick={()=>setPage('CDE Performance')}><ArrowLeft size={15}/> All CDEs</button>
         <div className="eyebrow">{filters.dataset} · {selectedRow.dimension}</div><h2>{selectedRow.cde}</h2>
       </div><span className={'status '+status(selectedRow).toLowerCase()}>{status(selectedRow)==='Fail'?<AlertTriangle size={15}/>:<CheckCircle2 size={15}/>} {status(selectedRow)}</span></div>
       <div className="kpis">
         <Kpi label="Record Count Pass Rate" value={pct(recordRate(selectedRow))} sub={'Target '+pct(selectedRow.recordThreshold)}/>
         <Kpi label="Dollar Amount Pass Rate" value={pct(amountRate(selectedRow))} sub={'Target '+pct(selectedRow.amountThreshold)}/>
         <Kpi label="Records Evaluated" value={selectedRow.recordsEvaluated===null?'N/A':fmt(selectedRow.recordsEvaluated)} sub={selectedRow.recordsEvaluated===null||selectedRow.recordsPassed===null?undefined:fmt(selectedRow.recordsEvaluated-selectedRow.recordsPassed)+' failed records'}/>
         <Kpi label="Amount Evaluated" value={selectedRow.amountEvaluated===null?'N/A':currency(selectedRow.amountEvaluated)} sub={selectedRow.amountEvaluated===null||selectedRow.amountPassed===null?'Not applicable':currency(selectedRow.amountEvaluated-selectedRow.amountPassed)+' failed amount'}/>
       </div>
       <div className="two-cols">
         <Section title={'Monthly Trend · '+selectedRow.cde}>
           <RateChart data={months.filter(month=>month<=filters.month).map(month=>{
             const row=overviewRows({...filters,month}).find(item=>item.id===selectedRow.id);
             return {month,record:row?recordRate(row):null,amount:row?amountRate(row):null};
           })}/>
         </Section>
         <Section title="Rule Evaluation Details">
           <div className="facts">
             <div><span>Table</span><strong>{filters.dataset}</strong></div>
             <div><span>CDE Name</span><strong>{selectedRow.cde}</strong></div>
             <div><span>DQ Dimension</span><strong>{selectedRow.dimension}</strong></div>
             <div><span>Passed Records</span><strong>{selectedRow.recordsPassed===null?"N/A":fmt(selectedRow.recordsPassed)}</strong></div>
             <div><span>Failed Records</span><strong>{selectedRow.recordsEvaluated===null||selectedRow.recordsPassed===null?"N/A":fmt(selectedRow.recordsEvaluated-selectedRow.recordsPassed)}</strong></div>
             <div><span>Record Threshold Gap</span><strong>{pp(recordGap(selectedRow))}</strong></div>
             <div><span>Amount Threshold Gap</span><strong>{pp(amountGap(selectedRow))}</strong></div>
           </div>
           <p className="muted small">Synthetic rule metrics only. Rule descriptions and owners are intentionally not invented.</p>
         </Section>
       </div>
     </>}
     {page==='Exceptions & Trends'&&<Exceptions filters={filters}/>}
     <footer>Data Governance Office</footer>
   </main>
 </div>;
}
