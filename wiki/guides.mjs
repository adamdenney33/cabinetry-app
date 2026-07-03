// ProCabinet — public wiki guide content (procabinet.app/wiki).
// Consumed at build time by scripts/build-wiki.mjs (imported from
// vite.config.mjs, so this file is typechecked with the config). Copy is
// seeded from the onboarding walkthrough (src/walkthrough.js _wtSteps) and
// expanded per task. Step bodies are trusted HTML fragments — author-only
// content, never user input.
//
// Clip URLs/posters live in wiki/clips.json (written by
// scripts/publish-wiki-clips.mjs); a guide with no manifest entry renders
// without a video block, so pages can ship before clips are recorded.
//
// The slug → app-tab mapping is duplicated in src/help.js
// (_WIKI_GUIDE_BY_TAB) — help.js is a classic script and cannot import this
// module. Keep both sides in sync when adding or renaming a guide.

/**
 * @typedef {Object} WikiStep
 * @property {string} heading  Short imperative step title
 * @property {string} body     HTML fragment (author content)
 */

/**
 * @typedef {Object} WikiGuide
 * @property {string} slug            URL path segment: /wiki/<slug>
 * @property {string} title           Page H1 + <title> prefix
 * @property {string} metaDescription <=155 chars, unique per page
 * @property {string} intro           1–2 sentence lede (HTML fragment)
 * @property {WikiStep[]} steps       Numbered how-to steps
 * @property {string[]} related       Slugs of 2–3 cross-linked guides
 * @property {string} appSection      switchSection() name of the app tab
 * @property {string} icon            /brand/icons/individual/<icon>.svg
 * @property {string} screenshot      /brand/screenshots/<screenshot> — card
 *                                    thumb + og:image fallback until the
 *                                    guide's clip (and poster) is published
 */

