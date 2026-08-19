// All factual content sourced from stargardens.in — preserved verbatim/near-verbatim
// so the redesign carries forward everything the original site communicated.

export const company = {
  name: 'Star Gardens',
  tagline: 'Bringing Nature into Your Space',
  subTagline: 'For a Happier & Healthier Life',
  intro:
    "Star Gardens provides plants on a rental basis, with a wide range of indoor and outdoor plants for corporate companies. Plants on Hire is the second-generation family business service provider in Bangalore.",
  phone: '+91 97430 30555',
  phoneHref: '+919743030555',
  whatsappHref: '919743030555',
  email: 'abhi@stargardens.in',
  contactPerson: 'Abhishek Suhas',
  website: 'www.stargardens.in',
  siteUrl: 'https://www.stargardens.in',
  // Staff sign-in lives on the separate CRM deployment, not on this site.
  crmUrl: 'https://crm.stargardens.in/login',
  headOffice:
    'No. 18, 1st Floor, 1st Main, BSK 1st Stage, Srinivasa Nagar, 80 Feet Main Road, Bengaluru, Karnataka 560050',
  wholesaleNursery: 'Kumulgudu, Bangalore',
  establishedNote: '14 years successfully completed with all major clients in Bangalore',
  founded: 2009,
  logo: '/images/logo.webp',
  // hero.webp is the logo lockup on a white field, not a photograph — it reads as
  // ghost text behind the hero copy and makes a poor social card. Use real work.
  ogImage: '/images/gallery-2.webp',
}

// Real project photography supplied by Star Gardens
export const media = {
  homeHero: '/images/gallery-2.webp',
  homePanorama: '/images/gallery-1.webp',
  aboutBanner: '/images/service-landscape-design.webp',
  servicesBanner: '/images/service-green-roofs.webp',
  clientsBanner: '/images/gallery-2.webp',
  plantsBanner: '/images/plants-list.webp',
  contactBanner: '/images/service-indoor-plants.webp',
  clientsCollage: '/images/clients-collage.webp',
  greenRoofs: '/images/service-green-roofs.webp',
  officeBioWall: '/images/gallery-2.webp',
}

export const foundingStory = [
  "Star Gardens' owner and founder set up the business as a natural progression from his family's traditional involvement in agriculture. Right from the outset, the company's aim was to design, create and maintain gardens.",
  'From being the first garden business created at Punganur (Andhra Pradesh) on 30 acres of land two decades ago, the venture grew steadily on a foundation of hands-on horticultural knowledge.',
  'As the business grew, the team formally established Star Gardens in 2009. Today the business has grown to become one of the largest landscaping and garden centres in Karnataka & Andhra Pradesh — running its own production unit for plant cultivation, importing additional plants from abroad, and supplying decorative products alongside continuous upgrades to design and irrigation technique.',
  'That reputation has been built up over the years through the knowledge accrued, the quality of work delivered, and an extensive, loyal clientele across Bangalore.',
]

export const stats = [
  { label: 'Green Area Covered', value: 2700000, suffix: ' sq.ft', note: '(63 Acres) · 2014–2022' },
  { label: 'Trees Planted', value: 104000, suffix: '+' },
  { label: 'Shrubs Planted', value: 340000, suffix: '+' },
  { label: 'Ground Cover', value: 685000, suffix: ' sq.ft' },
]

export const homeStatsShort = [
  { label: 'Acres Greened', value: 63, suffix: '+' },
  { label: 'Trees Planted', value: 104000, suffix: '+' },
  { label: 'Shrubs Planted', value: 340000, suffix: '+' },
  { label: 'Years of Legacy', value: 15, suffix: '+' },
]

