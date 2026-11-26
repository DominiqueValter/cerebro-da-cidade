import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  variant?: "default" | "warning" | "danger";
}

export function MetricCard({
  title,
  value,
  description,
  icon: Icon,
  variant = "default",
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card-top">
        <span className="metric-title">{title}</span>

        <div className={`metric-icon metric-icon-${variant}`}>
          <Icon size={19} strokeWidth={1.8} />
        </div>
      </div>

      <div className="metric-value">{value}</div>

      <div className="metric-description">
        <span className={`metric-status metric-status-${variant}`} />
        {description}
      </div>
    </article>
  );
}
