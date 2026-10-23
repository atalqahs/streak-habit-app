/** Hand-drawn inline SVG icons — one consistent 2px stroke family, no icon package. */

type Props = { size?: number; className?: string };

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export const Flame = ({ size = 14, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path
      fill="var(--fire)"
      d="M13.2 1.6c.5 3-1 4.9-2.6 6.6C8.9 10 7 11.9 6.4 14.6a6.1 6.1 0 0 0 5.6 7.8 6.3 6.3 0 0 0 6.6-6.2c0-2.7-1.2-4.6-2.4-6.1-.4 1.3-1.1 2.3-2.2 2.8.6-3.9-.3-8-.8-11.3Z"
    />
    <path
      fill="var(--fire-core)"
      d="M12.3 13.2c-.1 1.5-1 2.4-1.8 3.2-.6.7-.9 1.4-.8 2.2a2.5 2.5 0 0 0 5 .1c.1-1.5-.7-2.6-1.4-3.4-.1.5-.4 1-.8 1.2.1-1.2 0-2.3-.2-3.3Z"
    />
  </svg>
);

export const Hourglass = ({ size = 13, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <g {...stroke} stroke="var(--amber)" strokeWidth={2.2}>
      <path d="M6 2.5h12M6 21.5h12" />
      <path d="M7.5 2.5v3.2c0 1.6.8 3 2.1 3.9L12 11.5l2.4-1.9a4.8 4.8 0 0 0 2.1-3.9V2.5M7.5 21.5v-3.2c0-1.6.8-3 2.1-3.9l2.4-1.9 2.4 1.9a4.8 4.8 0 0 1 2.1 3.9v3.2" />
    </g>
    <path fill="var(--amber)" d="M9.4 19.6c0-1 .9-1.9 2.6-3 1.7 1.1 2.6 2 2.6 3Z" />
  </svg>
);

export const Check = ({ size = 16, className }: Props) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path {...stroke} strokeWidth={3} d="m6 12.5 4 4 8-9" />
  </svg>
);

const make = (d: string, defaultSize = 20) =>
  function Icon({ size = defaultSize, className }: Props) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
        <path {...stroke} d={d} />
      </svg>
    );
  };

export const Plus = make('M12 5v14M5 12h14');
export const Minus = make('M5 12h14');
export const ChevronLeft = make('m15 5-7 7 7 7');
export const ChevronRight = make('m9 5 7 7-7 7');
export const ChevronUp = make('m5 15 7-7 7 7');
export const ChevronDown = make('m5 9 7 7 7-7');
export const Close = make('M6 6l12 12M18 6 6 18', 18);
export const Settings = make(
  'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 13.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.2a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1A2 2 0 1 1 7.1 3.3l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.1a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.1a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
);
export const Download = make('M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14', 19);
export const Upload = make('M12 15.5V4.5m0 0L7.5 9M12 4.5 16.5 9M5 19.5h14', 19);
export const Reorder = make('M4 7h16M4 12h16M4 17h16', 19);
