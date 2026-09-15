import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { type DashboardMetric, formatSwedishCurrency } from "@/lib/mock-data/dashboard";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  currency: string;
  metric: DashboardMetric;
}

const trendStyles = {
  attention: "bg-[#fff0d8] text-[#8d591a]",
  negative: "bg-[#fce8e5] text-[#9e453d]",
  neutral: "bg-[#eaf1f4] text-[#55717e]",
  positive: "bg-[#e2f3e9] text-[#1b6c4c]"
};

export function MetricCard({ currency, metric }: Readonly<MetricCardProps>) {
  const TrendIcon =
    metric.tone === "positive" ? ArrowUpRight : metric.tone === "negative" ? ArrowDownRight : Minus;

  return (
    <article className="border border-[#d6e3e9] bg-white p-5 shadow-[0_8px_22px_rgba(16,47,66,0.035)]">
      <p className="text-sm font-medium text-[#5a7481]">{metric.label}</p>
      <p className="mt-5 text-2xl font-semibold tracking-[-0.04em] text-[#12374c] sm:text-[1.7rem]">
        {formatSwedishCurrency(metric.value, currency)}
      </p>
      <div className="mt-5 flex items-center gap-2 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 font-semibold",
            trendStyles[metric.tone]
          )}
        >
          <TrendIcon aria-hidden="true" className="size-3" />
          {metric.change}
        </span>
        <span className="text-[#6c8490]">{metric.detail}</span>
      </div>
    </article>
  );
}
