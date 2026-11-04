import React from 'react';
import { Zap } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface NeonEdgeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  speed?: number;
  glow?: boolean;
  /** Whether this is the next thing to press. When false the beam and glow fade out, leaving a quiet hairline border. */
  active?: boolean;
}

export const NeonEdgeButton: React.FC<NeonEdgeButtonProps> = ({
  children = 'Deploy preview',
  speed = 1,
  glow = true,
  active = true,
  className,
  ...props
}) => {
  const duration = `${3 / speed}s`;

  return (
    <button
      type="button"
      className={cn(
        'focus-ring group relative inline-flex min-h-11 items-center justify-center overflow-hidden rounded-md p-[1px] text-sm font-medium text-[#FAFAFA] transition-all cursor-pointer active:scale-[0.98]',
        active ? glow && 'shadow-[0_0_24px_-10px_rgba(255,255,255,0.4)]' : 'bg-white/10',
        className
      )}
      {...props}
    >
      <style>{`
        @keyframes easyui-neon-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .easyui-neon-beam { animation: none !important; opacity: 0.4 !important; }
        }
      `}</style>
      
      {/* Dynamic Animated Border Beam */}
      <span
        aria-hidden="true"
        className={cn('pointer-events-none absolute -inset-[200%] overflow-hidden transition-opacity duration-500', !active && 'opacity-0')}
      >
        <span
          className="easyui-neon-beam absolute inset-0 block"
          style={{
            background: 'conic-gradient(from 0deg at 50% 50%, transparent 0deg, transparent 280deg, rgba(255,255,255,0.85) 340deg, transparent 360deg)',
            animation: `easyui-neon-rotate ${duration} linear infinite`,
          }}
        />
      </span>

      {/* Button Interior Surface */}
      <span className="relative z-10 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-[calc(var(--radius-md)-1px)] bg-[#050505] px-5 py-2.5 transition-colors group-hover:bg-[#0B0B0B]">
        <Zap className="h-4 w-4 text-[#E5E5E5] transition-transform duration-300 group-hover:scale-110" />
        <span className="select-none">{children}</span>
      </span>
    </button>
  );
};

