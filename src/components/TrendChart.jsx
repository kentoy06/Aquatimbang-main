import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const peso = (value) =>
  `₱${Number(value).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

const longDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-PH", { dateStyle: "medium" });

// Interactive line chart of daily prices: rows = [{ date: "YYYY-MM-DD", price, count? }].
export default function TrendChart({ rows, label = "Price per kg", height = 300 }) {
  const prices = rows.map((r) => r.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const pad = Math.max((high - low) * 0.15, 5);
  return (
    <div style={{ width: "100%", height }} role="img" aria-label={`${label} over ${rows.length} days`}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 12, right: 18, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e4ecf0" strokeDasharray="4 4" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 12, fill: "#64748b" }} minTickGap={24} />
          <YAxis
            domain={[Math.max(0, Math.floor(low - pad)), Math.ceil(high + pad)]}
            tickFormatter={(v) => `₱${v}`}
            tick={{ fontSize: 12, fill: "#64748b" }}
            width={58}
          />
          <Tooltip
            labelFormatter={longDate}
            formatter={(value, _name, item) => [
              `${peso(value)} / kg${item?.payload?.count > 1 ? ` (average of ${item.payload.count})` : ""}`,
              label,
            ]}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#0e7c86"
            strokeWidth={2.5}
            dot={rows.length <= 45 ? { r: 3, fill: "#0e7c86" } : false}
            activeDot={{ r: 6 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