export const services = [
  {
    slug: 'landscape-design',
    name: 'Landscape Design & Execution',
    short: 'Turnkey design, build and maintenance for villas, resorts, farmhouses, offices and corporate parks.',
    icon: 'Trees',
    image: '/images/service-landscape-design.webp',
    description:
      "Star Gardens offers services on a turnkey basis, taking entire responsibility for soft landscaping and hard-scape gardening. The team specialises in premium landscape execution across Bangalore and South India for villas, resorts, farmhouses, apartments, offices and commercial properties, having landscaped over 27 lakh square feet since 2009.",
    features: [
      'Design, build & maintenance solutions from a single team',
      'Terrace garden creation with pergolas, sit-outs and water features',
      'Vertical gardens, bio-walls, balcony and kitchen gardens',
      'Annual maintenance programs with weekly/biweekly pruning, fertilization, lawn care & pest management',
      'Irrigation system installation and management',
      'Lighting and water feature design for resort-style transformations',
      'Free site visits for prospective projects',
    ],
    audience: ['Premium villa owners', 'Builders & developers', 'Resorts & hospitality projects', 'Architects', 'Corporate parks'],
    portfolio: [
      { name: 'Casa Grande Luxus', place: 'K.R. Puram', detail: '110-villa development with three parks and individual front/back yards — 12 acres' },
      { name: 'Farm House', place: 'Bidadi', detail: '25-acre property with automated irrigation' },
      { name: 'Resort', place: 'Mysore', detail: '32-acre hillside resort utilising natural slopes with automated systems' },
      { name: 'Bungalow', place: 'RT Nagar, Bangalore', detail: 'Full compound landscaping' },
      { name: 'Farm House', place: 'Ramanagara', detail: 'Complete design, development & maintenance' },
      { name: 'Flower Garden', place: 'Hyderabad', detail: 'Tropical garden installation' },
    ],
  },
  {
    slug: 'plants-on-hire',
    name: 'Plants on Hire',
    short: 'Rental indoor & outdoor plants for corporate offices, fully maintained — no upfront investment.',
    icon: 'Sprout',
    image: '/images/service-plants-on-hire.webp',
    description:
      'Star Gardens is the second-generation family business service provider in Bangalore for rental plants on a contract basis for corporate companies, with expertise in selecting the right indoor and outdoor plants for every space.',
    features: [
      'Indoor plants chosen for air-purification, removing up to 90% of chemicals in the air',
      'Outdoor plants selected based on soil conditions, temperature, light access and disease resistance',
      'Planters matched to complement plants and space, in a range of materials and colours',
      'Regular maintenance: cutting, pruning, organic pesticides, nutrition, repotting and rotation',
      'Vertical garden upkeep including drip-irrigation cleaning',
      'Plant replacement on a regular basis to keep spaces looking fresh',
    ],
    benefits: ['Improved air quality through photosynthesis', 'Reduced stress for building occupants', 'Professional landscape design consultation', 'Fresh, green environments year-round'],
  },
  {
    slug: 'office-plants',
    name: 'Office Plants on Hire',
    short: '11 years of experience keeping corporate offices green with zero maintenance burden on the client.',
    icon: 'Building2',
    image: '/images/service-office-plants.webp',
    description:
      'Star Gardens supplies live office plants for rent to companies and organisations. Its professional team carefully selects and maintains plants so they thrive in office environments, removing the need for businesses to manage plant care themselves.',
    features: [
      'Watering and nutritional support',
      'Pruning and cutting',
      'Pesticide application',
      'Replacement of unhealthy or dead plants at no extra cost',
      'Options ranging from small potted plants to large statement pieces',
      'Low-light varieties suited to indoor office settings',
    ],
    benefits: ['Improved office aesthetics', 'Better air quality', 'Reduced stress levels', 'Increased productivity', 'No upfront investment — fully managed AMC available'],
    clients: ['Swiss Re', 'OLA', 'Mercedes-Benz', 'Dassault Systèmes'],
    experience: '11 years of industry experience',
  },
  {
    slug: 'frp-planters',
    name: 'FRP Planters & Fiber Pots',
    short: 'Durable, low-maintenance fibre-reinforced-plastic planters in custom shapes, sizes and colours.',
    icon: 'Package',
    image: '/images/service-indoor-plants.webp',
    description:
      "Star Gardens offers FRP (Fibre Reinforced Plastic) planters and fibre pots for a wide range of gardening applications, with guidance on selecting and designing containers for both functional and aesthetic purposes.",
    features: [
      'Available in a wide variety of shapes, sizes and colours to complement any space',
      'Proper drainage holes to prevent water accumulation and plant damage',
      'Material thickness matched to plant weight and environmental conditions',
      'Known for durability — withstands sun exposure and temperature extremes',
      'Low maintenance beyond regular cleaning and debris removal',
      'Customisation with embossed patterns and graphics',
    ],
    useCases: ['Office plants', 'Landscape design', 'Vertical gardens', 'Balcony & terrace gardens', 'Kitchen gardens'],
  },
  {
    slug: 'vertical-garden',
    name: 'Vertical Garden / Bio-Wall / Green Wall',
    short: 'Standalone bio-wall systems with automated, recycled-water irrigation for tight urban footprints.',
    icon: 'LayoutGrid',
    image: '/images/service-vertical-garden.webp',
    description:
      'Vertical gardens are greenery solutions designed for urban spaces with limited area, creating a refreshing green corner that uplifts the overall ambience and quality of living.',
    features: [
      'Completely stand-alone system with a water-recycling irrigation system',
      'Automated, lush green plantation with minimal upkeep',
      'Weather-resistant construction for year-round outdoor exposure',
      'Fast installation — projects completed in as little as 6 hours',
      'Suited to residential balconies, indoor living spaces, commercial/industrial sites and outdoor compounds',
    ],
    benefits: ['Stress reduction', 'Enhanced indoor air quality', 'Improved mental health', 'Reduced employee sick days', 'A visible commitment to sustainability'],
  },
  {
    slug: 'balcony-garden',
    name: 'Balcony Garden',
    short: 'Apartment-scale garden design blending greenery, decking, water features and furniture.',
    icon: 'Flower2',
    image: '/images/service-balcony-garden.webp',
    description:
      'A balcony garden is a garden created, typically in an urban apartment with limited space, with plants and aesthetic elements tailored to spatial and lighting constraints.',
    features: [
      'Pergolas and vertical gardens',
      'Artificial grass and wooden decking',
      'Water features such as waterfalls',
      'Potted plants and planter arrangements in pine wood, FRP or earthen-tone containers',
      'Automated irrigation systems',
      'Outdoor furniture, from minimalist to luxury wooden-deck setups',
    ],
    portfolio: [
      { name: 'Residential Balcony', place: 'Mahadevapura', detail: 'Elegant, minimalist design with matching furniture' },
      { name: 'Residential Balcony', place: 'Basavanagudi', detail: 'Simple setup emphasising greenery and bright colour' },
      { name: 'Residential Balcony', place: 'Sarjapur', detail: 'Complex installation combining pergola, swing, waterfall & vertical garden' },
      { name: 'Residential Balcony', place: 'K.R. Puram', detail: 'Luxury wooden-deck garden with furnishings' },
      { name: 'Residential Balcony', place: 'Bellandur', detail: 'High-grade artificial grass with earthen-toned planters' },
    ],
  },
  {
    slug: 'terrace-garden',
    name: 'Terrace Garden',
    short: 'Rooftop transformations — pergolas, seating, BBQ decks, fountains and Zen-inspired landscapes.',
    icon: 'Sun',
    image: '/images/service-terrace-garden.webp',
    description:
      'Terrace gardens make the ultimate use of space to enhance the aesthetic beauty of urban homes and workspaces, transforming rooftops, patios and terraces into functional green spaces for city dwellers lacking traditional yards.',
    features: [
      'Pergolas and shade structures',
      'Bar counters, seating areas and barbeque installations',
      'Lawns, gravel pathways and fountains / water features',
      'Vegetable and kitchen garden sections',
      'Metal fabrication elements',
      'Full project responsibility — design, civil work, electrical, plumbing, fabrication and final plantation',
    ],
    styles: [
      { name: 'Contemporary', detail: 'Space-efficient solutions addressing a small footprint, restricted access and an overlooked position' },
      { name: 'Zen / Asian Garden', detail: 'Bamboo groves and rocks, Buddha sculpture, lanterns and pergola, blending Chinese and Japanese aesthetics with Indian elements' },
    ],
  },
  {
    slug: 'kitchen-garden',
    name: 'Kitchen Garden',
    short: 'Grow chemical-free vegetables and herbs at home with automated drip irrigation.',
    icon: 'Salad',
    image: '/images/service-kitchen-garden.webp',
    description:
      "A kitchen garden is an urban gardening solution for apartment dwellers with limited space — created at home to produce complete organic vegetables and fruits without any chemicals.",
    features: [
      'Chemical-free, homegrown organic vegetables and fruits',
      'Designed to fit constrained urban environments',
      'Pergolas and water features for aesthetic appeal',
      'A sit-out area for evenings with family and friends',
      'Automated drip irrigation for convenience',
      'Elevated framework designs that need no waterproofing',
    ],
    portfolio: [
      { name: 'Kitchen Garden', place: 'Kanakapura Road', detail: 'Maximum yield through strategic plant placement' },
      { name: 'Kitchen Garden', place: 'Rajajinagar', detail: 'Compact urban layout with drip irrigation' },
      { name: 'Kitchen Garden', place: 'Sarjapur', detail: 'Elevated framework with pergola and seating' },
    ],
  },
]

