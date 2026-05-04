import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCircle2, MoreHorizontal, SlidersHorizontal } from 'lucide-react';

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  color: string;
  delay?: number;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) {
      setDisplay(0);
      return;
    }
    const duration = 600;
    const steps = 30;
    const increment = value / steps;
    let current = 0;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), value);
      setDisplay(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <>{display.toLocaleString()}</>;
}

export function StatCard({ icon: Icon, label, value, sub, color, delay = 0 }: StatCardProps) {
  const fill = Math.min(100, Math.max(8, value));
  const spark = [18, 34, 28, 48, 42, 68, fill].map((point, index) => `${index * 16},${72 - Math.min(70, point)}`).join(' ');
  const [mode, setMode] = useState<'live' | 'detail'>('live');

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.35, delay, ease: [0.2, 0, 0, 1] }}
      className="dynamic-block glass-card stat-card-dynamic p-5"
    >
      <div className="flex items-start gap-4">
        <motion.div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${color}18` }}
          whileHover={{ rotate: -8 }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-bold text-foreground">
            <AnimatedNumber value={value} />
          </p>
          {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
          <div className="stat-card-chipline" role="group" aria-label={`${label} actions`}>
            <button type="button" data-selected={mode === 'live'} onClick={() => setMode('live')}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              Live
            </button>
            <button type="button" data-selected={mode === 'detail'} onClick={() => setMode('detail')}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Detail
            </button>
          </div>
        </div>
        <button type="button" className="stat-card-menu" aria-label={`${label} more actions`}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[color:var(--surface-container-highest)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${fill}%` }}
          transition={{ duration: 0.7, delay: delay + 0.12, ease: [0.2, 0, 0, 1] }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
      <svg className="mt-4 h-10 w-full overflow-visible" viewBox="0 0 96 72" preserveAspectRatio="none" aria-hidden="true">
        <motion.polyline
          points={spark}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.72 }}
          transition={{ duration: 0.75, delay: delay + 0.22, ease: [0.2, 0, 0, 1] }}
        />
      </svg>
      <div className="stat-card-feedback">
        <span style={{ color }}>
          <Bell className="h-3.5 w-3.5" />
          {mode === 'live' ? '实时监测中' : '详情模式'}
        </span>
        <span>{Math.round(fill)}%</span>
      </div>
    </motion.div>
  );
}
