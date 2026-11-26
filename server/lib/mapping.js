// Shared (server + browser) permit → trade → outreach-copy mapping. Pure ES module, no Node imports.
// Served to the browser at /shared/mapping.js so the UI and the alert generator use identical logic.

export const TRADES = [
  { key: 'fencing',        label: 'Fencing & Enclosures',       short: 'Fencing' },
  { key: 'landscaping',    label: 'Landscaping & Interlock',    short: 'Landscaping' },
  { key: 'waterproofing',  label: 'Waterproofing & Foundation', short: 'Waterproofing' },
  { key: 'windows',        label: 'Windows & Blinds',           short: 'Windows' },
  { key: 'decks',          label: 'Decks, Porches & Pergolas',  short: 'Decks' },
  { key: 'roofing',        label: 'Roofing & Eavestroughs',     short: 'Roofing' },
  { key: 'reno',           label: 'Basement & Interior Reno',   short: 'Reno' },
  { key: 'general',        label: 'Additions & General Contracting', short: 'General' },
  { key: 'hvac',           label: 'HVAC (Heating & Cooling)',   short: 'HVAC' },
  { key: 'electrical',     label: 'Electrical',                 short: 'Electrical' },
  { key: 'plumbing',       label: 'Plumbing & Drains',          short: 'Plumbing' },
  { key: 'pest',           label: 'Pest Control',               short: 'Pest' },
  { key: 'tree',           label: 'Tree Services',              short: 'Tree' },
  { key: 'bins',           label: 'Bin Rentals & Junk Removal', short: 'Bins' },
  { key: 'painting',       label: 'Painting',                   short: 'Painting' },
  { key: 'flooring',       label: 'Flooring',                   short: 'Flooring' },
  { key: 'drywall',        label: 'Drywall & Insulation',       short: 'Drywall' },
  { key: 'kitchen',        label: 'Kitchens, Baths & Cabinetry', short: 'Kitchen & Bath' },
  { key: 'concrete',       label: 'Concrete & Masonry',         short: 'Concrete' },
  { key: 'siding',         label: 'Siding, Stucco & Exterior',  short: 'Siding' },
  { key: 'garage',         label: 'Garage Doors',               short: 'Garage' },
  { key: 'solar',          label: 'Solar & Energy Upgrades',    short: 'Solar' },
  { key: 'security',       label: 'Security & Smart Home',      short: 'Security' },
  { key: 'pool',           label: 'Pool Service & Maintenance', short: 'Pool' },
  { key: 'cleaning',       label: 'Post-Construction Cleaning', short: 'Cleaning' },
  { key: 'moving',         label: 'Movers & Storage',           short: 'Movers' },
];

export const CODES = [
  { code: 'PE',   label: 'PE — Pool Enclosure' },
  { code: 'HPRP', label: 'HP/RP — New Home / Infill' },
  { code: 'AL',   label: 'AL — Alteration / Addition / Basement Suite' },
  { code: 'PP',   label: 'PP — Plumbing / Backwater Valve' },
  { code: 'HV',   label: 'HV — HVAC / Mechanical' },
  { code: 'TP',   label: 'TP — Tree Permit (Open Data)' },
  { code: 'DA',   label: 'DA — Development Application' },
];

export const LEAD_STATUSES = [
  { key: 'new',          label: 'New' },
  { key: 'contacted',    label: 'Contacted' },
  { key: 'quoted',       label: 'Quoted' },
  { key: 'won_archived', label: 'Won / Archived' },
];

export const tradeLabel = (key) => TRADES.find((t) => t.key === key)?.label || key;
export const tradeShort = (key) => TRADES.find((t) => t.key === key)?.short || key;

// permit code → downstream trades (ordered by strength of fit)
export const TRADES_BY_CODE = {
  PE: ['fencing', 'landscaping', 'decks', 'electrical', 'concrete', 'pool', 'bins'],
  HP: ['landscaping', 'fencing', 'windows', 'hvac', 'electrical', 'garage', 'security', 'moving', 'cleaning', 'solar', 'pest'],
  RP: ['bins', 'landscaping', 'fencing', 'windows', 'hvac', 'electrical', 'concrete', 'siding', 'garage', 'cleaning', 'pest'],
  AL: ['reno', 'general', 'hvac', 'electrical', 'plumbing', 'drywall', 'painting', 'flooring', 'kitchen', 'windows', 'waterproofing', 'bins', 'cleaning'],
  PP: ['waterproofing', 'plumbing', 'drywall'],
  HV: ['hvac', 'electrical', 'drywall', 'solar'],
  TP: ['tree', 'landscaping', 'bins'],
  DA: ['landscaping', 'electrical', 'hvac', 'bins', 'cleaning', 'security', 'concrete'],
};

