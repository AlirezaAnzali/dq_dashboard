# Banking Data Quality Dashboard — Synthetic React Prototype

A four-page interactive dashboard for **design review**, not a production banking report.

## Run locally

Requires Node.js 20+ and npm.

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (normally http://localhost:5173).

For a production bundle: `npm run build`.

## Pages

1. **Overview:** weighted record and dollar pass rates, month-over-month trends, dimension comparison, priority exceptions.
2. **CDE Performance:** searchable, sortable CDE table; click a row to drill through.
3. **CDE Deep Dive:** CDE-specific history, pass/fail counts, amounts and threshold gaps.
4. **Exceptions & Trends:** threshold breaches, historical trends, worst gaps.

## Model and business rules

- Each CDE has a stable table-qualified identifier.
- Table, reporting month, and DQ dimension filter the report. The reporting month sets the endpoint for historical charts.
- Record pass rate = sum(passed records) / sum(evaluated records).
- Dollar amount pass rate = sum(passed eligible amount) / sum(evaluated eligible amount).
- N/A amounts are **excluded** from amount-rate denominators.
- Each CDE is **Fail** if either applicable metric is below its own threshold; otherwise **Pass**.
- The worst threshold gap is the minimum percentage-point difference between applicable metric and threshold.
- Overall metrics are weighted ratios, **not** an average of per-CDE percentages.
- The prototype intentionally has no unapproved composite DQ score, remediation statuses, or invented rule owners.
- All data is synthetic. The app reads and exports the same `synthetic-dq-results.csv` file. See [POWER_BI_HANDOFF.md](POWER_BI_HANDOFF.md) for the schema and measure definitions.

## Security and handoff

All included data is fictional. Do not insert real bank data, internal schema details, source connection strings, or screenshots into this project or external tools. A corporate device transfer requires an explicitly approved channel and security review. The prototype can also serve as a specification to reproduce the dashboard manually in Power BI Desktop.

## Next iteration

Review page layout, KPI definitions, threshold rules, filtering behavior, and desired visual changes before implementing a Power BI project.
