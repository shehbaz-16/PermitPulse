// Fixture datasets for the Markham adapters.
// IMPORTANT: these are FICTIONAL demo records. Street names are real Markham streets, but street numbers,
// permit numbers, values and dates are invented. Dates are expressed as "days ago" and re-based on every
// sync so the demo feed always looks fresh. No owner names or contact details are ever included.

const R = (o) => o;

export const SEED_PERMITS = [
  R({ id: '26-114892', code: 'PE', type: 'Pool Enclosure', category: 'Pool / Deck', status: 'Under Review', filed: 2, issued: null,
      num: '178', street: 'Main St Unionville', hood: 'Unionville', value: 96000,
      scope: 'New in-ground swimming pool & required safety enclosure' }),
  R({ id: '26-114731', code: 'AL', type: 'Alteration / Addition', category: 'Residential Renovation', status: 'Under Review', filed: 3, issued: null,
      num: '54', street: 'Rouge Bank Dr', hood: 'Cornell', value: 215000,
      scope: 'Two-storey rear addition and basement walkout' }),
  R({ id: '26-114655', code: 'RP', type: 'Replacement / Infill Dwelling', category: 'Residential Renovation', status: 'Under Review', filed: 5, issued: null,
      num: '31', street: 'Carlton Rd', hood: 'Unionville', value: 1450000,
      scope: 'New custom infill detached dwelling' }),
  R({ id: '26-114610', code: 'PP', type: 'Plumbing', category: 'Plumbing / Drainage', status: 'Issued', filed: 1, issued: 0,
      num: '212', street: 'Bur Oak Ave', hood: 'Markham Village', value: 14500,
      scope: 'Sanitary backwater valve and weeping tile replacement' }),
  R({ id: '26-114588', code: 'AL', type: 'Alteration / Basement Suite', category: 'Secondary Suite / Basement', status: 'Under Review', filed: 4, issued: null,
      num: '96', street: '16th Ave', hood: 'Berczy Village', value: 78000,
      scope: 'Legal second-unit basement suite with separate side entrance' }),
  R({ id: '26-114540', code: 'HP', type: 'Housing Permit', category: 'New Home', status: 'Issued', filed: 12, issued: 2,
      num: '18', street: 'Angus Glen Blvd', hood: 'Angus Glen', value: 920000,
      scope: 'New two-storey detached dwelling with attached double garage' }),
  R({ id: '26-114502', code: 'PE', type: 'Pool Enclosure', category: 'Pool / Deck', status: 'Under Review', filed: 6, issued: null,
      num: '77', street: '14th Ave', hood: 'Box Grove', value: 118000,
      scope: 'New in-ground pool with glass-panel enclosure and equipment pad' }),
  R({ id: '26-114477', code: 'AL', type: 'Alteration / Interior', category: 'Residential Renovation', status: 'Issued', filed: 9, issued: 1,
      num: '45', street: 'John St', hood: 'Thornhill', value: 68000,
      scope: 'Interior alterations: kitchen reconfiguration and load-bearing wall removal' }),
  R({ id: '26-114421', code: 'AL', type: 'Alteration / Windows', category: 'Residential Renovation', status: 'Issued', filed: 8, issued: 3,
      num: '63', street: 'Steeles Ave E', hood: 'Milliken', value: 34000,
      scope: 'Replace all windows and exterior doors; enlarge two structural openings' }),
  R({ id: '26-114390', code: 'HV', type: 'HVAC / Mechanical', category: 'HVAC / Mechanical', status: 'Issued', filed: 7, issued: 4,
      num: '129', street: 'Copper Creek Dr', hood: 'Wismer', value: 18000,
      scope: 'Replace furnace and air conditioner; new ductwork for basement finishing' }),
  R({ id: '26-114362', code: 'AL', type: 'Alteration / Deck', category: 'Pool / Deck', status: 'Under Review', filed: 10, issued: null,
      num: '240', street: 'Bur Oak Ave', hood: 'Markham Village', value: 42000,
      scope: 'Covered rear porch and 14 x 20 ft raised deck with stairs' }),
  R({ id: '26-114330', code: 'HP', type: 'Housing Permit', category: 'New Home', status: 'Application Received', filed: 0, issued: null,
      num: '9', street: 'Major Mackenzie Dr E', hood: 'Cornell', value: 1180000,
      scope: 'New semi-detached dwelling pair with rear lane garages' }),
];