// Refines the code-based mapping with what the scope text actually says (e.g. a roof permit → roofing first).
const TEXT_TRADES = [
  [/\broof|shingle|eavestrough|soffit|fascia/i, 'roofing'],
  [/\bdeck\b|porch|pergola|gazebo|cabana|balcony/i, 'decks'],
  [/\bfence|gate\b|enclosure/i, 'fencing'],
  [/interlock|driveway|walkway|landscap|retaining wall|patio/i, 'landscaping'],
  [/\bwindows?\b|\bdoors?\b|glazing|skylight/i, 'windows'],
  [/furnace|hvac|heat pump|air.?condition|\bduct|boiler|heating|cooling/i, 'hvac'],
  [/electric|\bpanel\b|ev.?charg|solar|wiring|generator/i, 'electrical'],
  [/plumb|water heater|backwater|sewer|drain|water service|water line|fixture/i, 'plumbing'],
  [/waterproof|weeping|foundation|underpin|walkout|sump/i, 'waterproofing'],
  [/\btree|stump/i, 'tree'],
  [/basement|second unit|secondary suite|in-?law|accessory dwelling|renovat|interior/i, 'reno'],
  [/addition|storey|story|rebuild|infill|new (dwelling|house|home)|garage/i, 'general'],
  [/basement|second unit|secondary suite|accessory dwelling|new (dwelling|house|home)/i, 'pest'],
  [/demoli|tear.?down|gut(ted|ting)?\b|remove existing/i, 'bins'],
  [/\bpaint/i, 'painting'],
  [/flooring|hardwood|laminate|\btil(e|es|ing)\b/i, 'flooring'],
  [/drywall|insulat|spray foam/i, 'drywall'],
  [/kitchen|bathroom|washroom|cabinet|vanit/i, 'kitchen'],
  [/concrete|masonry|\bbrick|\bstone\b|footing|retaining wall/i, 'concrete'],
  [/siding|stucco|cladding|eifs|exterior finish/i, 'siding'],
  [/garage/i, 'garage'],
  [/solar|heat pump|ev.?charg|battery storage/i, 'solar'],
  [/alarm|security|camera|smart home/i, 'security'],
  [/\bpool|hot tub|\bspa\b/i, 'pool'],
];
export function tradesFor(code, text = '') {
  const base = TRADES_BY_CODE[code] || [];
  if (code === 'DA') return base; // commercial / early-stage: keep the generic set
  const open = ['AL', 'PE', 'HP', 'RP'].includes(code);
  const hit = TEXT_TRADES.filter(([re]) => re.test(text)).map(([, k]) => k)
    .filter((k) => base.includes(k) || (open && !(k === 'reno' && code !== 'AL')));
  // text-matched trades lead (most specific), then the code defaults; for HV only one of hvac/electrical leads
  let out = [...new Set([...hit, ...base])];
  if (code === 'HV') {
    const lead = hit.filter((k) => k === 'hvac' || k === 'electrical');
    out = [...new Set([...lead, 'hvac', 'electrical'])];
  }
  return out.slice(0, 14);
}

export const PROJECT_NOUN = {
  PE: 'Backyard Project', HP: 'New Home', RP: 'New Home Build', AL: 'Home Renovation',
  PP: 'Home Upgrade', HV: 'Comfort Upgrade', TP: 'Property Project', DA: 'Development Project',
};

