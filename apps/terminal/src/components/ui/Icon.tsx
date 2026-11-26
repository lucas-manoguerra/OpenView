import {
  ArrowUpDown,
  Bell,
  Calendar,
  ChartCandlestick,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Filter,
  HelpCircle,
  LayoutGrid,
  List,
  Lock,
  type LucideIcon,
  type LucideProps,
  Maximize,
  Minus,
  MoreHorizontal,
  MousePointer,
  Move,
  PanelLeft,
  PanelRight,
  Pencil,
  Plus,
  Redo2,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  TrendingUp,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-preact';

export const iconRegistry = {
  'arrow-up-down': ArrowUpDown,
  bell: Bell,
  calendar: Calendar,
  'candlestick-chart': ChartCandlestick,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  clock: Clock,
  copy: Copy,
  crosshair: Crosshair,
  eye: Eye,
  'eye-off': EyeOff,
  filter: Filter,
  'help-circle': HelpCircle,
  'layout-grid': LayoutGrid,
  list: List,
  lock: Lock,
  maximize: Maximize,
  minus: Minus,
  'more-horizontal': MoreHorizontal,
  'mouse-pointer': MousePointer,
  move: Move,
  'panel-left': PanelLeft,
  'panel-right': PanelRight,
  pencil: Pencil,
  plus: Plus,
  redo: Redo2,
  search: Search,
  settings: Settings,
  'sliders-horizontal': SlidersHorizontal,
  'trash-2': Trash2,
  'trending-up': TrendingUp,
  undo: Undo2,
  unlock: Unlock,
  x: X,
  'zoom-in': ZoomIn,
  'zoom-out': ZoomOut,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconRegistry;
export type IconSize = 'small' | 'medium' | 'large';

export type IconProps = Omit<LucideProps, 'size' | 'strokeWidth' | 'color'> & {
  name: IconName;
  size?: IconSize | number;
  color?: string;
  strokeWidth?: number;
  label?: string;
  decorative?: boolean;
  class?: string;
};

const iconSizes: Record<IconSize, number> = {
  small: 14,
  medium: 18,
  large: 22,
};

export function Icon({
  name,
  size = 'medium',
  color = 'currentColor',
  strokeWidth = 1.8,
  label,
  decorative = true,
  class: className,
  ...props
}: IconProps) {
  const IconComponent = iconRegistry[name];

  return (
    <IconComponent
      {...props}
      size={typeof size === 'number' ? size : iconSizes[size]}
      color={color}
      strokeWidth={strokeWidth}
      class={className}
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : (label ?? name)}
      role={decorative ? undefined : 'img'}
    />
  );
}
