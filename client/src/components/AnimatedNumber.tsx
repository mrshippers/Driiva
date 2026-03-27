/**
 * Animated number counter that smoothly transitions between values.
 * Used for scores, stats, and financial figures.
 */
import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  /** Duration of the count animation in seconds */
  duration?: number;
  /** Number of decimal places */
  decimals?: number;
  /** Prefix to display (e.g. "£") */
  prefix?: string;
  /** Suffix to display (e.g. "mi") */
  suffix?: string;
  /** Additional class name */
  className?: string;
  /** Format with locale commas */
  locale?: boolean;
}

export function AnimatedNumber({
  value,
  duration = 1.2,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  locale = false,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prevValue = useRef(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const from = prevValue.current;
    const to = value;
    prevValue.current = value;

    if (from === to) {
      node.textContent = formatNumber(to, decimals, prefix, suffix, locale);
      return;
    }

    const controls = animate(from, to, {
      duration,
      ease: [0.16, 1, 0.3, 1], // smoothDecel
      onUpdate: (v) => {
        node.textContent = formatNumber(v, decimals, prefix, suffix, locale);
      },
    });

    return () => controls.stop();
  }, [value, duration, decimals, prefix, suffix, locale]);

  return (
    <span ref={ref} className={className}>
      {formatNumber(0, decimals, prefix, suffix, locale)}
    </span>
  );
}

function formatNumber(
  n: number,
  decimals: number,
  prefix: string,
  suffix: string,
  locale: boolean,
): string {
  const rounded = decimals > 0 ? n.toFixed(decimals) : Math.round(n).toString();
  const formatted = locale
    ? Number(rounded).toLocaleString('en-GB', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : rounded;
  return `${prefix}${formatted}${suffix ? ` ${suffix}` : ''}`;
}