export const maintenance = {
  indoor: {
    title: 'Indoor Plant Maintenance',
    detail: 'Monthly or yearly contracts, or tailored solutions, covering:',
    items: ['Leaf cleaning', 'Feeding', 'Watering', 'Plant replacement', 'Pest & disease prevention', 'Lighting control'],
  },
  outdoor: {
    title: 'Outdoor Garden & Landscape Maintenance',
    items: [
      'General cleaning', 'Watering', 'Turf care', 'Shrub & tree care', 'Palm protection',
      'Macro-nutrition', 'Micro-nutrition', 'Cutting & pruning', 'Soil loosening',
      'Application of organic pesticides & herbicides',
    ],
  },
  consulting: {
    title: 'Horticulture Consulting',
    detail:
      "Regular visits and guidance from a horticulturist-cum-landscapist to improve the look and quality of plants across tech parks, industrial layouts, residential layouts, farmhouses, resorts, schools, colleges, coffee & tea estates, and villa projects.",
  },
}

export const process = [
  { step: '01', title: 'Design Consultation', detail: 'A free site visit and consultation to understand the space, light, and your vision — followed by a tailored design.' },
  { step: '02', title: 'Delivery & Installation', detail: 'Sourcing from our own nursery and imports, professional installation of plants, planters, irrigation and hardscape.' },
  { step: '03', title: 'Ongoing Maintenance', detail: 'Scheduled upkeep with free plant replacement if needed, keeping every space consistently green and healthy.' },
]