/** @type {WikiGuide[]} */
export const GUIDES = [
  {
    slug: 'set-up-your-rates',
    title: 'Set Up Your Rates',
    metaDescription:
      'Set your hourly labour rate, material markup, edge-banding cost and contingency once — every cabinet in ProCabinet prices itself from these.',
    intro:
      'Rates are the engine of every price in ProCabinet. Set them once and every cabinet, quote and order calculates itself — no spreadsheet formulas to maintain.',
    steps: [
      {
        heading: 'Open My Rates',
        body: 'Go to the <strong>Cabinet</strong> tab and switch the sidebar to the <strong>My Rates</strong> sub-tab.',
      },
      {
        heading: 'Set your labour rate',
        body: 'Enter your <strong>hourly workshop rate</strong>. Labour pricing scales with cabinet size, so a tall pantry costs more shop time than a small wall unit — automatically.',
      },
      {
        heading: 'Set your material markup',
        body: 'The percentage added on top of raw material cost. This is where your margin on boards, edging and hardware lives.',
      },
      {
        heading: 'Add edge banding and contingency',
        body: 'Set your <strong>edge-banding cost per metre</strong> and a <strong>contingency percentage</strong> to cushion the surprises every job has.',
      },
      {
        heading: 'Watch every price update',
        body: 'Change a rate and every cabinet re-prices from it instantly — in the builder, in quotes, everywhere. One place to keep your numbers honest.',
      },
    ],
    related: ['build-and-price-a-cabinet', 'create-and-send-a-quote'],
    appSection: 'cabinet',
    icon: 'cabinet',
    screenshot: '03c-cabinet-rates.png',
  },
  {
    slug: 'build-and-price-a-cabinet',
    title: 'Build & Price a Cabinet',
    metaDescription:
      'Spec a cabinet — carcass size, doors, drawers, shelves and hardware — and watch material, labour, markup and tax price live as you design.',
    intro:
      'The Cabinet Builder prices as you design. Set the spec on the left and the cost breakdown updates live — material, labour, markup and tax, line by line.',
    steps: [
      {
        heading: 'Open the Cabinet tab',
        body: 'Pick the quote you are pricing and its cabinets load in the main pane, <strong>priced live</strong>.',
      },
      {
        heading: 'Open or add a cabinet',
        body: 'Click any cabinet card to load it into the builder, or add a new one to the quote.',
      },
      {
        heading: 'Set the full spec',
        body: 'Carcass size, <strong>doors, drawers, shelves and hardware</strong> — every field feeds the price. Labour scales with size, so each cabinet is costed accurately.',
      },
      {
        heading: 'Read the live breakdown',
        body: 'The cost card shows material, labour, markup and tax as you type. No “price it later” pile.',
      },
      {
        heading: 'Save it to your library',
        body: 'Save standard cabinets to your library and drop them into future quotes in one click.',
      },
    ],
    related: ['set-up-your-rates', 'create-and-send-a-quote', 'optimised-cut-list'],
    appSection: 'cabinet',
    icon: 'cabinet',
    screenshot: '03d-cabinet-editor.png',
  },
  {
    slug: 'create-and-send-a-quote',
    title: 'Create & Send a Quote',
    metaDescription:
      'Build a customer quote in minutes: add cabinets, labour and materials, get live totals, then export a PDF or send a live link they can accept online.',
    intro:
      'A quote in ProCabinet is built from real cabinet prices, not guesses. Add your lines, check the totals, and send it as a PDF or a live link the customer opens in their browser.',
    steps: [
      {
        heading: 'Open the Quotes tab',
        body: 'Your quote pipeline lives here — drafts, sent and accepted, one card per job.',
      },
      {
        heading: 'Pick the client',
        body: 'Start typing in the client box and pick from the matches — or hit <strong>+</strong> to add a new client without leaving the page.',
      },
      {
        heading: 'Start the quote and name the job',
        body: 'Click <strong>+ Add Quote</strong> and give the job a name the customer will recognise.',
      },
      {
        heading: 'Add your line items',
        body: 'Cabinets from the builder, labour, materials or custom lines. Quantities and prices are editable per line.',
      },
      {
        heading: 'Check the totals',
        body: 'Subtotal, tax and the grand total calculate live as lines change — <strong>what you see is what the customer gets</strong>.',
      },
      {
        heading: 'Send it',
        body: 'Export a print-ready <strong>PDF</strong>, or send a <strong>live link</strong> — the customer views the quote in their browser and can accept and pay a deposit online.',
      },
    ],
    related: ['build-and-price-a-cabinet', 'convert-a-quote-to-an-order', 'manage-clients'],
    appSection: 'quote',
    icon: 'quotes',
    screenshot: '06b-quote-editor.png',
  },
  {
    slug: 'convert-a-quote-to-an-order',
    title: 'Convert a Quote to an Order',
    metaDescription:
      'Turn an accepted quote into a production order in one click — lines carry over, the job lands on your schedule, and invoicing is ready when you are.',
    intro:
      'When the customer says yes, the quote becomes an order in one click. Everything carries over — lines, prices, client — and the job drops onto your production schedule.',
    steps: [
      {
        heading: 'Open the accepted quote',
        body: 'In the <strong>Quotes</strong> tab, open the quote the customer accepted — from the live link or in person.',
      },
      {
        heading: 'Convert it to an order',
        body: 'One click and the quote becomes an order with every line intact. The original quote stays on record.',
      },
      {
        heading: 'Track it through production',
        body: 'Orders carry a status through your pipeline in the <strong>Orders</strong> tab, so you always know what stage each job is at.',
      },
      {
        heading: 'It lands on the schedule',
        body: 'The order takes its place on the Gantt calendar automatically, in priority order.',
      },
      {
        heading: 'Invoice it',
        body: 'Connected to QuickBooks or Xero? Push the order across as a draft invoice when the job ships.',
      },
    ],
    related: ['create-and-send-a-quote', 'schedule-your-workshop', 'dashboard-overview'],
    appSection: 'orders',
    icon: 'orders',
    screenshot: '05-orders.png',
  },
  {
    slug: 'optimised-cut-list',
    title: 'Generate an Optimised Cut List',
    metaDescription:
      'Add your sheets and pieces, hit Optimise, and ProCabinet nests everything for minimum waste — ready to print or export as PDF or DXF.',
    intro:
      'The cut list optimiser nests your pieces onto sheets for minimum waste. Feed it the parts, hit Optimise, and take the layout straight to the saw.',
    steps: [
      {
        heading: 'Open the Cut List tab',
        body: 'Your cut lists live in a library — one per job, or standalone lists for shop work.',
      },
      {
        heading: 'Add sheets and pieces',
        body: 'Set the sheet sizes you buy and list the pieces to cut — or pull them straight from a quote’s cabinets.',
      },
      {
        heading: 'Hit Optimise',
        body: 'ProCabinet nests everything across your sheets for <strong>minimum waste</strong>, kerf accounted for.',
      },
      {
        heading: 'Read the layout',
        body: 'Each sheet shows its pieces laid out to scale, with offcuts visible at a glance.',
      },
      {
        heading: 'Print or export',
        body: 'Print the layout for the bench, or export as <strong>PDF or DXF</strong> for the saw.',
      },
    ],
    related: ['build-and-price-a-cabinet', 'stock-and-materials'],
    appSection: 'cutlist',
    icon: 'cut-list',
    screenshot: '02b-cut-layout.png',
  },
  {
    slug: 'stock-and-materials',
    title: 'Track Stock & Materials',
    metaDescription:
      'Keep one materials library — sheets, edge banding, hardware — with the prices that feed your cabinet costs and low-stock warnings on the dashboard.',
    intro:
      'Stock is your materials library: the sheets, edging and hardware you actually buy, at the prices you actually pay. Cabinet costing pulls from here, so prices stay real.',
    steps: [
      {
        heading: 'Open the Stock tab',
        body: 'Everything you keep in the workshop, one card per material.',
      },
      {
        heading: 'Add your materials',
        body: 'Sheets, edge banding, hardware and finishes — search the box to check first, or hit <strong>+</strong> to add a new material with all its details.',
      },
      {
        heading: 'Set real prices',
        body: 'The price you pay per sheet or per unit is the price your cabinets are costed from. Update it when your supplier does.',
      },
      {
        heading: 'Track quantities',
        body: 'Keep quantities current and <strong>low-stock warnings</strong> surface on your dashboard before a job stalls.',
      },
    ],
    related: ['optimised-cut-list', 'build-and-price-a-cabinet', 'dashboard-overview'],
    appSection: 'stock',
    icon: 'stock',
    screenshot: '04-stock.png',
  },
  {
    slug: 'schedule-your-workshop',
    title: 'Schedule Jobs on the Gantt Calendar',
    metaDescription:
      'Orders land on the calendar automatically, in priority order — the scheduler avoids weekends and respects your daily workshop capacity.',
    intro:
      'The schedule plans itself. Orders land on the Gantt calendar automatically, in priority order — each coloured bar spans its production days.',
    steps: [
      {
        heading: 'Open the Schedule tab',
        body: 'The Gantt calendar shows every active order as a bar across its production days.',
      },
      {
        heading: 'Orders arrive on their own',
        body: 'Convert a quote to an order and it takes its place on the calendar automatically — no manual planning step.',
      },
      {
        heading: 'Capacity does the maths',
        body: 'The scheduler <strong>avoids weekends and respects your daily capacity</strong>, so the plan reflects what the workshop can actually do.',
      },
      {
        heading: 'Reprioritise when things change',
        body: 'Move a job up the priority order and the calendar reflows around it — delivery dates update themselves.',
      },
    ],
    related: ['convert-a-quote-to-an-order', 'dashboard-overview'],
    appSection: 'schedule',
    icon: 'schedule',
    screenshot: '08-schedule.png',
  },
  {
    slug: 'manage-clients',
    title: 'Manage Clients',
    metaDescription:
      'Keep every client’s details, quotes, orders and messages in one place — and add new clients from anywhere in the app without breaking flow.',
    intro:
      'Clients in ProCabinet are more than a contact list — every quote, order and message for a customer hangs off their record.',
    steps: [
      {
        heading: 'Open the Clients tab',
        body: 'One card per client, with their details and job history.',
      },
      {
        heading: 'Add a client',
        body: 'Add name, contact details and address in one popup. You can also add clients on the fly from the quote editor’s <strong>+</strong> button.',
      },
      {
        heading: 'See their whole history',
        body: 'Open a client to see every quote and order you have done for them — handy when they call about “the same again”.',
      },
      {
        heading: 'Messages land here too',
        body: 'When a customer messages you from their live quote link, the conversation shows up in the app against their record.',
      },
    ],
    related: ['create-and-send-a-quote', 'dashboard-overview'],
    appSection: 'clients',
    icon: 'clients',
    screenshot: '07-clients.png',
  },
  {
    slug: 'dashboard-overview',
    title: 'Dashboard Overview',
    metaDescription:
      'Active orders with due-date alerts, recent quotes, low-stock warnings and this week’s schedule — the full picture without opening a single tab.',
    intro:
      'The dashboard is the full picture without opening a single tab: what is due, what is waiting on a customer, and what the workshop is doing this week.',
    steps: [
      {
        heading: 'Open the Dashboard',
        body: 'It is the first tab — and the first thing you see when you open the app.',
      },
      {
        heading: 'Check active orders',
        body: 'Every order in production, with <strong>due-date alerts</strong> when a deadline is getting close.',
      },
      {
        heading: 'Watch the quote pipeline',
        body: 'Your most recent quotes and their status — see what is waiting on a customer reply.',
      },
      {
        heading: 'Catch low stock early',
        body: '<strong>Low-stock warnings</strong> show up here before they stall a job on the bench.',
      },
      {
        heading: 'Scan the week',
        body: 'This week’s schedule at the bottom — what starts, what ships, what needs eyes.',
      },
    ],
    related: ['schedule-your-workshop', 'stock-and-materials', 'create-and-send-a-quote'],
    appSection: 'dashboard',
    icon: 'dashboard',
    screenshot: '01-dashboard.png',
  },
];
