/*
    AE Executive Summary — SAC Custom Widget

    Split off from the original "AE Snap Report" widget on 2026-09-13, per
    Blair: leadership wants a lean "at a glance" view of Annual Enrollment
    progress, distinct from the detailed operational dashboard (see the
    sibling sac-ae-operational-widget project). Both widgets bind to the
    SAME underlying model (AM_EMPLOYER_ENROLLMENT_SUMMARY) rather than two
    separate cubes — this widget's main.js just doesn't render the
    operational-only row-kinds (Multiple Attempts / Stalled buckets /
    Recently Completed / per-status-per-synod detail) even though they're
    present in the bound data. See BUILD_PLAN_VWEMPLOYERSAVES.md in the
    sac-ae-snap-report-widget folder, "Dashboard split", for the full
    reasoning and the combined-cube SQL both widgets share.

    Data binding (declared in widget.json), following SAC's standard
    ResultSet row shape ({ data: [ { dimensions_0: {id,label}, ...,
    measures_0: {raw,formatted}, ... } ] }) — identical shape to the
    original widget's employerStatus binding:

      - employerStatus  <- DS_EMPLOYER_ENROLLMENT_SUMMARY /
                            AM_EMPLOYER_ENROLLMENT_SUMMARY
            dimensions_0 = Status (Success / Abandoned / Not Started /
                            In Progress / Needs Follow-up / "" for
                            election-type, HSA, YoY, operational, or
                            timeline rows)
            dimensions_1 = Synod/Region ("" for non-geography rows)
            dimensions_2 = Election_Category — carries several different
                            "kinds" of value depending on row-kind (see
                            dimensions_4 to disambiguate the health-plan
                            ones): a Health_Plan_Bundle name (when Year is
                            populated), "HSA Annual/One Time - Elected
                            0/>0", "Eligible Count", or "" for plain
                            status/synod/timeline rows. This widget also
                            ignores (but safely tolerates) the operational-
                            only values ("Multiple Attempts", "Stalled ...
                            Days", "Recently Completed") — they just never
                            match any branch this widget's parser checks.
            dimensions_3 = Date (Completed_Date; "" for all other row-
                            kinds) — not rendered by this widget (no
                            Timeline panel here), but still parsed so
                            those rows don't fall through into the wrong
                            bucket.
            dimensions_4 = Year — populated only on Health_Plan_Bundle
                            (2027) / "Bucket" (2026) / "Eligible Count"
                            rows; "" on every other row-kind.
            measures_0   = Employer Count (unused on "Eligible Count"
                            rows — that row-kind's total rides in
                            measures_1 instead)
            measures_1   = Employee Count on Status/Synod rows; repurposed
                            to carry SUM(EligibleCount) on "Eligible
                            Count" rows specifically

    Until wired to the real Datasphere-backed model, the widget renders
    from the MOCK_* constants below so the layout can be built and
    reviewed standalone (see preview.html).

    No in-widget filter controls by design: SAC's Optimized-story View mode
    doesn't deliver internal click/change events to a custom widget's shadow
    DOM (confirmed on the original widget — see its README "Known
    limitation"). Filtering belongs in SAC's native Input Control instead.
*/
(function () {
    "use strict";

    // ---- Statuses — same real Enrollment_Status vocabulary as the
    // original widget (GLD_AE_Employer_Enrollment's CASE mapping) ----
    const COMPLETED_STATUSES = ["Success"];
    const DEFAULTED_STATUSES = []; // no real "Defaulted" status value exists yet
    const OPEN_STATUSES = ["Abandoned", "Not Started", "In Progress", "Needs Follow-up"];

    // ---- Mock data (mirrors the real SAC ResultSet row shape; same shape
    // as the original widget's MOCK_EMPLOYER_STATUS, reused here so both
    // widgets can be developed/tested against equivalent sample data) ----
    function row(dims, measures) {
        const out = {};
        dims.forEach((d, i) => { out["dimensions_" + i] = { id: d, label: d }; });
        measures.forEach((m, i) => { out["measures_" + i] = { raw: m, formatted: String(m) }; });
        return out;
    }

    const MOCK_EMPLOYER_STATUS = { data: [
        row(["Success", "Southwestern Minnesota", "", "", ""], [53, 265]),
        row(["Not Started", "Southwestern Minnesota", "", "", ""], [5, 20]),
        row(["In Progress", "Southwestern Minnesota", "", "", ""], [2, 10]),
        row(["Abandoned", "Southwestern Minnesota", "", "", ""], [3, 12]),
        row(["Needs Follow-up", "Southwestern Minnesota", "", "", ""], [2, 8]),
        row(["Success", "Metropolitan Chicago", "", "", ""], [36, 361]),
        row(["Not Started", "Metropolitan Chicago", "", "", ""], [8, 50]),
        row(["In Progress", "Metropolitan Chicago", "", "", ""], [4, 25]),
        row(["Abandoned", "Metropolitan Chicago", "", "", ""], [2, 9]),
        row(["Needs Follow-up", "Metropolitan Chicago", "", "", ""], [2, 13]),
        row(["Success", "Southeastern Synod", "", "", ""], [18, 120]),
        row(["Not Started", "Southeastern Synod", "", "", ""], [4, 20]),
        row(["In Progress", "Southeastern Synod", "", "", ""], [3, 13]),
        row(["Abandoned", "Southeastern Synod", "", "", ""], [1, 4]),
        // Health-plan bucket breakdown, carrying both years for YoY.
        row(["", "", "Value Copay", "", "2027"], [42]),
        row(["", "", "Select Copay", "", "2027"], [31]),
        row(["", "", "Value HDHP", "", "2027"], [22]),
        row(["", "", "Select HDHP", "", "2027"], [12]),
        row(["", "", "Value Copay", "", "2026"], [35]),
        row(["", "", "Select Copay", "", "2026"], [29]),
        row(["", "", "Value HDHP", "", "2026"], [28]),
        row(["", "", "Select HDHP", "", "2026"], [9]),
        // HSA collapsed 2-bucket-per-type scheme — not rendered by this
        // widget, kept in mock data only so the parser's tolerance of
        // unrendered row-kinds is exercised too.
        row(["", "", "HSA Annual - Elected 0", "", ""], [66]),
        row(["", "", "HSA Annual - Elected >0", "", ""], [47]),
        row(["", "", "HSA One Time - Elected 0", "", ""], [98]),
        row(["", "", "HSA One Time - Elected >0", "", ""], [15]),
        // Eligible Count YoY, from vEmployerEligibleCount.
        row(["", "", "Eligible Count", "", "2026"], [null, 1240]),
        row(["", "", "Eligible Count", "", "2027"], [null, 1310]),
        // Timeline rows — not rendered by this widget, kept in mock data
        // only to exercise the parser's tolerance of unrendered row-kinds.
        row(["", "", "", "2026-10-01", ""], [14]),
        row(["", "", "", "2026-10-02", ""], [22]),
        // Operational-only row-kinds — this widget never reads these, but
        // they're included here to confirm the shared parser safely
        // ignores them rather than misrouting them somewhere wrong.
        row(["", "", "Multiple Attempts", "", ""], [9]),
        row(["", "", "Stalled 0-7 Days", "", ""], [12]),
        row(["", "", "Stalled 8-14 Days", "", ""], [7]),
        row(["", "", "Stalled 15+ Days", "", ""], [5]),
        row(["", "", "Recently Completed", "", ""], [4]),
    ] };

    // ---- Template ----
    const template = document.createElement("template");
    template.innerHTML = `
        <style>
            :host {
                display: block;
                box-sizing: border-box;
                font-family: "72", "Segoe UI", Arial, sans-serif;

                /* Same glassmorphism/depth design system as the original
                   widget, copied wholesale for visual consistency across
                   the split dashboards. */
                --mesh-1: rgba(106, 92, 240, 0.16);
                --mesh-2: rgba(47, 111, 224, 0.12);
                --mesh-3: rgba(20, 151, 111, 0.10);
                --surface: rgba(255, 255, 255, 0.58);
                --surface-solid: #ffffff;
                --surface-2: rgba(23, 26, 35, 0.055);
                --border: rgba(255, 255, 255, 0.65);
                --text: #171a23;
                --text-soft: #5b6072;
                --accent: #6a5cf0;
                --accent-bg: rgba(106, 92, 240, 0.14);
                --success: #14976f;
                --success-bg: rgba(20, 151, 111, 0.14);
                --warning: #a5700c;
                --warning-bg: rgba(165, 112, 12, 0.14);
                --info: #2f6fe0;
                --info-bg: rgba(47, 111, 224, 0.14);
                --danger: #c94b4b;
                --danger-bg: rgba(201, 75, 75, 0.14);
                --glass-blur: blur(20px) saturate(180%);
                --shadow-card: 0 1px 1px rgba(23,26,35,0.03), 0 4px 12px -2px rgba(23,26,35,0.07), 0 14px 28px -10px rgba(23,26,35,0.10);
            }
            * { box-sizing: border-box; }

            .dashboard {
                width: 100%;
                height: 100%;
                overflow: auto;
                background:
                    radial-gradient(at 12% 8%, var(--mesh-1) 0%, transparent 45%),
                    radial-gradient(at 88% 14%, var(--mesh-2) 0%, transparent 45%),
                    radial-gradient(at 50% 100%, var(--mesh-3) 0%, transparent 50%),
                    #f4f5fa;
                color: var(--text);
                border-radius: 18px;
                padding: 18px;
            }

            .tile, .panel, .badge {
                backdrop-filter: var(--glass-blur);
                -webkit-backdrop-filter: var(--glass-blur);
            }
            @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
                .tile, .panel { background: rgba(255,255,255,0.94) !important; }
            }

            .topbar { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
            .eyebrow { font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 4px; }
            .topbar h1 { font-size: 19px; font-weight: 700; margin: 0; display: inline; }
            .titlewrap { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
            .badge { font-size: 10.5px; font-weight: 600; letter-spacing: 0.01em; padding: 3px 9px; border-radius: 100px; border: 1px solid; white-space: nowrap; }
            .badge.accent { color: var(--accent); border-color: rgba(106,92,240,0.35); background: var(--accent-bg); }
            .asof { font-size: 11px; color: var(--text-soft); margin-top: 2px; }

            .section-title { font-size: 11.5px; font-weight: 700; color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.05em; margin: 22px 0 8px; }
            .panel-caption { font-size: 12px; color: var(--text-soft); margin: -6px 0 8px; }
            .panel-callout { font-size: 11.5px; color: var(--warning); font-weight: 600; margin: -4px 0 8px; }

            .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
            .tile { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 6px; box-shadow: var(--shadow-card); }
            .tile .label { font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-soft); }
            .tile .value { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); }
            .tile .sub { font-size: 11px; color: var(--text-soft); margin-top: -4px; }
            .tile .bar-track { height: 5px; border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 1px 2px rgba(23,26,35,0.10); overflow: hidden; margin-top: 2px; }
            .tile .bar-fill { height: 100%; border-radius: 4px; }
            .tile.accent .value { color: var(--accent); } .tile.accent .bar-fill { background: var(--accent); }
            .tile.success .value { color: var(--success); } .tile.success .bar-fill { background: var(--success); }
            .tile.warning .value { color: var(--warning); } .tile.warning .bar-fill { background: var(--warning); }
            .tile.info .value { color: var(--info); } .tile.info .bar-fill { background: var(--info); }
            .tile.danger .value { color: var(--danger); } .tile.danger .bar-fill { background: var(--danger); }

            .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
            .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 14px; box-shadow: var(--shadow-card); }
            .breakdown-row { display: flex; align-items: center; gap: 10px; font-size: 12.5px; padding: 6px 0; }
            .breakdown-row .dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px rgba(106,92,240,0.16); }
            .breakdown-row .name { flex: none; width: 40%; color: var(--text); }
            .breakdown-row .track { flex: 1 1 auto; height: 6px; border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 1px 2px rgba(23,26,35,0.10); overflow: hidden; }
            .breakdown-row .fill { height: 100%; border-radius: 4px; background: var(--accent); }
            .breakdown-row .val { flex: none; width: 3.5em; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--text); }
            .empty-row { font-size: 12.5px; color: var(--text-soft); padding: 4px 0; }

            .stat-row { padding: 7px 0; }
            .stat-row-top { display: flex; align-items: center; gap: 8px; }
            .stat-row-top .name { flex: 1 1 auto; font-size: 12.5px; color: var(--text); }
            .stat-row-top .value { flex: none; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
            .stat-row-sub { font-size: 10.5px; color: var(--text-soft); margin: 1px 0 0 15px; font-variant-numeric: tabular-nums; }

            .progress-track { margin: 4px 0 0 15px; height: 5px; border-radius: 4px; background: var(--surface-2); box-shadow: inset 0 1px 2px rgba(23,26,35,0.10); overflow: hidden; }
            .progress-fill { height: 100%; border-radius: 4px; background: var(--accent); }
        </style>
        <div class="dashboard">
            <div class="topbar">
                <div>
                    <div class="eyebrow">2026 Annual Enrollment</div>
                    <div class="titlewrap">
                        <h1>Executive Summary</h1>
                        <span class="badge accent" id="dataBadge">Mock Data — Preview</span>
                    </div>
                    <div class="asof" id="asof"></div>
                </div>
            </div>

            <div class="section-title">Employer Selection</div>
            <div class="grid" id="employerTiles"></div>

            <div class="section-title">Breakdowns</div>
            <div class="panels">
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Synod / Region</div>
                    <div class="panel-caption" style="margin-top:-4px;">% of employers completed, by synod</div>
                    <div class="panel-callout" id="synodLowest"></div>
                    <div id="synodBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Health Plan Mix</div>
                    <div class="panel-caption" style="margin-top:-4px;">Completed employers' selected health plan, as % of completed</div>
                    <div id="electionBreakdown"></div>
                </div>
                <div class="panel">
                    <div class="section-title" style="margin-top:0;">Year-over-Year Changes</div>
                    <div class="panel-caption" style="margin-top:-4px;">Completed health-plan elections and eligible headcount, 2026 vs. 2027</div>
                    <div id="yoyBreakdown"></div>
                </div>
            </div>
        </div>
    `;

    class AEExecutiveSummary extends HTMLElement {
        constructor() {
            super();
            this._shadowRoot = this.attachShadow({ mode: "open" });
            this._shadowRoot.appendChild(template.content.cloneNode(true));

            this._props = { width: 900, height: 500, asOfLabel: "Live" };
            this._employerStatus = MOCK_EMPLOYER_STATUS;
            this._usingMockData = true;
        }

        connectedCallback() {
            this._render();
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            this._props = Object.assign({}, this._props, changedProperties);
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            if ("width" in changedProperties) this.style.width = changedProperties.width + "px";
            if ("height" in changedProperties) this.style.height = changedProperties.height + "px";
            if ("employerStatus" in changedProperties) { this._employerStatus = changedProperties.employerStatus; this._usingMockData = false; }
            this._render();
        }

        onCustomWidgetDestroy() {
            // No timers/subscriptions held; nothing to tear down.
        }

        refresh() {
            this._render();
        }

        // ---- Parsing helpers — identical to the original widget's, since
        // this binds to the same model/row shape. See that project's
        // main.js for the discovery notes behind each of these. ----
        _dim(r, i) {
            const d = r["dimensions_" + i];
            if (!d) return "";
            // SAC represents a blank/unassigned dimension member with
            // placeholder text ("(Null)"/"(No Value)", id "@NullMember")
            // instead of an empty string — normalize back to "" so every
            // row-kind branch below can rely on a genuine blank being "".
            if (d.id === "@NullMember" || d.label === "(Null)" || d.label === "(No Value)") return "";
            return d.label;
        }
        _measure(r, i) {
            const m = r["measures_" + i];
            return m ? Number(m.raw) : 0;
        }

        _formatPct(pct) {
            if (pct > 0 && pct < 1) return pct.toFixed(1) + "%";
            return Math.round(pct) + "%";
        }

        _statusBucket(status) {
            if (COMPLETED_STATUSES.includes(status)) return "Completed";
            if (DEFAULTED_STATUSES.includes(status)) return "Defaulted";
            if (OPEN_STATUSES.includes(status)) return "Open";
            return null;
        }

        _displayBucketName(name) {
            return name === "Value HDHP" ? "Value High Deductible" : name;
        }

        _synodGroupKey(name) {
            const m = /^(\d+)/.exec(name);
            return m ? m[1] : name;
        }

        // Parses the shared employerStatus feed. This widget only RENDERS a
        // subset of what's computed here (no Timeline/HSA/per-status
        // panels), but parses the full shape anyway — same proven parser
        // as the original widget, safest to reuse verbatim rather than
        // trim it down and risk a subtle bug. Operational-only row-kinds
        // (Multiple Attempts/Stalled .../Recently Completed) simply don't
        // match any branch here and are silently skipped (they fall through
        // to the plain status/synod branch only if subType is empty, which
        // it never is for those rows, so they're effectively ignored).
        _parseEmployerStatus() {
            const rows = (this._employerStatus && this._employerStatus.data) || [];
            const bySynod = {};
            const bySynodNames = {};
            const byStatus = {};
            const byHealthPlan = {};
            const byEligibleCount = {};
            let totalSetUp = 0, completed = 0, defaulted = 0, open = 0;

            rows.forEach((r) => {
                const status = this._dim(r, 0);
                const synod = this._dim(r, 1);
                const subType = this._dim(r, 2);
                const date = this._dim(r, 3);
                const year = this._dim(r, 4);
                const employerCount = this._measure(r, 0);
                const employeeCount = this._measure(r, 1);

                if (date) return; // Timeline rows — not rendered by this widget

                if (subType === "Eligible Count") {
                    byEligibleCount[year] = (byEligibleCount[year] || 0) + employeeCount;
                    return;
                }

                if (subType && subType.indexOf("HSA ") === 0) return; // not rendered by this widget

                if (subType && year) {
                    if (!byHealthPlan[year]) byHealthPlan[year] = {};
                    byHealthPlan[year][subType] = (byHealthPlan[year][subType] || 0) + employerCount;
                    return;
                }

                // Operational-only row-kinds ("Multiple Attempts", "Stalled
                // ... Days", "Recently Completed") have a non-empty subType
                // but no year — without this guard they'd fall through into
                // the plain status/synod accounting below and inflate
                // totalSetUp incorrectly. Not rendered by this widget.
                if (subType) return;

                const bucket = this._statusBucket(status);

                totalSetUp += employerCount;
                if (bucket === "Completed") completed += employerCount;
                else if (bucket === "Defaulted") defaulted += employerCount;
                else if (bucket === "Open") open += employerCount;

                if (bucket === "Open" && status) byStatus[status] = (byStatus[status] || 0) + employerCount;
                if (synod) {
                    const groupKey = this._synodGroupKey(synod);
                    if (!bySynod[groupKey]) bySynod[groupKey] = { total: 0, completed: 0 };
                    bySynod[groupKey].total += employerCount;
                    if (bucket === "Completed") bySynod[groupKey].completed += employerCount;
                    if (!bySynodNames[groupKey]) bySynodNames[groupKey] = new Set();
                    bySynodNames[groupKey].add(synod);
                }
            });

            const pctComplete = totalSetUp ? (completed / totalSetUp) * 100 : 0;
            return {
                totalSetUp, completed, defaulted, open, pctComplete,
                bySynod, bySynodNames, byStatus,
                byElectionType: byHealthPlan["2027"] || {},
                byHealthPlan, byEligibleCount,
            };
        }

        // ---- Small render helpers — identical to the original widget's ----
        _tileHtml(label, value, sub, pctOfMax, cls) {
            return `
                <div class="tile ${cls}">
                    <div class="label">${label}</div>
                    <div class="value">${value}</div>
                    <div class="sub">${sub}</div>
                    <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pctOfMax))}%"></div></div>
                </div>`;
        }

        _breakdownRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            const max = Math.max(1, ...entries.map((e) => e.value));
            return entries.map((e) =>
                `<div class="breakdown-row">
                    <span class="dot"></span>
                    <span class="name"${e.title ? ` title="${e.title}"` : ""}>${e.name}</span>
                    <span class="track"><span class="fill" style="width:${Math.round((e.value / max) * 100)}%"></span></span>
                    <span class="val">${e.display !== undefined ? e.display : e.value}</span>
                </div>`
            ).join("");
        }

        _statRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            return entries.map((e) =>
                `<div class="stat-row">
                    <div class="stat-row-top">
                        <span class="dot"></span>
                        <span class="name">${e.name}</span>
                        <span class="value">${e.value}</span>
                    </div>
                    ${e.sub !== undefined ? `<div class="stat-row-sub">${e.sub}</div>` : ""}
                </div>`
            ).join("");
        }

        _progressRowsHtml(entries, emptyMessage) {
            if (!entries.length) return `<div class="empty-row">${emptyMessage}</div>`;
            return entries.map((e) =>
                `<div class="stat-row">
                    <div class="stat-row-top">
                        <span class="dot"></span>
                        <span class="name"${e.title ? ` title="${e.title}"` : ""}>${e.name}</span>
                        <span class="value">${e.value}</span>
                    </div>
                    <div class="progress-track"><div class="progress-fill" style="width:${Math.max(0, Math.min(100, e.pct))}%"></div></div>
                    ${e.sub !== undefined ? `<div class="stat-row-sub">${e.sub}</div>` : ""}
                </div>`
            ).join("");
        }

        // ---- Rendering ----
        _render() {
            const root = this._shadowRoot;
            const status = this._parseEmployerStatus();

            root.getElementById("asof").textContent = "As of: " + (this._props.asOfLabel || "Live");
            root.getElementById("dataBadge").textContent = this._usingMockData ? "Mock Data — Preview" : "Live";

            // Employer Selection tiles — added 2026-09-13: "Abandoned" (a
            // meaningfully different risk than the general Non-Completed
            // bucket) and "Eligible Employees" (a headline stakes/scale
            // number, previously only ever shown as a YoY delta line)
            // replace "Defaulted (running)", which always reads 0 right now
            // (no real "Defaulted" status value exists yet) and isn't a
            // useful executive-facing number as a result.
            const pctOpen = status.totalSetUp ? (status.open / status.totalSetUp) * 100 : 0;
            const abandonedCount = status.byStatus["Abandoned"] || 0;
            const pctAbandoned = status.totalSetUp ? (abandonedCount / status.totalSetUp) * 100 : 0;
            const eligibleNow = status.byEligibleCount["2027"] || 0;
            const tilesHtml = [
                this._tileHtml("Total Set Up", status.totalSetUp, "in current filter", 100, "accent"),
                this._tileHtml("Completed", status.completed, this._formatPct(status.pctComplete) + " of total", status.pctComplete, "success"),
                this._tileHtml("% Complete", this._formatPct(status.pctComplete), "of total set up", status.pctComplete, "accent"),
                this._tileHtml("Non-Completed", status.open, this._formatPct(pctOpen) + " of total", pctOpen, "warning"),
                this._tileHtml("Abandoned", abandonedCount, this._formatPct(pctAbandoned) + " of total", pctAbandoned, "danger"),
                this._tileHtml("Eligible Employees", eligibleNow.toLocaleString(), "current plan year", 100, "info"),
            ].join("");
            root.getElementById("employerTiles").innerHTML = tilesHtml;

            // Synod/Region completion progress, plus a "needs attention"
            // callout for the lowest-performing region — added 2026-09-13
            // so leadership doesn't have to scan the full list to find
            // where attention is needed.
            const synodKeys = Object.keys(status.bySynod);
            const synodStats = synodKeys.map((s) => {
                const { total, completed: synodCompleted } = status.bySynod[s];
                const pct = total ? (synodCompleted / total) * 100 : 0;
                return {
                    key: s,
                    name: /^\d+$/.test(s) ? `Synod ${s}` : s,
                    total, completed: synodCompleted, pct,
                    title: status.bySynodNames[s] ? Array.from(status.bySynodNames[s]).sort().join(", ") : undefined,
                };
            });
            const synodEntries = synodStats.map((e) => ({
                name: e.name, title: e.title, pct: e.pct, value: this._formatPct(e.pct),
                sub: `${e.completed.toLocaleString()} of ${e.total.toLocaleString()} completed`,
            }));
            root.getElementById("synodBreakdown").innerHTML = this._progressRowsHtml(synodEntries, "No Synod/Region data bound yet");

            const ranked = synodStats.filter((e) => e.total > 0);
            const lowest = ranked.length ? ranked.reduce((a, b) => (a.pct < b.pct ? a : b)) : null;
            root.getElementById("synodLowest").textContent = lowest ? `Needs attention: ${lowest.name} at ${this._formatPct(lowest.pct)}` : "";

            // Health Plan Mix — shown as % of completed rather than raw
            // counts (added 2026-09-13; reads faster for a leadership
            // audience). Bar length still reflects the raw count so
            // relative proportions stay visually accurate.
            const electionRaw = Object.keys(status.byElectionType).map((t) => ({ name: this._displayBucketName(t), value: status.byElectionType[t] }));
            const electionTotal = electionRaw.reduce((sum, e) => sum + e.value, 0);
            const electionEntries = electionRaw.map((e) => ({
                name: e.name, value: e.value,
                display: this._formatPct(electionTotal ? (e.value / electionTotal) * 100 : 0),
            }));
            root.getElementById("electionBreakdown").innerHTML = this._breakdownRowsHtml(electionEntries, "No election sub-type data bound yet");

            // YoY breakdown — identical to the original widget's design.
            // No color-coding on the delta — 2026 is a full completed cycle
            // being compared against a 2027 cycle that's only just begun,
            // so a "decrease" here isn't meaningfully bad news.
            const fmt = (n) => Number(n).toLocaleString();
            const y2026 = status.byHealthPlan["2026"] || {};
            const y2027 = status.byHealthPlan["2027"] || {};
            const bucketNames = Array.from(new Set([...Object.keys(y2026), ...Object.keys(y2027)]));
            const yoyEntries = bucketNames.map((b) => {
                const before = y2026[b] || 0;
                const after = y2027[b] || 0;
                const delta = after - before;
                const sign = delta > 0 ? "+" : "";
                return { name: this._displayBucketName(b), value: `${sign}${fmt(delta)}`, sub: `${fmt(before)} (2026) → ${fmt(after)} (2027)` };
            });
            const eligibleBefore = status.byEligibleCount["2026"] || 0;
            const eligibleAfter = status.byEligibleCount["2027"] || 0;
            if (eligibleBefore || eligibleAfter) {
                const eligibleDelta = eligibleAfter - eligibleBefore;
                const sign = eligibleDelta > 0 ? "+" : "";
                yoyEntries.push({
                    name: "Eligible Employees",
                    value: `${sign}${fmt(eligibleDelta)}`,
                    sub: `${fmt(eligibleBefore)} (2026) → ${fmt(eligibleAfter)} (2027)`,
                });
            }
            root.getElementById("yoyBreakdown").innerHTML = this._statRowsHtml(yoyEntries, "No YoY data bound yet");
        }
    }

    customElements.define("com-porticobenefits-aeexecutive", AEExecutiveSummary);
})();