export const finishedProjects = [
  { name: 'Casa Grande Luxus', place: 'K.R. Puram', area: '12 Acres' },
  { name: 'VA Tech Wabag 20MLD', place: 'Agara, HSR Layout', area: '2 Acres' },
  { name: 'VA Tech Wabag 90MLD', place: 'Challaghatta', area: '16 Acres' },
  { name: 'VA Tech Wabag 120MLD', place: 'Panathur', area: '23 Acres' },
  { name: 'VA Tech Wabag 50MLD', place: 'Mangalore', area: '5 Acres' },
]

export const ongoingProjects = [
  { name: 'VA Tech Wabag 150MLD', place: 'Challaghatta', area: '32 Acres' },
  { name: 'VA Tech Wabag 60MLD', place: 'Mangalore', area: '9 Acres' },
]

export const currentMaintenance = [
  { name: 'OLA Head Office', place: 'Koramangala', area: '4,50,000 sq.ft' },
  { name: 'Swiss Re', place: 'EGL', area: '3,00,000 sq.ft' },
  { name: 'Hotel Hilton (5-Star)', place: 'EGL', area: 'Since 2014' },
  { name: 'Nature Luxuri', place: 'Bannerghatta Main Road', area: '14 Acres' },
  { name: 'Confident Township', place: 'Sarjapur Road', area: '43 Acres' },
  { name: 'Balaji Estate', place: 'Madikeri', area: '100 Acres' },
  { name: 'Balaji Plantation', place: 'Madikeri', area: '200 Acres' },
  { name: 'Thomson Estate', place: 'Madikeri', area: '140 Acres' },
  { name: 'Stone Castle', place: 'Bannerghatta Main Road', area: '5 Acres' },
]

// Curated set for the homepage marquee (most widely recognised names)
export const clientNames = [
  'Airbus', 'Boeing', 'Accenture', 'Disney+ Hotstar', 'Wipro', 'OLA',
  'Swiss Re', 'Titan', 'Maruti Suzuki', 'Bayer', 'Johnson & Johnson', 'CBRE',
  'PayU', 'Siemens Energy', 'Zepto', 'Unacademy', 'VFS Global', 'Novo Nordisk',
  'ABB India', 'Hotel Hilton', 'VA Tech Wabag', 'Casa Grande Luxus',
]