const WHY = {
  PE: {
    default: 'Homeowner is legally required to install a compliant perimeter fence before filling the pool—prime opportunity for fencing, patio interlock, and privacy landscaping.',
    decks: 'Pool decking, a surrounding deck or a pergola is almost always part of a pool project, and it is bought before the yard is finished.',
    electrical: 'Pools need bonding, GFCI protection and pump and lighting circuits by a licensed electrician. A natural add-on at this stage.',
    landscaping: 'A new pool means a bare, torn-up backyard. Decking, interlock surrounds, planting and privacy screening are all still undecided—get in before the pool crew leaves.',
    fencing: 'The pool cannot be filled until a compliant enclosure is in place. This homeowner has a hard deadline and needs a fence quote now.',
  },
  HP: {
    hvac: 'New builds often ship with basic builder-grade systems. Upgrades, air quality and add-on cooling are common first-year purchases.',
    electrical: 'New homeowners add EV chargers, pot lights, smart panels and backyard power soon after moving in.',
    pest: 'New builds and turned earth attract rodents and ants. Early preventative service is an easy first sale.',
    default: 'Brand-new build: the lot needs grading finish, sod or interlock, fencing, window coverings and mechanical service. Buyers decide fast once they move in.',
    landscaping: 'New-build lots arrive as bare dirt. Driveway, walkways, sod and backyard design are typically bought within months of occupancy.',
  },
  RP: {
    default: 'Custom infill: high-value rebuild on an established street. These owners spend heavily on landscaping, fencing, glazing and finishing trades.',
    landscaping: 'Infill owners invest in curb appeal to match the street. Driveway, front walkway, and rear yard are all open.',
  },
  AL: {
    default: 'Active renovation underway—the homeowner is already budgeting and hiring. Downstream trades (HVAC, electrical, plumbing, windows, finishing) are in play.',
    reno: 'Scope is already approved and the owner is in buying mode. Early contact beats the competition to the finishing and interior package.',
    waterproofing: 'New basement work or walkouts expose foundation walls. A waterproofing and drainage review fits naturally before finishing.',
    hvac: 'Added square footage or a basement suite needs ductwork, heating and cooling capacity. A strong HVAC upsell while walls are open.',
    electrical: 'New rooms or a basement suite need panel capacity, new circuits and ESA-inspected work. Electricians get called early on these.',
    general: 'Additions and structural work need a coordinating contractor, plus framing, finishing and inspections. A strong general-contracting lead.',
    plumbing: 'New bathrooms, kitchens or a basement suite mean rough-in plumbing and drains. Plumbers are booked well before drywall.',
    windows: 'New or enlarged openings mean new windows and doors. Quote before the framing is closed in.',
    pest: 'Opened-up basements and new suites are a good moment for rodent and ant proofing before walls are closed.',
  },
  PP: {
    default: 'Backwater valve and weeping tile work signals a wet basement or city flood-protection upgrade—an ideal moment to add waterproofing, sump and drainage services.',
    waterproofing: 'A backwater valve and weeping tile job means water has already been a problem. Interior or exterior waterproofing is an easy second sale.',
    plumbing: 'Active plumbing work on the property. Fixture, water-heater and drain upgrades often follow.',
  },
  HV: {
    electrical: 'A new furnace, AC or heat pump often needs a dedicated circuit or panel upgrade. Electricians are usually pulled in on the same job.',
    default: 'Mechanical permit filed: the owner is replacing or adding heating and cooling. Duct cleaning, panel upgrades, smart thermostats and air-quality add-ons follow.',
  },
  TP: {
    default: 'Tree removal under the City tree by-law. The yard is about to change: stump grinding, replanting, grading and landscape refresh are all open.',
    tree: 'Permit approved or pending for removal of a protected tree. Fastest-moving lead for a licensed arborist—the owner needs a crew booked.',
  },
  DA: {
    default: 'Early-stage development application. Not a homeowner lead—it is a pipeline signal for commercial landscaping, electrical and mechanical bids.',
  },
};

// Trade-level reasons, used when there is no permit-code-specific line for that trade.
const TRADE_WHY = {
  bins: 'Demolition, gutting or excavation fills bins fast. Crews book rentals and debris pickup before work starts.',
  painting: 'New walls, a new suite or an addition all need painting once drywall is done. Usually one of the last trades hired.',
  flooring: 'Renovated rooms, basements and additions need new flooring near the end of the job, often weeks after the permit.',
  drywall: 'New rooms, basement finishing and mechanical work mean framing to insulate, board, tape and finish.',
  kitchen: 'Renovations and new suites often include a new kitchen or bathroom. Cabinets and counters are ordered early.',
  concrete: 'Pools, rebuilds and commercial sites need pads, footings, walkways or masonry work around the project.',
  siding: 'Rebuilds and exterior alterations need new siding, stucco or cladding to finish the outside.',
  garage: 'New homes and rebuilds with garages need doors and openers, and owners often upgrade soon after moving in.',
  solar: 'New mechanical systems and new homes are a natural moment to add solar, heat pumps or battery storage.',
  security: 'New homes and new buildings need alarms, cameras and smart-home setups once construction wraps up.',
  pool: 'A new pool needs opening, closing and weekly maintenance from day one. Recurring revenue for pool service companies.',
  cleaning: 'Every finished build or renovation needs a post-construction clean before the owner moves back in.',
  moving: 'A new home means a move. Owners book movers and storage weeks before occupancy.',
};

