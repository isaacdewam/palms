'use client';

import React from 'react';
import { motion } from "motion/react";
import { cn } from '../../lib/utils';

export interface LoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Size of the loader in pixels. Default is 32. */
  size?: number;
  /** Visual animation style variant. Default is 'arc'. */
  variant?: 'arc' | 'dots' | 'dot-ring' | 'line' | 'rings';
  decorative?: boolean;
  /** Optional accessible text label. */
  label?: string;
  /** Force reduced motion if true. */
  reduceMotion?: boolean;
  /** Custom stroke / fill color. Default inherits or neutral. */
  color?: string;
}

export const Loader: React.FC<LoaderProps> = ({
  size = 32,
  variant = 'arc',
  decorative = false,
  label = 'Loading...',
  reduceMotion = false,
  color = 'currentColor',
  className,
  ...props
}) => {
  const gradientId = React.useId();

  return (
    <div
      role={decorative ? undefined : 'status'}
      aria-hidden={decorative || undefined}
      aria-busy={decorative ? undefined : true}
      aria-label={decorative ? undefined : label}
      className={cn('inline-flex flex-col items-center justify-center gap-2 text-[#FAFAFA]', className)}
      {...props}
    >
      {variant === 'dot-ring' && (
        <svg style={{ width: size, height: size, color }} viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <defs>
            <radialGradient id={`${gradientId}-metal`} cx="0.4" cy="0.65" r="0.7">
              <stop offset="0" stopColor="var(--color-lime-400)" />
              <stop offset="0.5" stopColor="var(--color-green-500)" />
              <stop offset="0.82" stopColor="var(--color-green-700)" />
              <stop offset="1" stopColor="var(--color-green-950)" />
            </radialGradient>
            <radialGradient id={`${gradientId}-reflection`} cx="0.3" cy="0.15" r="0.7">
              <stop offset="0" stopColor="var(--color-lime-100)" stopOpacity="0.7" />
              <stop offset="0.3" stopColor="var(--color-green-200)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--color-white)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[
            { cx: 10, cy: 2.5 },
            { cx: 16.5, cy: 6.25 },
            { cx: 16.5, cy: 13.75 },
            { cx: 10, cy: 17.5 },
            { cx: 3.5, cy: 13.75 },
            { cx: 3.5, cy: 6.25 },
          ].map((dot, index) => (
            <g
              key={`${dot.cx}-${dot.cy}`}
              className={cn(!reduceMotion && 'dot-ring-dot')}
              style={{ animationDelay: `${index / 6 - 1}s` }}
            >
              <circle cx={dot.cx} cy={dot.cy} r="2.35" fill={`url(#${gradientId}-metal)`} />
              <circle cx={dot.cx} cy={dot.cy} r="2.35" fill={`url(#${gradientId}-reflection)`} />
            </g>
          ))}
        </svg>
      )}
      {/* 1. Rotating Arc Variant */}
      {variant === 'arc' && (
        <div style={{ width: size, height: size }} className="relative flex items-center justify-center">
          <svg
            className={cn('w-full h-full', !reduceMotion && 'animate-spin')}
            style={{ animationDuration: '2.5s' }}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="20"
              cy="20"
              r="16"
              stroke="#1F1F1F"
              strokeWidth="3"
              className="opacity-60"
            />
            <motion.circle
              cx="20"
              cy="20"
              r="16"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="100"
              strokeDashoffset="65"
            />
          </svg>
        </div>
      )}

      {/* 2. Breathing Dots Variant */}
      {variant === 'dots' && (
        <div
          style={{ width: size * 1.5, height: size * 0.4 }}
          className="flex items-center justify-center gap-1.5"
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="rounded-full bg-current"
              style={{
                width: Math.max(4, size * 0.18),
                height: Math.max(4, size * 0.18),
                backgroundColor: color !== 'currentColor' ? color : undefined,
              }}
              animate={
                reduceMotion
                  ? { opacity: [0.3, 0.8, 0.3] }
                  : {
                      scale: [0.8, 1.25, 0.8],
                      opacity: [0.3, 1, 0.3],
                    }
              }
              transition={{
                duration: 1.4,
                repeat: Infinity,
                delay: i * 0.22,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      )}

      {/* 3. Sliding Line Variant */}
      {variant === 'line' && (
        <div
          style={{ width: size * 2, height: Math.max(3, size * 0.08) }}
          className="relative rounded-full bg-[#141414] overflow-hidden"
        >
          <motion.div
            className="absolute top-0 bottom-0 rounded-full"
            style={{
              width: '35%',
              backgroundColor: color !== 'currentColor' ? color : '#FAFAFA',
            }}
            animate={
              reduceMotion
                ? { opacity: [0.4, 1, 0.4] }
                : {
                    left: ['-35%', '100%'],
                  }
            }
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: [0.4, 0, 0.2, 1],
            }}
          />
        </div>
      )}

      {/* 4. Concentric Expanding Rings Variant */}
      {variant === 'rings' && (
        <div style={{ width: size, height: size }} className="relative flex items-center justify-center">
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              className="absolute inset-0 rounded-full border border-current"
              style={{
                borderColor: color !== 'currentColor' ? color : undefined,
              }}
              animate={
                reduceMotion
                  ? { opacity: [0.2, 0.6, 0.2] }
                  : {
                      scale: [0.6, 1.15],
                      opacity: [0.8, 0],
                    }
              }
              transition={{
                duration: 2.2,
                repeat: Infinity,
                delay: i * 0.9,
                ease: 'easeOut',
              }}
            />
          ))}
          <span
            className="rounded-full bg-current"
            style={{
              width: Math.max(4, size * 0.2),
              height: Math.max(4, size * 0.2),
              backgroundColor: color !== 'currentColor' ? color : undefined,
            }}
          />
        </div>
      )}

      {label && <span className="sr-only">{label}</span>}
    </div>
  );
};