// Full roster as published on Star Gardens' own "Our Esteemed Clients" graphic,
// plus additional corporate/landscape clients named across the site's text pages
export const allClientNames = [
  'ISS Facility Services', 'ABS India', 'Airbus', 'Accenture', 'Boeing', 'Cove Stays',
  'CData', 'FCBULKA', 'Givaudan', 'Disney+ Hotstar', 'MOOG', 'OLA', 'Omega Healthcare',
  'Sensedge', 'Swiss Re', 'Softtek', 'Titan', 'Teachmint', 'Unacademy', 'VFS Global',
  'Vene Energy', 'Xylem', 'e-Cradle', 'Novo Nordisk', 'LC Androit', 'Naalasha', 'Tanishq',
  'eClinical', 'Matrix Telecom & Security', 'Joules & Watts', 'Maruti Suzuki', 'Buxus Media',
  'Silicrest', 'Moonfrog', 'Bayer', 'Zeta', 'vmobi', 'Convergint', 'NNE', 'Amagi', 'SiFive',
  'IGT', 'Brigade Magnum', 'Brigade Opus', 'STL Digital', 'Johnson & Johnson', 'Solvez',
  'SmartQ', 'Avality', 'GEA', 'Innoware', 'Yokogawa', 'Teclever', 'Advaara', 'Kazam',
  'smallcase', 'Abbelon Estate', 'Super Health Hospital', 'Zepto', 'ABB India', 'NeoNiche',
  'Siemens Energy', 'PayU', 'Sodexo', '2gether', 'Zyeta Interiors', 'Inteligence',
  'Case Platforms', 'CBRE', 'Wipro', 'JioStar', 'Novi Digital', 'Smartworks', 'Aerospace',
  'Savinyt', 'Compass Group', 'Appexon', 'Technosoft Engineering',
  'Mercedes-Benz', 'Dassault Systèmes', 'Hotel Hilton', 'VA Tech Wabag', 'Casa Grande Luxus',
  'Confident Group', 'Nature Luxuri', 'Balaji Estate', 'Thomson Estate', 'Stone Castle',
]

export const whyChooseUs = [
  { title: 'Second-Generation Family Business', detail: 'Roots in family agriculture and 15+ years building Star Gardens since 2009.', icon: 'Users' },
  { title: 'Own Production Nursery', detail: 'A dedicated cultivation unit plus imports, so plant quality and supply stay consistent.', icon: 'Warehouse' },
  { title: 'Turnkey Responsibility', detail: 'One team for design, civil work, irrigation, planting and long-term maintenance.', icon: 'ClipboardCheck' },
  { title: 'Free Replacement Guarantee', detail: 'Unhealthy plants under maintenance contracts are replaced at no extra cost.', icon: 'ShieldCheck' },
  { title: 'Trusted by Major Corporates', detail: 'Long-running AMC relationships with names like Swiss Re, OLA and Hotel Hilton.', icon: 'Award' },
  { title: 'End-to-End Supply', detail: 'Plants, FRP planters, irrigation and decorative products delivered and installed by our own team.', icon: 'Truck' },
]