export function whyLead(code, tradeKey) {
  const w = WHY[code] || WHY.AL;
  return (tradeKey && (w[tradeKey] || TRADE_WHY[tradeKey])) || w.default;
}

// Trade-specific social ad hooks
const HOOKS = {
  fencing: {
    PE: 'Planning a backyard pool or patio this season? Get a free City of Markham compliant fence & interlock quote.',
    default: 'Need a new fence or gate before summer? Free on-site quote from a local Markham fencing crew.',
  },
  landscaping: {
    PE: 'Pool going in? Get your decking, interlock and privacy planting designed before the dig starts. Free Markham yard consult.',
    default: 'Upgrade your driveway, walkway or backyard with interlock and landscaping. Free design consult for Markham homeowners.',
  },
  waterproofing: {
    PP: 'Wet basement or backwater valve work? Keep your foundation dry for good. Free waterproofing inspection in Markham.',
    default: 'Protect your basement from water damage. Free foundation & waterproofing inspection for Markham homeowners.',
  },
  windows: {
    default: 'Quieter, warmer, better looking. Free in-home window & blind consultation across Markham.',
  },
  reno: {
    AL: 'Planning a basement or interior renovation? Get a free Markham renovation quote and permit-ready design.',
    default: 'Finish your basement or refresh your kitchen. Free in-home renovation quote for Markham homeowners.',
  },
  hvac: {
    default: 'New furnace, AC or heat pump? Licensed Markham HVAC crew. Free quote, same-week install.',
  },
  electrical: {
    default: 'Panel upgrade, EV charger or pot lights? ESA-licensed Markham electricians. Free quote.',
  },
  decks: {
    PE: 'Pool going in? Get your deck, pergola and privacy screen designed before the dig. Free Markham quote.',
    default: 'Custom decks, porches and pergolas built to City of Markham code. Free on-site quote.',
  },
  roofing: {
    default: 'Roof, eavestrough or soffit work? Free roof inspection and written quote for Markham homeowners.',
  },
  general: {
    default: 'Planning an addition or major renovation? Free Markham project consult and permit-ready scope.',
  },
  pest: {
    default: 'New home or finished basement? Protect it from rodents and ants. Free Markham pest inspection.',
  },
  plumbing: {
    default: 'Backwater valves, drains and water-line replacements by licensed Markham plumbers. Free on-site quote.',
  },
  tree: {
    default: 'Tree removal and stump grinding with City of Markham permit help. Free arborist assessment.',
  },
  bins: { default: 'Renovating or clearing out? Same-day bin rentals and junk removal across Markham. Book in 2 minutes.' },
  painting: { default: 'New rooms deserve a clean finish. Free interior and exterior painting quote for Markham homeowners.' },
  flooring: { default: 'Hardwood, vinyl or tile for your new space. Free in-home flooring measure and quote in Markham.' },
  drywall: { default: 'Framing done? Insulation, drywall and taping by a local Markham crew. Free quote.' },
  kitchen: { default: 'Planning a new kitchen or bathroom? Free design consult and cabinetry quote in Markham.' },
  concrete: { default: 'Pads, walkways, steps and masonry repairs. Free on-site concrete quote for Markham homeowners.' },
  siding: { default: 'New siding, stucco or exterior cladding. Free exterior consult for Markham homeowners.' },
  garage: { default: 'New or replacement garage doors and openers. Free in-home quote across Markham.' },
  solar: { default: 'Cut energy bills with solar, heat pumps or battery storage. Free Markham energy assessment.' },
  security: { default: 'Alarms, cameras and smart locks for your new home. Free Markham security consult.' },
  pool: { PE: 'New pool going in? Book openings, closings and weekly care with a local Markham pool service.', default: 'Pool openings, closings and weekly maintenance across Markham. Book your season now.' },
  cleaning: { default: 'Project wrapping up? Post-construction cleaning so your home is move-in ready. Free Markham quote.' },
  moving: { default: 'Moving into a new home? Local Markham movers and storage. Free moving quote.' },
};

export function adHook(tradeKey, code, city = 'Markham') {
  const h = HOOKS[tradeKey] || HOOKS.reno;
  return (h[code] || h.default).replaceAll('Markham', city);
}

