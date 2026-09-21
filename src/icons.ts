/**
 * Every icon in Doodle, in one place. Hugeicons (stroke set), through one
 * component. Import the glyph you need by its job, not by what it draws —
 * `CloseIcon` rather than `Cancel01Icon` — so a swap is one line here.
 *
 *   import { Icon, CloseIcon } from "./icons";
 *   <Icon icon={CloseIcon} size={13} strokeWidth={2} />
 */
export { HugeiconsIcon as Icon } from "@hugeicons/react";
export type { IconSvgElement } from "@hugeicons/react";

export {
  Cancel01Icon as CloseIcon,
  Add01Icon as PlusIcon,
  MinusSignIcon as MinusIcon,
  ArrowLeft01Icon as ChevronLeftIcon,
  ArrowRight01Icon as ChevronRightIcon,
  ArrowDown01Icon as ChevronDownIcon,
  MoreVerticalIcon as MoreIcon,
  PlayIcon as RunIcon,
  Copy01Icon as CopyIcon,
  Menu01Icon as MenuIcon,
  FullScreenIcon as FitIcon,
  ViewIcon as EyeIcon,
  Link01Icon as LinkIcon,
  Clock01Icon as HistoryIcon,
  FloppyDiskIcon as SaveIcon,
  CubeIcon as ModelIcon,
  Image01Icon as ImageIcon,
  SparklesIcon as GenerateIcon,
  Settings01Icon as SettingsIcon,
  Tick02Icon as CheckIcon,
  TextIcon,
  Flowchart01Icon as GraphIcon,
  DiceIcon,
} from "@hugeicons/core-free-icons";
