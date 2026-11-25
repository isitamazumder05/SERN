import { useMemo, useState } from "react";
import {
  TrendingUp,
  ShieldAlert,
  Cpu,
  Ambulance,
  Activity,
  Building2,
  Car,
  PieChart as PieChartIcon,
  BarChart3,
  Bell,
} from "lucide-react";
import "./AnalyticsPage.css";

const STATUS_COLORS = {
  NORMAL: "#10b981",
  AVAILABLE: "#10b981",
  COMPLETED: "#10b981",
  PENDING: "#f59e0b",
  AT_SCENE: "#f59e0b",
  ASSIGNED: "#3b82f6",
  DISPATCHED: "#3b82f6",
  ACTIVE: "#3b82f6",
  EN_ROUTE: "#06b6d4",
  TRANSPORTING: "#a855f7",
  VALIDATED: "#ef4444",
  DETECTED: "#ef4444",
  REJECTED: "#64748b",
  UNAVAILABLE: "#64748b",
  CANCELLED: "#64748b",
  OTHER: "#ec4899",
};

const UNEXPECTED_COLORS = ["#ec4899", "#8b5cf6", "#14b8a6", "#f97316"];

const STATUS_LABELS = {
  PENDING: "Pending",
  VALIDATED: "Validated",
  REJECTED: "Rejected",
  NORMAL: "Normal Driving",
  AVAILABLE: "Available",
  ASSIGNED: "Assigned",
  DISPATCHED: "Dispatched",
  EN_ROUTE: "En Route",
  AT_SCENE: "At Scene",
  TRANSPORTING: "Transporting",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  UNAVAILABLE: "Unavailable",
};

function safeArray(val) {
  return Array.isArray(val) ? val.filter((item) => item && typeof item === "object") : [];
}

function normalizeStatus(val, fallback = "UNKNOWN") {
  if (typeof val !== "string") return fallback;
  const trimmed = val.trim().toUpperCase();
  return trimmed || fallback;
}