// Full plant catalogue as listed on the original site. `img` is the plant's own
// photograph from stargardens.in; Banyan is the one entry the source site never
// photographed, so PlantCard falls back to an illustrated tile for it.
export const plants = [
  { name: 'Money Plant Marble', sci: 'Epipremnum aureum', category: 'Air-Purifying', img: '/images/plants/money-plant-marble.webp', desc: 'Variegated leaves with a mix of green and white or cream patterns, suited for indoor environments.' },
  { name: 'Syngonium Green', sci: 'Syngonium podophyllum', category: 'Foliage', img: '/images/plants/syngonium-green.webp', desc: 'Also called Arrowhead Plant — heart-shaped leaves that start light green and deepen as they mature.' },
  { name: 'Areca Palm', sci: 'Dypsis lutescens', category: 'Foliage', img: '/images/plants/areca-palm.webp', desc: 'Feathery, arching fronds with a tropical appearance; native to Madagascar.' },
  { name: 'Rubber Plant Black', sci: "Ficus elastica 'Black Prince'", category: 'Foliage', img: '/images/plants/rubber-plant-black.webp', desc: 'Dark, almost black-purple leaves with a glossy finish.' },
  { name: 'Aglaonema Pink Lipstick', sci: 'Aglaonema commutatum', category: 'Foliage', img: '/images/plants/aglaonema-pink-lipstick.webp', desc: 'Bold pink, red and green hues create a distinctive appearance in any space.' },
  { name: 'Money Plant Green', sci: 'Epipremnum aureum', category: 'Air-Purifying', img: '/images/plants/money-plant-green.webp', desc: 'Well known for air-purifying properties, removing toxins like formaldehyde and benzene.' },
  { name: 'Snake Plant', sci: 'Dracaena trifasciata', category: 'Air-Purifying', img: '/images/plants/snake-plant.webp', desc: "Also called Mother-in-Law's Tongue — hardy, low-maintenance, releases oxygen at night." },
  { name: 'Zamia Calcus', sci: 'Zamia furfuracea', category: 'Foliage', img: '/images/plants/zamia-calcus.webp', desc: 'Cycad with stiff, dark green, feather-like leaves in a rosette pattern; native to tropical Americas.' },
  { name: 'Fiddle Leaf Fig', sci: 'Ficus lyrata', category: 'Foliage', img: '/images/plants/fiddle-leaf-fig.webp', desc: 'Large, glossy, violin-shaped leaves that create a bold, modern statement; filters air pollutants.' },
  { name: 'Philodendron', sci: 'Philodendron spp.', category: 'Air-Purifying', img: '/images/plants/philodendron.webp', desc: 'Vining and upright varieties with lush green foliage and strong air-purifying qualities.' },
  { name: 'Anthurium Red', sci: 'Anthurium andraeanum', category: 'Flowering', img: '/images/plants/anthurium-red.webp', desc: 'Glossy, heart-shaped red flowers and dark green leaves; symbolises hospitality and good luck.' },
  { name: 'Song of India', sci: 'Dracaena reflexa', category: 'Air-Purifying', img: '/images/plants/song-of-india.webp', desc: 'Long, narrow leaves — green with yellow edges; known for air-purifying abilities.' },
  { name: 'Philodendron Red Congo', sci: 'Philodendron tatei', category: 'Foliage', img: '/images/plants/philodendron-red-congo.webp', desc: 'Self-supporting plant with large, deep green leaves that emerge red.' },
  { name: 'Aglaonema Pink', sci: 'Aglaonema commutatum', category: 'Foliage', img: '/images/plants/aglaonema-pink.webp', desc: 'Vibrant indoor plant with striking pink and green leaves; helps filter indoor pollutants.' },
  { name: 'Dracaena Massangeana', sci: 'Dracaena fragrans', category: 'Air-Purifying', img: '/images/plants/dracaena-massangeana.webp', desc: 'Tall, cane-like plant with long green leaves featuring a yellow stripe.' },
  { name: 'Parrotline', sci: 'Epipremnum aureum', category: 'Air-Purifying', img: '/images/plants/parrotline.webp', desc: 'Fast-growing, easy-care Money Plant variety with bright variegation resembling parrot colours.' },
  { name: 'Rain Lily', sci: 'Zephyranthes spp.', category: 'Flowering', img: '/images/plants/rain-lily.webp', desc: 'Blooms suddenly after rain with dainty pink, white or yellow flowers; symbolises renewal.' },
  { name: 'Syngonium Pink', sci: 'Syngonium podophyllum', category: 'Foliage', img: '/images/plants/syngonium-pink.webp', desc: 'Stunning pink and green variegated leaves add colour to indoor spaces.' },
  { name: 'Aglaonema', sci: 'Aglaonema commutatum', category: 'Foliage', img: '/images/plants/aglaonema.webp', desc: 'Also called Chinese Evergreen — patterns including green, silver and red hues.' },
  { name: 'Golden Dracaena', sci: 'Dracaena fragrans', category: 'Foliage', img: '/images/plants/golden-dracaena.webp', desc: 'Also called Corn Plant — dark green leaves with yellow/gold streaks; thrives in low light.' },
  { name: 'Rubber Plant Variegated', sci: 'Ficus elastica', category: 'Foliage', img: '/images/plants/rubber-plant-variegated.webp', desc: 'Multi-coloured foliage mixing green, white, cream, and sometimes pink or yellow.' },
  { name: 'Peace Lily', sci: 'Spathiphyllum spp.', category: 'Air-Purifying', img: '/images/plants/peace-lily.webp', desc: 'Beautiful white flowers and lush green foliage; easy to care for.' },
  { name: 'Money Plant Gold', sci: 'Epipremnum aureum', category: 'Air-Purifying', img: '/images/plants/money-plant-gold.webp', desc: 'Vibrant green and golden-yellow variegated leaves; symbolises prosperity.' },
  { name: 'Chinese Doll', sci: 'Radermachera sinica', category: 'Foliage', img: '/images/plants/chinese-doll.webp', desc: 'Ornamental houseplant with delicate, glossy, dark green leaves and a tree-like appearance.' },
  { name: 'Aglaonema Ice Plant', sci: 'Aglaonema commutatum', category: 'Foliage', img: '/images/plants/aglaonema-ice-plant.webp', desc: 'Striking silver-green foliage gives an elegant, frosty appearance; tolerates low light.' },
  { name: 'Aralia', sci: 'Polyscias spp.', category: 'Air-Purifying', img: '/images/plants/aralia.webp', desc: 'Feathery, finely divided leaves or broad glossy foliage; improves air quality by filtering toxins.' },
  { name: 'Monstera', sci: 'Monstera deliciosa', category: 'Foliage', img: '/images/plants/monstera.webp', desc: 'Large, split leaves giving a unique, jungle-like appearance.' },
  { name: 'Schefflera', sci: 'Schefflera arboricola', category: 'Air-Purifying', img: '/images/plants/schefflera.webp', desc: 'Called the Umbrella Plant — glossy green leaves arranged like an umbrella; purifies air.' },
  { name: 'Philodendron Green Congo', sci: 'Philodendron tatei', category: 'Foliage', img: '/images/plants/philodendron-green-congo.webp', desc: 'Lush, upright-growing plant with broad, glossy green leaves in a compact, bushy form.' },
  { name: 'Money Plant Variegated', sci: 'Epipremnum aureum', category: 'Air-Purifying', img: '/images/plants/money-plant-variegated.webp', desc: 'Fast-growing vine with heart-shaped, white-and-yellow variegated leaves.' },
  { name: 'Dieffenbachia', sci: 'Dieffenbachia seguine', category: 'Foliage', img: '/images/plants/dieffenbachia.webp', desc: 'Large, variegated green and cream-coloured leaves; toxic if ingested.' },
  { name: 'Anthurium White', sci: 'Anthurium andraeanum', category: 'Flowering', img: '/images/plants/anthurium-white.webp', desc: 'Glossy white blooms and deep green foliage; symbolises peace and elegance.' },
  { name: 'Geranium', sci: 'Pelargonium spp.', category: 'Flowering', img: '/images/plants/geranium.webp', desc: 'Colourful flowering plants with pink, red or white blooms from spring to early autumn.' },
  { name: 'Banyan Plant', sci: 'Ficus benghalensis', category: 'Landscape Tree', desc: 'Majestic evergreen tree with distinctive aerial roots.' },
]

