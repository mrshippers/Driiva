import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface ScoreSparklineProps {
  data: number[];
  color?: string;
  height?: number;
}

export function ScoreSparkline({
  data,
  color = '#22d3ee',
  height = 32,
}: ScoreSparklineProps) {
  if (!data || data.length === 0) {
    return <span className="text-white/20 text-xs">No data</span>;
  }

  const chartData = data.map((value, i) => ({ i, value }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
