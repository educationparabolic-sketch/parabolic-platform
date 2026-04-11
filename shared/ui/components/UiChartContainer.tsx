export interface UiChartPoint {
  label: string;
  value: number;
}

export interface UiChartContainerProps {
  title: string;
  subtitle?: string;
  data: UiChartPoint[];
  maxValue?: number;
  variant?: "bar" | "pie";
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