function formatStatusLabel(statusKey) {
  if (STATUS_LABELS[statusKey]) return STATUS_LABELS[statusKey];
  return statusKey
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function toFiniteNumber(val) {
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  if (val === null || val === undefined || val === "") return null;
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPct(part, total, decimals = 1) {
  if (!total || total <= 0) return (0).toFixed(decimals);
  return ((part / total) * 100).toFixed(decimals);
}

function truncateLabel(text, maxLen = 14) {
  if (!text || text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}…`;
}

function getNiceYAxis(maxValue) {
  if (!maxValue || maxValue <= 0) {
    return { yMax: 4, ticks: [0, 1, 2, 3, 4] };
  }
  const roughStep = Math.ceil(maxValue / 4);
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const residual = roughStep / magnitude;
  let step;
  if (residual <= 1) step = magnitude;
  else if (residual <= 2) step = 2 * magnitude;
  else if (residual <= 5) step = 5 * magnitude;
  else step = 10 * magnitude;

  const yMax = Math.max(step * 4, Math.ceil(maxValue / step) * step);
  const ticks = [];
  for (let v = 0; v <= yMax; v += step) {
    ticks.push(v);
  }
  return { yMax, ticks };
}

function buildStatusSeries(items, statusField, knownOrder) {
  const counts = new Map();
  for (const item of items) {
    const key = normalizeStatus(item[statusField], "UNKNOWN");
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const ordered = [];
  for (const key of knownOrder) {
    const count = counts.get(key) || 0;
    if (count > 0) {
      ordered.push({
        key,
        label: formatStatusLabel(key),
        count,
        color: STATUS_COLORS[key] || STATUS_COLORS.OTHER,
      });
      counts.delete(key);
    }
  }

  let extraIdx = 0;
  for (const [key, count] of counts.entries()) {
    ordered.push({
      key,
      label: `Other (${formatStatusLabel(key)})`,
      count,
      color: UNEXPECTED_COLORS[extraIdx % UNEXPECTED_COLORS.length],
    });
    extraIdx += 1;
  }

  return ordered;
}

function ChartEmptyState({ message, hint }) {
  return (
    <div className="analytics-empty-state" role="status">
      <p className="analytics-empty-title">{message}</p>
      {hint && <span className="analytics-empty-hint">{hint}</span>}
    </div>
  );
}

function DonutChartPanel({ title, subtitle, icon: Icon, iconColor, data, totalLabel, emptyMessage, emptyHint }) {
  const [hoveredKey, setHoveredKey] = useState(null);
  const total = data.reduce((sum, item) => sum + item.count, 0);
  const activeItem = data.find((d) => d.key === hoveredKey) || null;

  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    if (total <= 0) return [];
    let cumulative = 0;
    return data.map((item) => {
      const fraction = item.count / total;
      const dashLength = fraction * circumference;
      const offset = -cumulative * circumference;
      cumulative += fraction;
      return {
        ...item,
        fraction,
        percentage: formatPct(item.count, total),
        dashLength,
        offset,
      };
    });
  }, [data, total, circumference]);

  return (
    <div className="panel analytics-chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {Icon && <Icon size={20} color={iconColor} />}
      </div>

      {total === 0 ? (
        <ChartEmptyState message={emptyMessage} hint={emptyHint} />
      ) : (
        <div className="donut-layout">
          <div className="donut-svg-wrap">
            <svg
              viewBox="0 0 144 144"
              className="donut-svg"
              role="img"
              aria-label={`${title}: ${total} total`}
            >
              <circle
                cx="72"
                cy="72"
                r={radius}
                fill="transparent"
                className="donut-track"
                strokeWidth="22"
              />
              {segments.map((seg) => {
                const isHovered = hoveredKey === seg.key;
                const isDimmed = hoveredKey !== null && !isHovered;
                return (
                  <circle
                    key={seg.key}
                    cx="72"
                    cy="72"
                    r={radius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth={isHovered ? 25 : 22}
                    strokeDasharray={`${seg.dashLength} ${circumference}`}
                    strokeDashoffset={seg.offset}
                    transform="rotate(-90 72 72)"
                    opacity={isDimmed ? 0.35 : 1}
                    className="donut-slice"
                    onMouseEnter={() => setHoveredKey(seg.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <title>{`${seg.label}: ${seg.count} (${seg.percentage}%)`}</title>
                  </circle>
                );
              })}
              <text x="72" y="68" textAnchor="middle" className="donut-center-value">
                {activeItem ? activeItem.count : total}
              </text>
              <text x="72" y="85" textAnchor="middle" className="donut-center-label">
                {activeItem ? `${formatPct(activeItem.count, total)}%` : totalLabel}
              </text>
            </svg>

            {activeItem && (
              <div className="chart-tooltip-pill" role="status">
                <span className="legend-swatch" style={{ background: activeItem.color }} />
                <strong>{activeItem.label}:</strong> {activeItem.count} ({formatPct(activeItem.count, total)}%)
              </div>
            )}
          </div>

          <ul className="chart-legend-list">
            {segments.map((seg) => (
              <li
                key={seg.key}
                className={`chart-legend-item ${hoveredKey === seg.key ? "is-active" : ""}`}
                onMouseEnter={() => setHoveredKey(seg.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <span className="chart-legend-left">
                  <span className="legend-swatch" style={{ background: seg.color }} />
                  <span className="chart-legend-name">{seg.label}</span>
                </span>
                <span className="chart-legend-value">
                  <strong>{seg.count}</strong>
                  <span>({seg.percentage}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StackedBarChartPanel({
  title,
  subtitle,
  icon: Icon,
  iconColor,
  categories,
  seriesConfig,
  emptyMessage,
  emptyHint,
  rotateLabels = false,
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  const totals = categories.map((cat) =>
    seriesConfig.reduce((sum, s) => sum + (cat.values[s.key] || 0), 0)
  );
  const grandTotal = totals.reduce((a, b) => a + b, 0);
  const maxVal = totals.length > 0 ? Math.max(...totals) : 0;
  const { yMax, ticks } = getNiceYAxis(maxVal);

  const chartWidth = 460;
  const marginTop = 22;
  const marginRight = 18;
  const marginBottom = rotateLabels ? 56 : 36;
  const marginLeft = 36;
  const plotWidth = chartWidth - marginLeft - marginRight;
  const plotHeight = 165;
  const chartHeight = marginTop + plotHeight + marginBottom;

  const slotWidth = categories.length > 0 ? plotWidth / categories.length : plotWidth;
  const barWidth = Math.min(44, Math.max(18, slotWidth * 0.56));
  const hoveredCat = hoveredIdx !== null ? categories[hoveredIdx] : null;

  return (
    <div className="panel analytics-chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        {Icon && <Icon size={20} color={iconColor} />}
      </div>

      {categories.length === 0 || grandTotal === 0 ? (
        <ChartEmptyState message={emptyMessage} hint={emptyHint} />
      ) : (
        <div className="bar-chart-wrap">
          <div className="bar-legend-row">
            {seriesConfig.map((s) => (
              <span key={s.key} className="bar-legend-chip">
                <span className="legend-swatch" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>

          <div className="bar-svg-container">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="bar-svg"
              role="img"
              aria-label={title}
            >
              {/* Horizontal gridlines & Y ticks */}
              {ticks.map((tick) => {
                const y = marginTop + plotHeight - (tick / yMax) * plotHeight;
                return (
                  <g key={tick}>
                    <line
                      x1={marginLeft}
                      y1={y}
                      x2={chartWidth - marginRight}
                      y2={y}
                      className="bar-gridline"
                    />
                    <text
                      x={marginLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="bar-axis-text"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {/* Bars */}
              {categories.map((cat, idx) => {
                const barX = marginLeft + idx * slotWidth + (slotWidth - barWidth) / 2;
                const barTotal = totals[idx];
                const isHovered = hoveredIdx === idx;
                const isDimmed = hoveredIdx !== null && !isHovered;

                let currentY = marginTop + plotHeight;
                const segments = [];
                for (const s of seriesConfig) {
                  const val = cat.values[s.key] || 0;
                  if (val <= 0) continue;
                  const segHeight = (val / yMax) * plotHeight;
                  currentY -= segHeight;
                  segments.push({
                    key: s.key,
                    label: s.label,
                    val,
                    color: s.color,
                    y: currentY,
                    height: segHeight,
                  });
                }

                const tooltipLines = [
                  cat.fullLabel || cat.label,
                  ...segments.map((sg) => `${sg.label}: ${sg.val}`),
                ].join(" · ");

                const labelY = marginTop + plotHeight + 16;

                return (
                  <g
                    key={cat.key}
                    className="bar-group"
                    opacity={isDimmed ? 0.45 : 1}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <title>{tooltipLines}</title>
                    {/* Invisible hit area for easier hovering on short bars */}
                    <rect
                      x={barX - 4}
                      y={marginTop}
                      width={barWidth + 8}
                      height={plotHeight}
                      fill="transparent"
                    />
                    {segments.map((sg) => (
                      <rect
                        key={sg.key}
                        x={barX}
                        y={sg.y}
                        width={barWidth}
                        height={Math.max(2, sg.height)}
                        fill={sg.color}
                        rx="2"
                      />
                    ))}
                    {barTotal > 0 && (
                      <text
                        x={barX + barWidth / 2}
                        y={Math.max(12, currentY - 6)}
                        textAnchor="middle"
                        className="bar-value-label"
                      >
                        {barTotal}
                      </text>
                    )}
                    <text
                      x={barX + barWidth / 2}
                      y={labelY}
                      textAnchor={rotateLabels ? "end" : "middle"}
                      transform={
                        rotateLabels
                          ? `rotate(-28 ${barX + barWidth / 2} ${labelY})`
                          : undefined
                      }
                      className="bar-axis-text"
                    >
                      {truncateLabel(cat.label, rotateLabels ? 13 : 12)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {hoveredCat && (
              <div className="bar-hover-summary" role="status">
                <strong>{hoveredCat.fullLabel || hoveredCat.label}:</strong>{" "}
                {seriesConfig
                  .filter((s) => (hoveredCat.values[s.key] || 0) > 0)
                  .map((s) => `${s.label} ${hoveredCat.values[s.key]}`)
                  .join(" · ")}
                {" "}
                ({formatPct(totals[hoveredIdx], grandTotal)}% of total)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AnalyticsPage({
  accidents = [],
  emergencies = [],
  ambulances = [],
  hospitals = [],
  notifications = [],
}) {
  const safeAccidents = useMemo(() => safeArray(accidents), [accidents]);
  const safeEmergencies = useMemo(() => safeArray(emergencies), [emergencies]);
  const safeAmbulances = useMemo(() => safeArray(ambulances), [ambulances]);
  const safeHospitals = useMemo(() => safeArray(hospitals), [hospitals]);
  const safeNotifications = useMemo(() => safeArray(notifications), [notifications]);

  // Core accident KPIs (strictly derived from raw backend data)
  const totalTelemetry = safeAccidents.length;
  const detectedAccidents = safeAccidents.filter((a) => a.accident_prediction).length;
  const normalDriving = safeAccidents.filter((a) => !a.accident_prediction).length;
  const pendingAccidents = safeAccidents.filter(
    (a) => normalizeStatus(a.validation_status) === "PENDING"
  ).length;
  const validatedEmergencies = safeAccidents.filter(
    (a) => normalizeStatus(a.validation_status) === "VALIDATED"
  ).length;
  const falseAlarms = safeAccidents.filter((a) =>
    ["REJECTED", "FALSE_ALARM"].includes(normalizeStatus(a.validation_status))
  ).length;
  const reviewedAccidents = safeAccidents.filter((a) =>
    ["VALIDATED", "REJECTED", "FALSE_ALARM"].includes(normalizeStatus(a.validation_status))
  ).length;

  const detectedPercent = formatPct(detectedAccidents, totalTelemetry, 0);
  const normalPercent = formatPct(normalDriving, totalTelemetry, 0);

  // Raw model probability average (never using confidence.js display scaling)
  const validProbValues = useMemo(
    () =>
      safeAccidents
        .map((a) => toFiniteNumber(a.accident_probability))
        .filter((p) => p !== null && p >= 0 && p <= 1),
    [safeAccidents]
  );

  const avgRawProb =
    validProbValues.length > 0
      ? ((validProbValues.reduce((sum, p) => sum + p, 0) / validProbValues.length) * 100).toFixed(1)
      : null;

  // Dynamic model threshold from accident records (0 through 1 inclusive, never hardcoded)
  const thresholdSummary = useMemo(() => {
    const thresholds = safeAccidents
      .map((a) => toFiniteNumber(a.model_threshold))
      .filter((t) => t !== null && t >= 0 && t <= 1);
    if (thresholds.length === 0) {
      return { available: false, value: null, label: "Unavailable (no ML records)" };
    }
    const minT = Math.min(...thresholds);
    const maxT = Math.max(...thresholds);
    const avgT = thresholds.reduce((s, t) => s + t, 0) / thresholds.length;
    const isUniform = Math.abs(maxT - minT) < 0.0005;
    return {
      available: true,
      value: avgT,
      label: isUniform
        ? `${(avgT * 100).toFixed(2)}% (from ML records)`
        : `${(avgT * 100).toFixed(2)}% avg (${(minT * 100).toFixed(2)}–${(maxT * 100).toFixed(2)}%)`,
    };
  }, [safeAccidents]);

  // Fleet & Hospital metrics
  const availableAmbulances = safeAmbulances.filter(
    (a) => normalizeStatus(a.status) === "AVAILABLE"
  ).length;
  const activeFleetPercent =
    safeAmbulances.length > 0
      ? Math.round((availableAmbulances / safeAmbulances.length) * 100)
      : 0;

  const activeEmergenciesCount = safeEmergencies.filter(
    (e) => !["COMPLETED", "CANCELLED"].includes(normalizeStatus(e.status))
  ).length;
  const activeHospitalsCount = safeHospitals.filter((h) => h.is_active !== false).length;
  const simulatedNotificationCount = safeNotifications.filter(
    (n) => n.is_simulated !== false
  ).length;

  // 1. Donut: Incident Validation Breakdown
  const validationDonutData = useMemo(
    () =>
      buildStatusSeries(safeAccidents, "validation_status", [
        "PENDING",
        "VALIDATED",
        "REJECTED",
        "NORMAL",
      ]),
    [safeAccidents]
  );

  // 2. Donut: Ambulance Fleet Status (backend-supported statuses only)
  const ambulanceDonutData = useMemo(
    () =>
      buildStatusSeries(safeAmbulances, "status", [
        "AVAILABLE",
        "ASSIGNED",
        "EN_ROUTE",
        "AT_SCENE",
        "TRANSPORTING",
        "UNAVAILABLE",
      ]),
    [safeAmbulances]
  );

  // 3. Donut: Emergency Lifecycle Distribution
  const emergencyDonutData = useMemo(
    () =>
      buildStatusSeries(safeEmergencies, "status", [
        "PENDING",
        "DISPATCHED",
        "EN_ROUTE",
        "AT_SCENE",
        "TRANSPORTING",
        "COMPLETED",
        "CANCELLED",
      ]),
    [safeEmergencies]
  );

  // 4. Bar Chart: Raw ML Accident Probability Distribution (record-level threshold classification with separate fallback series)
  const probabilityHistogram = useMemo(() => {
    if (safeAccidents.length === 0) {
      return {
        categories: [],
        hasThresholdCompared: false,
        hasFallbackDetected: false,
        hasFallbackNormal: false,
        hasInvalid: false,
      };
    }

    const bins = [
      { key: "0-20", label: "0–20%", fullLabel: "Raw probability 0% to <20%", min: 0, max: 0.2, below: 0, above: 0, fallbackDetected: 0, fallbackNormal: 0 },
      { key: "20-40", label: "20–40%", fullLabel: "Raw probability 20% to <40%", min: 0.2, max: 0.4, below: 0, above: 0, fallbackDetected: 0, fallbackNormal: 0 },
      { key: "40-60", label: "40–60%", fullLabel: "Raw probability 40% to <60%", min: 0.4, max: 0.6, below: 0, above: 0, fallbackDetected: 0, fallbackNormal: 0 },
      { key: "60-80", label: "60–80%", fullLabel: "Raw probability 60% to <80%", min: 0.6, max: 0.8, below: 0, above: 0, fallbackDetected: 0, fallbackNormal: 0 },
      { key: "80-100", label: "80–100%", fullLabel: "Raw probability 80% to 100%", min: 0.8, max: 1.0001, below: 0, above: 0, fallbackDetected: 0, fallbackNormal: 0 },
    ];
    let invalidCount = 0;

    for (const acc of safeAccidents) {
      const p = toFiniteNumber(acc.accident_probability);
      if (p === null || p < 0 || p > 1) {
        invalidCount += 1;
        continue;
      }
      const bin = bins.find((b) => p >= b.min && p < b.max) || bins[bins.length - 1];
      const recordThreshold = toFiniteNumber(acc.model_threshold);
      const hasValidThreshold =
        recordThreshold !== null && recordThreshold >= 0 && recordThreshold <= 1;

      if (hasValidThreshold) {
        if (p >= recordThreshold) {
          bin.above += 1;
        } else {
          bin.below += 1;
        }
      } else if (acc.accident_prediction) {
        bin.fallbackDetected += 1;
      } else {
        bin.fallbackNormal += 1;
      }
    }

    const categories = bins.map((b) => ({
      key: b.key,
      label: b.label,
      fullLabel: b.fullLabel,
      values: {
        below: b.below,
        above: b.above,
        fallbackDetected: b.fallbackDetected,
        fallbackNormal: b.fallbackNormal,
        invalid: 0,
      },
    }));

    if (invalidCount > 0) {
      categories.push({
        key: "invalid",
        label: "Missing",
        fullLabel: "Missing or invalid probability",
        values: {
          below: 0,
          above: 0,
          fallbackDetected: 0,
          fallbackNormal: 0,
          invalid: invalidCount,
        },
      });
    }

    return {
      categories,
      hasThresholdCompared: bins.some((b) => b.below > 0 || b.above > 0),
      hasFallbackDetected: bins.some((b) => b.fallbackDetected > 0),
      hasFallbackNormal: bins.some((b) => b.fallbackNormal > 0),
      hasInvalid: invalidCount > 0,
    };
  }, [safeAccidents]);

  // 5. Stacked Bar Chart: Hospital Assignment Load (preserves all hospitals & unassigned emergencies)
  const hospitalLoadCategories = useMemo(() => {
    if (safeEmergencies.length === 0) return [];

    const byHospital = new Map();
    for (const hosp of safeHospitals) {
      if (hosp.id === undefined || hosp.id === null) continue;
      byHospital.set(hosp.id, {
        key: `hosp-${hosp.id}`,
        label: hosp.name || `Hospital #${hosp.id}`,
        fullLabel: `${hosp.name || `Hospital #${hosp.id}`}${hosp.is_active === false ? " (Inactive)" : ""}`,
        values: { active: 0, completed: 0, cancelled: 0 },
      });
    }

    const unassigned = {
      key: "unassigned",
      label: "Unassigned",
      fullLabel: "Emergencies without hospital assignment",
      values: { active: 0, completed: 0, cancelled: 0 },
    };

    for (const em of safeEmergencies) {
      const status = normalizeStatus(em.status);
      const bucket =
        status === "COMPLETED"
          ? "completed"
          : status === "CANCELLED"
            ? "cancelled"
            : "active";

      if (em.hospital_id !== null && em.hospital_id !== undefined) {
        if (!byHospital.has(em.hospital_id)) {
          byHospital.set(em.hospital_id, {
            key: `hosp-${em.hospital_id}`,
            label: `Hospital #${em.hospital_id}`,
            fullLabel: `Hospital #${em.hospital_id}`,
            values: { active: 0, completed: 0, cancelled: 0 },
          });
        }
        byHospital.get(em.hospital_id).values[bucket] += 1;
      } else {
        unassigned.values[bucket] += 1;
      }
    }

    const sortedHospitals = Array.from(byHospital.values()).sort((a, b) => {
      const sumA = a.values.active + a.values.completed + a.values.cancelled;
      const sumB = b.values.active + b.values.completed + b.values.cancelled;
      if (sumB !== sumA) return sumB - sumA;
      return a.label.localeCompare(b.label);
    });

    let displayList = sortedHospitals;
    if (sortedHospitals.length > 8) {
      const top = sortedHospitals.slice(0, 7);
      const rest = sortedHospitals.slice(7);
      const otherAgg = rest.reduce(
        (acc, item) => ({
          active: acc.active + item.values.active,
          completed: acc.completed + item.values.completed,
          cancelled: acc.cancelled + item.values.cancelled,
        }),
        { active: 0, completed: 0, cancelled: 0 }
      );
      displayList = [
        ...top,
        {
          key: "other-hospitals",
          label: "Other hospitals",
          fullLabel: `Other hospitals (${rest.length} facilities combined)`,
          values: otherAgg,
        },
      ];
    }

    const unassignedTotal =
      unassigned.values.active + unassigned.values.completed + unassigned.values.cancelled;
    if (unassignedTotal > 0) {
      displayList = [...displayList, unassigned];
    }

    return displayList;
  }, [safeHospitals, safeEmergencies]);

  // 6. Stacked Bar Chart: Vehicle Type vs Detection Outcome
  const vehicleOutcomeCategories = useMemo(() => {
    if (safeAccidents.length === 0) return [];
    const byVehicle = new Map();

    for (const acc of safeAccidents) {
      const rawSize = typeof acc.vehicle_size === "string" ? acc.vehicle_size.trim() : "";
      const key = rawSize ? rawSize.toLowerCase() : "unknown";
      const displayLabel = rawSize
        ? rawSize.charAt(0).toUpperCase() + rawSize.slice(1).toLowerCase()
        : "Unknown";

      if (!byVehicle.has(key)) {
        byVehicle.set(key, {
          key,
          label: displayLabel,
          fullLabel: `Vehicle category: ${displayLabel}`,
          values: { detected: 0, normal: 0 },
        });
      }

      if (acc.accident_prediction) {
        byVehicle.get(key).values.detected += 1;
      } else {
        byVehicle.get(key).values.normal += 1;
      }
    }

    return Array.from(byVehicle.values()).sort((a, b) => {
      const totalA = a.values.detected + a.values.normal;
      const totalB = b.values.detected + b.values.normal;
      return totalB - totalA;
    });
  }, [safeAccidents]);

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <div>
          <h2>AI Accident Classification &amp; Response Analytics</h2>
          <p>
            Derived strictly from live backend records (raw ML predictions, emergency lifecycle,
            and seeded/registered fleet &amp; hospital registries)
          </p>
        </div>
        <TrendingUp size={28} />
      </div>

      {/* KPI Summary Cards */}
      <div className="analytics-stats">
        <div className="analytics-card">
          <h3>Total Evaluated Events</h3>
          <h2>{totalTelemetry}</h2>
          <p>
            {totalTelemetry > 0
              ? `${pendingAccidents} pending · ${reviewedAccidents} reviewed`
              : "No sensor events recorded"}
          </p>
        </div>

        <div className="analytics-card">
          <h3>Accidents Detected</h3>
          <h2 style={{ color: "#f87171" }}>{detectedAccidents}</h2>
          <p>
            {totalTelemetry > 0
              ? `${detectedPercent}% above ML threshold`
              : "Awaiting telemetry records"}
          </p>
        </div>

        <div className="analytics-card">
          <h3>Normal Driving Filtered</h3>
          <h2 style={{ color: "#34d399" }}>{normalDriving}</h2>
          <p>
            {totalTelemetry > 0
              ? `${normalPercent}% classified below threshold`
              : "Awaiting telemetry records"}
          </p>
        </div>

        <div className="analytics-card">
          <h3>Fleet Readiness</h3>
          <h2 style={{ color: "#60a5fa" }}>{activeFleetPercent}%</h2>
          <p>
            {safeAmbulances.length > 0
              ? `${availableAmbulances} of ${safeAmbulances.length} units available`
              : "No ambulances registered"}
          </p>
        </div>
      </div>

      {/* Donut Charts Row */}
      <div className="analytics-donuts-grid">
        <DonutChartPanel
          title="Incident Validation Breakdown"
          subtitle="Operator & ML classification status across accidents"
          icon={PieChartIcon}
          iconColor="#f59e0b"
          data={validationDonutData}
          totalLabel="Events"
          emptyMessage="No accident candidates recorded"
          emptyHint="Submit vehicle telemetry or run a simulation to populate classification metrics."
        />

        <DonutChartPanel
          title="Ambulance Fleet Status"
          subtitle="Current unit readiness across registered fleet"
          icon={Ambulance}
          iconColor="#60a5fa"
          data={ambulanceDonutData}
          totalLabel="Units"
          emptyMessage="No ambulances registered"
          emptyHint="Register an ambulance unit to monitor fleet distribution."
        />

        <DonutChartPanel
          title="Emergency Lifecycle Distribution"
          subtitle="Active, completed, and cancelled emergencies"
          icon={Activity}
          iconColor="#10b981"
          data={emergencyDonutData}
          totalLabel="Cases"
          emptyMessage="No emergency records created"
          emptyHint="Emergencies appear after a positive accident is confirmed."
        />
      </div>

      {/* Bar & Stacked Bar Charts Grid */}
      <div className="analytics-bars-grid">
        <StackedBarChartPanel
          title="Accident Probability Distribution"
          subtitle={
            thresholdSummary.available
              ? `Raw ML probabilities · Threshold: ${thresholdSummary.label}`
              : "Histogram of raw accident_probability from ML predictor"
          }
          icon={BarChart3}
          iconColor="#a855f7"
          categories={probabilityHistogram.categories}
          seriesConfig={[
            ...(probabilityHistogram.hasThresholdCompared
              ? [
                  { key: "below", label: "Below Record Threshold", color: STATUS_COLORS.NORMAL },
                  { key: "above", label: "At / Above Record Threshold", color: STATUS_COLORS.VALIDATED },
                ]
              : []),
            ...(probabilityHistogram.hasFallbackDetected
              ? [
                  {
                    key: "fallbackDetected",
                    label: "Prediction Fallback — Detected",
                    color: "#f97316",
                  },
                ]
              : []),
            ...(probabilityHistogram.hasFallbackNormal
              ? [
                  {
                    key: "fallbackNormal",
                    label: "Prediction Fallback — Normal",
                    color: "#06b6d4",
                  },
                ]
              : []),
            ...(probabilityHistogram.hasInvalid
              ? [{ key: "invalid", label: "Missing / Invalid", color: STATUS_COLORS.OTHER }]
              : []),
          ]}
          emptyMessage="No ML probability scores available"
          emptyHint="Raw accident probabilities will chart here after telemetry evaluation."
        />

        <StackedBarChartPanel
          title="Hospital Assignment Load"
          subtitle={`Emergencies mapped across ${safeHospitals.length} registered hospitals`}
          icon={Building2}
          iconColor="#10b981"
          categories={hospitalLoadCategories}
          seriesConfig={[
            { key: "active", label: "Active", color: STATUS_COLORS.ACTIVE },
            { key: "completed", label: "Completed", color: STATUS_COLORS.COMPLETED },
            { key: "cancelled", label: "Cancelled", color: STATUS_COLORS.CANCELLED },
          ]}
          emptyMessage="No emergency assignments recorded"
          emptyHint={
            safeHospitals.length > 0
              ? `${safeHospitals.length} hospitals ready; load appears once emergencies are created.`
              : "Register hospitals and create emergencies to track load."
          }
          rotateLabels
        />

        <StackedBarChartPanel
          title="Vehicle Type vs Detection Outcome"
          subtitle="ML binary outcome grouped by reported vehicle_size"
          icon={Car}
          iconColor="#38bdf8"
          categories={vehicleOutcomeCategories}
          seriesConfig={[
            { key: "detected", label: "Accident Detected", color: STATUS_COLORS.DETECTED },
            { key: "normal", label: "Normal Driving", color: STATUS_COLORS.NORMAL },
          ]}
          emptyMessage="No vehicle telemetry breakdown available"
          emptyHint="Vehicle categories populate as sensor records are ingested."
        />
      </div>

      {/* Model & Operational Summary Panels */}
      <div className="analytics-summary-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>AI Detection Model Metrics</h3>
              <p>Raw probability telemetry from AccidentDetectionML</p>
            </div>
            <Cpu size={22} color="#a855f7" />
          </div>

          <div className="analytics-metrics-body">
            <div>
              <div className="analytics-metric-row">
                <span>Average Raw Probability</span>
                <strong>{avgRawProb !== null ? `${avgRawProb}%` : "N/A"}</strong>
              </div>
              <div className="analytics-progress-track">
                <div
                  className="analytics-progress-fill"
                  style={{
                    width: `${avgRawProb !== null ? Math.min(100, Math.max(0, Number(avgRawProb))) : 0}%`,
                    background: "#a855f7",
                  }}
                />
              </div>
            </div>

            <div>
              <div className="analytics-metric-row">
                <span>Model Decision Threshold</span>
                <strong>{thresholdSummary.label}</strong>
              </div>
              <div className="analytics-progress-track">
                <div
                  className="analytics-progress-fill"
                  style={{
                    width: `${thresholdSummary.available
                      ? Math.min(100, Math.max(0, thresholdSummary.value * 100))
                      : 0
                      }%`,
                    background: "#f59e0b",
                  }}
                />
              </div>
            </div>

            <div className="analytics-note-box">
              <strong>Data Integrity Note:</strong>
              Confidence metrics above reflect unscaled raw probabilities returned by the backend
              model. Positive predictions enter the validation queue (`PENDING`) before emergency
              creation.
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <h3>Operational &amp; Coordination Summary</h3>
              <p>Live counts across emergencies, hospitals, and audit logs</p>
            </div>
            <ShieldAlert size={22} color="#f59e0b" />
          </div>

          <div className="analytics-kv-list">
            <div className="analytics-kv-row">
              <span>Confirmed &amp; Validated Incidents</span>
              <strong style={{ color: "#ef4444" }}>{validatedEmergencies}</strong>
            </div>

            <div className="analytics-kv-row">
              <span>False Alarms / Rejected by Operator</span>
              <strong style={{ color: "#94a3b8" }}>{falseAlarms}</strong>
            </div>

            <div className="analytics-kv-row">
              <span>Emergencies (Active / Total)</span>
              <strong style={{ color: "#3b82f6" }}>
                {activeEmergenciesCount} active / {safeEmergencies.length} total
              </strong>
            </div>

            <div className="analytics-kv-row">
              <span>Partner Hospitals (Active / Total)</span>
              <strong style={{ color: "#10b981" }}>
                {activeHospitalsCount} active / {safeHospitals.length} total
              </strong>
            </div>

            <div className="analytics-kv-row">
              <span className="analytics-notif-label">
                <Bell size={14} /> Notification Log (Simulated DB Records)
              </span>
              <strong style={{ color: "#38bdf8" }}>
                {safeNotifications.length} total ({simulatedNotificationCount} simulated)
              </strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsPage;
