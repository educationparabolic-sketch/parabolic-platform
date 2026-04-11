export interface UiChartPoint {
  label: string;
  value: number;
}

export interface UiChartContainerProps {
  title: string;
  subtitle?: string;
  data: UiChartPoint[];
  maxValue?: number;
  variant?: "bar" | "pie" | "line";
}

function pieSlicePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
  const startX = cx + radius * Math.cos(startAngle);
  const startY = cy + radius * Math.sin(startAngle);
  const endX = cx + radius * Math.cos(endAngle);
  const endY = cy + radius * Math.sin(endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
}

function UiChartContainer({ title, subtitle, data, maxValue, variant = "bar" }: UiChartContainerProps) {
  const localMax = data.reduce((max, point) => (point.value > max ? point.value : max), 0);
  const chartMax = maxValue ?? (localMax > 0 ? localMax : 1);
  const chartTotal = data.reduce((sum, point) => sum + Math.max(point.value, 0), 0);

  const PIE_COLORS = ["#1e57a8", "#2e7b97", "#45925f", "#c3732d", "#9b3e45", "#6e5ca9"];

  if (variant === "pie") {
    const safeTotal = chartTotal > 0 ? chartTotal : 1;
    let currentAngle = -Math.PI / 2;

    return (
      <section className="ui-chart" aria-label={title}>
        <header className="ui-chart-header">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        <div className="ui-chart-pie-layout">
          <svg className="ui-chart-pie" viewBox="0 0 120 120" role="img" aria-label={`${title} pie chart`}>
            {data.map((point, index) => {
              const ratio = Math.max(point.value, 0) / safeTotal;
              const angle = ratio * Math.PI * 2;
              const nextAngle = currentAngle + angle;
              const path = pieSlicePath(60, 60, 48, currentAngle, nextAngle);
              const fill = PIE_COLORS[index % PIE_COLORS.length];
              currentAngle = nextAngle;

              return <path key={`${point.label}-${index}`} d={path} fill={fill} />;
            })}
            <circle cx="60" cy="60" r="22" fill="#ffffff" />
            <text x="60" y="56" textAnchor="middle" className="ui-chart-pie-total-label">
              Total
            </text>
            <text x="60" y="69" textAnchor="middle" className="ui-chart-pie-total-value">
              {chartTotal}
            </text>
          </svg>

          <div className="ui-chart-pie-legend">
            {data.map((point, index) => {
              const fill = PIE_COLORS[index % PIE_COLORS.length];
              const ratio = chartTotal > 0 ? Math.round((point.value / chartTotal) * 100) : 0;
              return (
                <div key={point.label} className="ui-chart-pie-legend-row">
                  <span className="ui-chart-pie-swatch" style={{ backgroundColor: fill }} />
                  <span>{point.label}</span>
                  <strong>
                    {point.value} ({ratio}%)
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  if (variant === "line") {
    const normalized = data.map((point) => Math.max(point.value, 0));
    const width = 240;
    const height = 120;
    const paddingX = 14;
    const paddingY = 14;
    const usableWidth = width - paddingX * 2;
    const usableHeight = height - paddingY * 2;
    const denominator = normalized.length > 1 ? normalized.length - 1 : 1;
    const points = normalized.map((value, index) => {
      const x = paddingX + (index / denominator) * usableWidth;
      const y = height - paddingY - (value / chartMax) * usableHeight;
      return { x, y, value, label: data[index]?.label ?? "" };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");

    return (
      <section className="ui-chart" aria-label={title}>
        <header className="ui-chart-header">
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
        <div className="ui-chart-line-layout">
          <svg className="ui-chart-line" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} line chart`}>
            <line x1={paddingX} y1={height - paddingY} x2={width - paddingX} y2={height - paddingY} className="ui-chart-line-axis" />
            <line x1={paddingX} y1={paddingY} x2={paddingX} y2={height - paddingY} className="ui-chart-line-axis" />
            {points.length > 1 ? <path d={linePath} className="ui-chart-line-path" /> : null}
            {points.map((point) => (
              <circle key={`${point.label}-${point.x}`} cx={point.x} cy={point.y} r="3" className="ui-chart-line-point" />
            ))}
          </svg>
          <div className="ui-chart-line-legend">
            {points.map((point) => (
              <div key={`${point.label}-${point.x}-legend`} className="ui-chart-line-legend-row">
                <span>{point.label}</span>
                <strong>{point.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ui-chart" aria-label={title}>
      <header className="ui-chart-header">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="ui-chart-bars">
        {data.map((point) => {
          const widthPercentage = Math.round((point.value / chartMax) * 100);

          return (
            <div key={point.label} className="ui-chart-row">
              <span>{point.label}</span>
              <div className="ui-chart-track">
                <div className="ui-chart-fill" style={{ width: `${widthPercentage}%` }} />
              </div>
              <strong>{point.value}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default UiChartContainer;
