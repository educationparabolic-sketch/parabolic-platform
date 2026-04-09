export interface UiChartPoint {
  label: string;
  value: number;
}

export interface UiChartContainerProps {
  title: string;
  subtitle?: string;
  data: UiChartPoint[];
  maxValue?: number;
}

function UiChartContainer({ title, subtitle, data, maxValue }: UiChartContainerProps) {
  const localMax = data.reduce((max, point) => (point.value > max ? point.value : max), 0);
  const chartMax = maxValue ?? (localMax > 0 ? localMax : 1);

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
