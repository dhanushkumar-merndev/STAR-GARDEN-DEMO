import {
  LuArrowLeft,
  LuArrowRight,
  LuArrowUp,
  LuArrowUpRight,
  LuAward,
  LuBuilding2,
  LuCalendar,
  LuCheck,
  LuChevronRight,
  LuCircleCheck,
  LuClipboardCheck,
  LuClock,
  LuDroplets,
  LuFlower2,
  LuLayoutGrid,
  LuLeaf,
  LuMail,
  LuMapPin,
  LuMenu,
  LuPackage,
  LuPhone,
  LuPhoneCall,
  LuQuote,
  LuSalad,
  LuScissors,
  LuSearch,
  LuSend,
  LuShieldCheck,
  LuSparkles,
  LuSprout,
  LuSun,
  LuTrees,
  LuTruck,
  LuUser,
  LuUsers,
  LuWarehouse,
  LuX,
} from 'react-icons/lu'
import { FaWhatsapp } from 'react-icons/fa'

// Explicit registry rather than `import * as Icons`. A namespace import pulls the
// whole icon set into the bundle because nothing can be tree-shaken out of it —
// that alone was a large slice of the old 1.1 MB bundle.
const registry = {
  ArrowLeft: LuArrowLeft,
  ArrowRight: LuArrowRight,
  ArrowUp: LuArrowUp,
  ArrowUpRight: LuArrowUpRight,
  Award: LuAward,
  Building2: LuBuilding2,
  Calendar: LuCalendar,
  Check: LuCheck,
  ChevronRight: LuChevronRight,
  CircleCheck: LuCircleCheck,
  ClipboardCheck: LuClipboardCheck,
  Clock: LuClock,
  Droplets: LuDroplets,
  Flower2: LuFlower2,
  LayoutGrid: LuLayoutGrid,
  Leaf: LuLeaf,
  Mail: LuMail,
  MapPin: LuMapPin,
  Menu: LuMenu,
  Package: LuPackage,
  Phone: LuPhone,
  PhoneCall: LuPhoneCall,
  Quote: LuQuote,
  Salad: LuSalad,
  Scissors: LuScissors,
  Search: LuSearch,
  Send: LuSend,
  ShieldCheck: LuShieldCheck,
  Sparkles: LuSparkles,
  Sprout: LuSprout,
  Sun: LuSun,
  Trees: LuTrees,
  Truck: LuTruck,
  User: LuUser,
  Users: LuUsers,
  Warehouse: LuWarehouse,
  WhatsApp: FaWhatsapp,
  X: LuX,
}

// `size` stays a px number at every call site, but it is applied in rem so icons
// grow with the root font size on large screens like the rest of the layout.
// CSS width/height win over the width/height attributes react-icons renders.
export default function Icon({ name, className = '', size = 24, strokeWidth = 1.75, title }) {
  const Cmp = registry[name] || registry.Leaf
  const edge = `${size / 16}rem`
  return (
    <Cmp
      className={className}
      size={size}
      style={{ width: edge, height: edge }}
      strokeWidth={strokeWidth}
      title={title}
      aria-hidden={title ? undefined : 'true'}
      focusable="false"
    />
  )
}