const TRADE_PHRASE = {
  fencing: 'custom fencing, gates and pool enclosures',
  landscaping: 'landscaping, interlock and outdoor living spaces',
  waterproofing: 'foundation waterproofing and drainage',
  windows: 'windows, doors and window coverings',
  reno: 'basement and interior renovations',
  hvac: 'heating, cooling and air-quality upgrades',
  electrical: 'electrical panels, EV chargers and wiring',
  decks: 'custom decks, porches and pergolas',
  roofing: 'roofing, eavestroughs and exterior repairs',
  general: 'additions, structural work and general contracting',
  pest: 'pest prevention and control',
  plumbing: 'plumbing, drains and backwater protection',
  tree: 'tree removal and arborist services',
  bins: 'bin rentals, debris removal and junk hauling',
  painting: 'interior and exterior painting',
  flooring: 'hardwood, vinyl and tile flooring',
  drywall: 'insulation, drywall and finishing',
  kitchen: 'kitchens, bathrooms and custom cabinetry',
  concrete: 'concrete, walkways and masonry',
  siding: 'siding, stucco and exterior cladding',
  garage: 'garage doors and openers',
  solar: 'solar panels, heat pumps and energy upgrades',
  security: 'alarm systems, cameras and smart-home setup',
  pool: 'pool openings, closings and maintenance',
  cleaning: 'post-construction cleaning',
  moving: 'moving and storage',
};

export function mailCopy(permit, tradeKey, company, audience = 'property', city = 'Markham') {
  const street = permit.street_name;
  const noun = PROJECT_NOUN[permit.permit_code] || 'Home Project';
  const phrase = TRADE_PHRASE[tradeKey] || 'home improvement services';
  const hood = permit.neighbourhood || city;
  const isProp = audience === 'property';
  const headline = isProp
    ? `Congrats on Your Upcoming ${noun} on ${street}!`
    : `Your Neighbours on ${street} Are Upgrading. Is Your Home Next?`;
  const sub = isProp
    ? `Free on-site quote from ${company}`
    : `${company} is working in ${hood} this season`;
  const body = isProp
    ? `We saw your recent building permit with the City of ${city}. ${company} specializes in ${phrase}, and we would be glad to give you a free, no-obligation quote before your project gets underway.`
    : `${company} is completing ${phrase} projects near you on ${street}. Book a free on-site quote and see why ${hood} homeowners call us first.`;
  const letter = isProp
    ? [
        `Congratulations on your recent building permit application with the City of ${city} (${permit.permit_number}). Projects like yours are exciting, and the details you decide on early make the biggest difference.`,
        `At ${company}, we specialize in ${phrase}. We work with ${hood} homeowners every season and know the City of ${city} requirements inside and out.`,
        `We would welcome the chance to give you a free, no-obligation quote. Bring the voucher below or mention the code when you call, and we will take 15% off your project.`,
      ]
    : [
        `Your neighbours on ${street} are upgrading their homes, and ${company} is working in ${hood} right now.`,
        `We specialize in ${phrase} and we would be glad to give you a free, no-obligation quote while our crew is nearby.`,
        `Bring the voucher below or mention the code when you call, and we will take 15% off your project.`,
      ];
  return { headline, sub, body, letter, noun, phrase };
}

export const NEIGHBOURHOOD_FSA = {
  Unionville: 'L3R', 'Markham Village': 'L3P', Cornell: 'L6B', Wismer: 'L6E', 'Box Grove': 'L6B',
  'Berczy Village': 'L6C', 'Angus Glen': 'L6C', Thornhill: 'L3T', Milliken: 'L3S',
};

// Approximate neighbourhood centres, used ONLY to place fictional demo permits on the map (with deterministic jitter).
export const NEIGHBOURHOOD_CENTROID = {
  Unionville: [43.8565, -79.3115], 'Markham Village': [43.8760, -79.2610], Cornell: [43.8830, -79.2200],
  Wismer: [43.8985, -79.2780], 'Box Grove': [43.8700, -79.2170], 'Berczy Village': [43.8890, -79.3020],
  'Angus Glen': [43.9030, -79.3150], Thornhill: [43.8200, -79.3300], Milliken: [43.8275, -79.2945],
};
export function demoCoords(id, hood) {
  const c = NEIGHBOURHOOD_CENTROID[hood];
  if (!c) return [null, null];
  let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const a = (h % 1000) / 1000, b = ((h >>> 10) % 1000) / 1000;
  return [Number((c[0] + (a - 0.5) * 0.008).toFixed(5)), Number((c[1] + (b - 0.5) * 0.010).toFixed(5))];
}