export const plantCategories = ['All', 'Air-Purifying', 'Foliage', 'Flowering', 'Landscape Tree']

export const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Landscape Designers', to: '/services/landscape-design' },
  { label: 'Services', to: '/services' },
  { label: 'Clients', to: '/clients' },
  { label: 'All Plants', to: '/plants' },
  { label: 'Blog', to: '/blog' },
  { label: 'Contact Us', to: '/contact' },
]

// Structured data for the business itself. Rendered on the homepage so Google can
// attach the address, phone and service area to the brand.
export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'LandscapingBusiness',
  name: company.name,
  description: company.intro,
  url: company.siteUrl,
  logo: `${company.siteUrl}${company.logo}`,
  image: `${company.siteUrl}${company.ogImage}`,
  telephone: company.phone,
  email: company.email,
  foundingDate: String(company.founded),
  priceRange: '₹₹',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'No. 18, 1st Floor, 1st Main, BSK 1st Stage, Srinivasa Nagar, 80 Feet Main Road',
    addressLocality: 'Bengaluru',
    addressRegion: 'Karnataka',
    postalCode: '560050',
    addressCountry: 'IN',
  },
  areaServed: [
    { '@type': 'City', name: 'Bengaluru' },
    { '@type': 'State', name: 'Karnataka' },
    { '@type': 'State', name: 'Andhra Pradesh' },
  ],
  hasOfferCatalog: {
    '@type': 'OfferCatalog',
    name: 'Landscaping & Plant Services',
    itemListElement: services.map((s) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name: s.name, description: s.short },
      url: `${company.siteUrl}/services/${s.slug}`,
    })),
  },
}

/** Breadcrumb JSON-LD helper. `trail` is [{ name, path }] ending at the current page. */
export const breadcrumbJsonLd = (trail) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: trail.map((item, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: item.name,
    item: `${company.siteUrl}${item.path}`,
  })),
})
