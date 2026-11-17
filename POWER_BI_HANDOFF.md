# Power BI handoff

Use [synthetic-dq-results.csv](synthetic-dq-results.csv) as the only imported fact source. The React prototype reads and downloads this exact file. It contains 504 synthetic evaluations for four tables and six months, April–September 2026.

## Dataset

Grain and primary key are (TableID, CDE_ID, DQ_Dimension, ReportingMonth). The current CSV has one evaluation per key and one stable dimension per CDE. CDE_ID is globally unique across tables and repeats across months. TableName and CDE_Name are display labels. If production has separate rules at this grain, add a stable RuleID to the key and agree on rule-to-CDE rollup before reporting.

| Field | Power BI type | Meaning |
|---|---|---|
| ReportingMonth | Date | First day of month, ISO YYYY-MM-DD |
| TableID | Text | Stable table key |
| TableName | Text | Table A–D display name |
| CDE_ID | Text | Stable table-qualified CDE key |
| CDE_Name | Text | CDE display name |
| DQ_Dimension | Text | Completeness or Validity |
| Record_Evaluated, Record_Passed | Whole number | Evaluation observations and passing observations |
| Amount_Evaluated, Amount_Passed | Fixed decimal | Eligible and passed non-negative CAD exposure, in dollars |
| Record_Threshold, Amount_Threshold | Fixed decimal | Metric-specific thresholds on the 0–1 scale |

Blank inputs and zero denominators produce a blank rate. A metric is assessed against its threshold only when its rate and threshold are both present. A CDE fails if any assessed metric fails, passes if at least one was assessed and none failed, and is otherwise unassessed. A threshold equality passes. Use signed percentage points for gaps and format rates as 0.00%. Display N/A for unavailable metrics and trends. For production CAD, retain cents or use a common integer minor-unit convention throughout.

## Model and filter behavior

- Use synced, single-select slicers for TableName and DQ_Dimension across all pages. Use CDE_ID for drill-through and the Deep Dive selector, with CDE_Name shown to users.
- Use a disconnected Reporting Selection table based on distinct ReportingMonth values. Relate a separate Month dimension to DQ[ReportingMonth] for chart axes. Current measures apply the selected month with TREATAS. Overview and Deep Dive chart measures use the axis month through the selected endpoint. Exceptions uses the latest six available months through that endpoint. Preserve table, dimension, and CDE context when replacing month filters.
- Prior period means the preceding available month in the calendar, not the last observed result for the CDE. A missing or unassessed CDE result cannot establish a new or resolved breach. Consecutive breach duration starts at the selected month and stops at the first pass, unassessed, or missing result.
- Exposure-weighted rates sum eligible numerators and denominators once per fact key. The synthetic file represents evaluation exposures and carries no underlying record identifiers. A record evaluated for several rules may contribute several observations. Obtain business approval for this exposure-based aggregation. If the production metric is unique records or unique balances across overlapping CDEs, deduplicate upstream using source keys and agree on the rollup before publication.

## Required DAX

Name the fact table DQ. Define these calculated columns on DQ, derived from the raw inputs.

```dax
Record Row Rate = DIVIDE ( DQ[Record_Passed], DQ[Record_Evaluated] )
Amount Row Rate = DIVIDE ( DQ[Amount_Passed], DQ[Amount_Evaluated] )
Record Gap =
IF ( NOT ISBLANK ( DQ[Record Row Rate] ) && NOT ISBLANK ( DQ[Record_Threshold] ),
     DQ[Record Row Rate] - DQ[Record_Threshold] )
Amount Gap =
IF ( NOT ISBLANK ( DQ[Amount Row Rate] ) && NOT ISBLANK ( DQ[Amount_Threshold] ),
     DQ[Amount Row Rate] - DQ[Amount_Threshold] )
Worst Gap =
VAR R = DQ[Record Gap]
VAR A = DQ[Amount Gap]
RETURN IF ( ISBLANK ( R ), A, IF ( ISBLANK ( A ), R, MIN ( R, A ) ) )
Breach Status =
IF ( ISBLANK ( DQ[Worst Gap] ), "N/A", IF ( DQ[Worst Gap] < 0, "Fail", "Pass" ) )
Failed Metric =
SWITCH ( TRUE (),
    DQ[Record Gap] < 0 && DQ[Amount Gap] < 0, "Both",
    DQ[Record Gap] < 0, "Record Count",
    DQ[Amount Gap] < 0, "Dollar Amount",
    BLANK () )
```

Base measures work in the current month or chart-axis context.