// Social-ad targeting per platform. Meta treats home-repair ads as housing ads in Canada: minimum 25 km radius,
// no postal-code targeting, no location exclusions. Nextdoor targets by neighbourhood.
export const META_MIN_RADIUS_KM = 25;
export function socialTargeting(platform, hood, city) {
  return platform === 'nextdoor'
    ? { short: `${hood} neighbourhood`, label: `Neighbours in ${hood}` }
    : { short: `${META_MIN_RADIUS_KM} km around ${city}`, label: `Across ${city} (${META_MIN_RADIUS_KM} km)` };
}

// Pricing (authoritative copy lives here; the server recomputes on every campaign).
export const PRICING = {
  propertyCents: 250,
  neighbourCents: 135,
  neighbourOptions: [0, 10, 25, 50],
  // Managed social: the contractor's ad spend is billed by Meta/Nextdoor to their own ad account, never by us.
  socialBudgetsCents: [10000, 25000, 50000],
  socialBudgetMinCents: 5000,
  socialBudgetMaxCents: 500000,
  socialDurations: [7, 14, 30],
  socialManagementCents: 9900,
  socialIncludedPerMonth: { pro: 1 }, // campaigns per calendar month with the setup fee waived
  plans: {
    starter: { name: 'Starter Scout', monthlyCents: 14900, annualCents: 149000 }, // annual = 2 months free
    pro: { name: 'Exclusive Neighborhood Pro', monthlyCents: 39900, annualCents: 399000 },
  },
  trialDays: 14,
  impressionsPerDollar: 32,
  hstRate: 0.13,
  includedTrades: { starter: 3 }, // plans not listed here (Pro, or no plan yet) see every trade
  extraTradeCents: 2900,
  includedCities: 3,
  extraCityCents: 4900,
  unlimitedCitiesCents: 19900,
};

// Ontario Consumer Protection Act (O. Reg. 17/05 s. 35.1) bans unsolicited door-to-door selling of furnaces, air
// conditioners, air cleaners/purifiers, water heaters, water treatment devices/filters/softeners and duct cleaning.
// Used by the self-serve door-knock route sheet to warn contractors.
export const DOORKNOCK_BLOCKED_TRADES = ['hvac'];
export const DOORKNOCK_CAUTION_TRADES = { plumbing: 'water heaters or water treatment', solar: 'heat pumps', drywall: 'duct cleaning' };

/** What PermitPulse invoices (mail + social fee, plus HST). Ad spend is reported separately, never invoiced. */
export function priceCampaign({ includeProperty, neighbourHomes, socialEnabled, socialBudgetCents, managementWaived = false }) {
  const pieces = (includeProperty ? 1 : 0) + neighbourHomes;
  const mail = (includeProperty ? PRICING.propertyCents : 0) + neighbourHomes * PRICING.neighbourCents;
  const management = socialEnabled && !managementWaived ? PRICING.socialManagementCents : 0;
  const adSpend = socialEnabled ? socialBudgetCents : 0;
  const subtotal = mail + management;
  const tax = Math.round(subtotal * PRICING.hstRate);
  return {
    pieces, mail, management, adSpend, social: adSpend, subtotal, tax, total: subtotal + tax,
    reach: socialEnabled ? Math.round((socialBudgetCents / 100) * PRICING.impressionsPerDollar) : 0,
  };
}

export const SOCIAL_REQUEST_STATUSES = [
  { key: 'new', label: 'Requested', contractor: 'Social: Requested' },
  { key: 'in_progress', label: 'Setting up', contractor: 'Social: Being set up' },
  { key: 'awaiting_approval', label: 'Awaiting approval', contractor: 'Social: Awaiting your approval' },
  { key: 'live', label: 'Live', contractor: 'Social: Live' },
  { key: 'done', label: 'Finished', contractor: 'Social: Finished' },
  { key: 'cancelled', label: 'Cancelled', contractor: 'Social: Cancelled' },
];
export const SOCIAL_ACCOUNT_STATUSES = [
  { key: 'ready', label: 'My Meta/Nextdoor ad accounts are ready; I will add PermitPulse as a partner' },
  { key: 'needs_help', label: 'I need help setting up my ad accounts' },
  { key: 'unsure', label: 'Not sure' },
];
