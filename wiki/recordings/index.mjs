// Registry of wiki clip drive scripts: slug → record(page, meta).
// Slugs MUST match wiki/guides.mjs (the pages that embed these clips).
// Record one guide: npm run wiki:record -- create-and-send-a-quote

import * as setUpYourRates from './set-up-your-rates.mjs';
import * as buildAndPriceACabinet from './build-and-price-a-cabinet.mjs';
import * as createAndSendAQuote from './create-and-send-a-quote.mjs';
import * as convertAQuoteToAnOrder from './convert-a-quote-to-an-order.mjs';
import * as optimisedCutList from './optimised-cut-list.mjs';
import * as stockAndMaterials from './stock-and-materials.mjs';
import * as scheduleYourWorkshop from './schedule-your-workshop.mjs';
import * as manageClients from './manage-clients.mjs';
import * as dashboardOverview from './dashboard-overview.mjs';
import * as orderAutoSchedule from './order-auto-schedule.mjs'; // ad-only clip (not a wiki guide)
import * as liveLinkTour from './live-link-tour.mjs'; // ad-only clip
import * as schedulePriority from './schedule-priority.mjs'; // ad-only clip

// Registry order = full-batch RECORDING order: read-only tours first, flows
// that write rows last, so early clips show the pristine seed (no stray
// QUO-01xx numbers from a clip recorded moments before).
/** @type {Record<string, { record: (page: import('@playwright/test').Page, meta: { markSceneStart: () => void }) => Promise<void> }>} */
export const REGISTRY = {
  'dashboard-overview': dashboardOverview,
  'manage-clients': manageClients,
  'schedule-your-workshop': scheduleYourWorkshop,
  'stock-and-materials': stockAndMaterials,
  'optimised-cut-list': optimisedCutList,
  'set-up-your-rates': setUpYourRates,
  'build-and-price-a-cabinet': buildAndPriceACabinet,
  'create-and-send-a-quote': createAndSendAQuote,
  'convert-a-quote-to-an-order': convertAQuoteToAnOrder,
  'order-auto-schedule': orderAutoSchedule,
  'live-link-tour': liveLinkTour,
  'schedule-priority': schedulePriority,
};