```dax
Record Pass Rate =
VAR Eligible = FILTER ( DQ, NOT ISBLANK ( DQ[Record Row Rate] ) )
RETURN DIVIDE ( SUMX ( Eligible, DQ[Record_Passed] ), SUMX ( Eligible, DQ[Record_Evaluated] ) )
Dollar Pass Rate =
VAR Eligible = FILTER ( DQ, NOT ISBLANK ( DQ[Amount Row Rate] ) )
RETURN DIVIDE ( SUMX ( Eligible, DQ[Amount_Passed] ), SUMX ( Eligible, DQ[Amount_Evaluated] ) )
Evaluated CDEs = DISTINCTCOUNT ( DQ[CDE_ID] )
Breached CDEs =
COALESCE ( CALCULATE ( DISTINCTCOUNT ( DQ[CDE_ID] ), DQ[Breach Status] = "Fail" ), 0 )
Passing CDEs =
COALESCE ( CALCULATE ( DISTINCTCOUNT ( DQ[CDE_ID] ), DQ[Breach Status] = "Pass" ), 0 )
Selected Month = SELECTEDVALUE ( 'Reporting Selection'[ReportingMonth] )
Current Breaches =
VAR SelectedPeriod = [Selected Month]
RETURN CALCULATE ( [Breached CDEs], REMOVEFILTERS ( 'Month' ),
    TREATAS ( { SelectedPeriod }, 'Month'[ReportingMonth] ) )
Worst Gap pp = 100 * SELECTEDVALUE ( DQ[Worst Gap] )
```

Implement the remaining measures using these rules.

| Measure | Definition |
|---|---|
| Current record rate, dollar rate, evaluated and passing CDEs | Apply the Current Breaches month-context pattern to each base measure. Divide passing or failing by evaluated CDEs for card shares. |
| Prior Breaches / Change | Evaluate Breached CDEs in the prior month. Subtract prior from current. Return blank for the comparison when no prior calendar month exists. |
| New, Persistent, Resolved | Use CALCULATETABLE and VALUES(DQ[CDE_ID]) for assessed Fail and Pass sets in each month. Count INTERSECT(current Fail, prior Pass), INTERSECT(current Fail, prior Fail), and INTERSECT(prior Fail, current Pass). Return blank when no prior month exists. |
| Consecutive Breach Months | For each current CDE, evaluate status on the ordered month dimension through the endpoint. Count months after the last non-fail month, including the current month. Include missing CDE-months as breaks. |
| Trend | For a current breach with a comparable prior gap, return New if prior passed. Otherwise compare signed worst gaps. Stable means the same gap at two displayed percentage-point decimals. A larger gap is Improving and a smaller gap is Worsening. Return blank when prior result is unavailable. |
| Monthly pass rates and counts | Use the base measures on the Month axis. Return blank beyond Selected Month. For Exceptions also hide months earlier than the last six available months. Use a second latest-point-only series if a selected-month marker needs separate formatting. |
| Distribution count and share | Evaluate Current Breaches under each Failed Metric category. Divide by Current Breaches with the category filter cleared. Keep the zero count in the companion legend and give it no arc. |
| Lowest pass-rate cards | TOPN(1) over current eligible CDEs sorted by the metric ascending and a stable tie order. Show the chosen CDE, its rate and its own threshold. Return blank when no eligible CDE exists. |
| Deep Dive quantities | Use current evaluated and passed inputs and their difference for failed counts or amounts. Return blank if either input is missing. Use metric-specific gap columns for rule details. |

## Visual mapping

| Page | Native implementation |
|---|---|
| Overview | Three Cards for weighted record and amount rates and Evaluated CDEs. Line chart with month and two rate measures. Cards for lowest rates and breached CDE count. Priority exceptions Table at failed-metric grain. For this table, use a derived Power Query reference that expands each evaluation into metric rows, filters to breached metrics, and relates to the same slicer dimensions. Keep this view out of core aggregation. |
| CDE Performance | Three Cards for evaluated, passing and failing CDEs. Searchable CDE slicer and sortable Table with CDE, dimension, rates, thresholds, worst gap and status. Use CDE_ID drill-through to reach Deep Dive. |
| CDE Deep Dive | CDE slicer, four Cards for rates and evaluated volume, two-series monthly Line chart, and Table or multi-row Card for rule details and status. |
| Exceptions & Trends | Four Cards for current, new, persistent and resolved counts. Blue monthly Line chart with current-point emphasis and dynamic subtitle. Native Donut by Failed Metric with percent data labels and a center total. Use a small companion Table or Matrix for category names and counts, including zero categories. Current Breaches is a Table of breached CDEs sorted by worst gap, with separate rates, thresholds, duration and trend, and conditional font colors. |

## Migration decisions and native equivalents

- React row-click navigation maps to native drill-through via a drill-through button or context menu. Retain the CDE slicer as the direct entry point and use the native Back button. The exact React row-click gesture and filtering interaction need a native acceptance check. [Microsoft drill-through documentation](https://learn.microsoft.com/power-bi/create-reports/desktop-drillthrough)
- Use native donut percentage labels and center value. Exact in-ring label placement is controlled by Power BI and can vary by viewport. Use the native companion Table for fixed legend alignment and zero categories. [Microsoft donut documentation](https://learn.microsoft.com/power-bi/visuals/power-bi-visualization-doughnut-charts)
- The prototype's Download Dataset button returns the entire source. For Power BI, distribute the approved CSV separately or use an authorized download link. Standard visual exports follow the visual filter context and do not replace the source file.
- Confirm threshold ownership, reporting currency, and the treatment of overlapping production populations before connecting live data. There is no PBIX in this handoff.

Run `npm run validate` and `npm run build` from this folder before handing off changes.