export const EPLAN_PERMITS = [
  R({ id: '26-114803', code: 'PE', type: 'Pool Enclosure', category: 'Pool / Deck', status: 'Application Received', filed: 1, issued: null,
      num: '58', street: '16th Ave', hood: 'Berczy Village', value: 87000,
      scope: 'New in-ground swimming pool with enclosure and rear patio' }),
  R({ id: '26-114781', code: 'AL', type: 'Alteration / Addition', category: 'Residential Renovation', status: 'Under Review', filed: 2, issued: null,
      num: '204', street: 'Main St Unionville', hood: 'Unionville', value: 310000,
      scope: 'Heritage-district rear addition and new detached garage' }),
  R({ id: '26-114760', code: 'PP', type: 'Plumbing', category: 'Plumbing / Drainage', status: 'Issued', filed: 4, issued: 1,
      num: '88', street: 'Steeles Ave E', hood: 'Milliken', value: 9800,
      scope: 'Replace water service line and upgrade interior plumbing' }),
  R({ id: '26-114745', code: 'AL', type: 'Alteration / Basement', category: 'Secondary Suite / Basement', status: 'Under Review', filed: 3, issued: null,
      num: '33', street: 'Angus Glen Blvd', hood: 'Angus Glen', value: 64000,
      scope: 'Finished basement with bathroom, wet bar and egress windows' }),
  R({ id: '26-114702', code: 'RP', type: 'Replacement / Infill Dwelling', category: 'Residential Renovation', status: 'Under Review', filed: 11, issued: null,
      num: '17', street: 'Bayview Ave', hood: 'Thornhill', value: 1850000,
      scope: 'Demolition and new infill detached dwelling with walkout basement' }),
];

// Shape mirrors what a Markham Open Data tree-permit / development-application FeatureServer is expected to return,
// after the adapter has normalised it. Tree permits are protected-tree (20 cm DBH+) removals under By-law 2023-164.
export const ARCGIS_RECORDS = [
  R({ id: 'TP-26-0312', code: 'TP', type: 'Tree Permit', category: 'Tree Removal', status: 'Under Review', filed: 2, issued: null,
      num: '121', street: 'Church St', hood: 'Markham Village', value: null,
      scope: 'Removal of one (1) 62 cm silver maple; replacement planting required' }),
  R({ id: 'TP-26-0309', code: 'TP', type: 'Tree Permit', category: 'Tree Removal', status: 'Issued', filed: 6, issued: 1,
      num: '27', street: 'Rouge Bank Dr', hood: 'Cornell', value: null,
      scope: 'Removal of two (2) emerald-ash-borer-infested ash trees with replanting plan' }),
  R({ id: 'DA-26-0044', code: 'DA', type: 'Site Plan Application', category: 'Commercial / Development Application', status: 'Under Review', filed: 13, issued: null,
      num: '4750', street: 'Highway 7 E', hood: 'Milliken', value: 6200000,
      scope: 'Site plan application: two-storey mixed-use building with ground-floor retail' }),
];

export const MUNICIPALITIES = [
  { slug: 'markham', name: 'Markham', status: 'active', order: 0,
    license: 'City of Markham Open Data Licence v1.0',
    attribution: 'Contains information licensed under the City of Markham Open Data Licence v1.0. Where live building-permit data is shown it is supplied via BuildData (builddata.ca) from City of Markham public records. PermitPulse Ontario is an independent service and is not endorsed by, or affiliated with, the City of Markham.' },
  { slug: 'toronto', name: 'Toronto', status: 'active', order: 1,
    license: 'Open Government Licence – Toronto',
    attribution: 'Contains information licensed under the Open Government Licence – Toronto, supplied via BuildData (builddata.ca). PermitPulse Ontario is an independent service and is not endorsed by, or affiliated with, the City of Toronto.' },
  { slug: 'vaughan', name: 'Vaughan', status: 'active', order: 2,
    license: 'City of Vaughan open data',
    attribution: 'Contains City of Vaughan open data, supplied via BuildData (builddata.ca). PermitPulse Ontario is an independent service and is not endorsed by, or affiliated with, the City of Vaughan.' },
  // Covered by BuildData but not part of the 3 included cities: unlocked as a paid city add-on.
  { slug: 'mississauga', name: 'Mississauga', status: 'coming_soon', addon: true, order: 3 },
  { slug: 'brampton', name: 'Brampton', status: 'coming_soon', addon: true, order: 4 },
  { slug: 'oakville', name: 'Oakville', status: 'coming_soon', addon: true, order: 5 },
  { slug: 'hamilton', name: 'Hamilton', status: 'coming_soon', addon: true, order: 6 },
  { slug: 'barrie', name: 'Barrie', status: 'coming_soon', addon: true, order: 7 },
  // No data source yet: waitlist only.
  { slug: 'richmond-hill', name: 'Richmond Hill', status: 'coming_soon', order: 8 },
  { slug: 'whitchurch-stouffville', name: 'Stouffville', status: 'coming_soon', order: 9 },
  { slug: 'aurora', name: 'Aurora', status: 'coming_soon', order: 10 },
];
export const ADDON_CITY_SLUGS = new Set(MUNICIPALITIES.filter((m) => m.addon).map((m) => m.slug));

export const MARKHAM_NEIGHBOURHOODS = [
  { name: 'Unionville', adjacent: ['Berczy Village'] },
  { name: 'Markham Village', adjacent: ['Wismer'] },
  { name: 'Cornell', adjacent: ['Box Grove'] },
  { name: 'Wismer', adjacent: ['Markham Village'] },
  { name: 'Box Grove', adjacent: ['Cornell'] },
  { name: 'Berczy Village', adjacent: ['Unionville'] },
  { name: 'Angus Glen', adjacent: ['Berczy Village'] },
  { name: 'Thornhill', adjacent: ['Milliken'] },
  { name: 'Milliken', adjacent: ['Thornhill'] },
];
