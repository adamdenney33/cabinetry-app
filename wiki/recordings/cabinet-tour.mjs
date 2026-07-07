// Ad take: the CABINET chapter in ONE continuous recording.
// v10: the quote AND a cabinet are pre-staged BEFORE the scene-start marker
// (head-trimmed by postprocess), so the published clip OPENS with the My
// Rates editor already on screen and a cabinet already selected — no picking
// steps on camera. Then: rate edits + full rates scroll → Builder sub-tab
// (the transition beat) → spec edits + full editor scroll → Stock editor.

import { bootApp, clickThrough, typeHuman, glideTo, settle } from './_driver.mjs';

const WIDTH_INPUT = '#cb-cab-editor .cb-rc-dims input[title="Width"]';
const HEIGHT_INPUT = '#cb-cab-editor .cb-rc-dims input[title="Height"]';

async function wheel(page, dy, steps = 6) {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, dy / steps);
    await page.waitForTimeout(90);
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ markSceneStart: () => void }} meta
 */
export async function record(page, meta) {
  await bootApp(page, meta);

  // ── SETUP (trimmed off the published clip) ─────────────────────────────
  await clickThrough(page, '.nav-tab[title="Cabinet"]');
  await settle(page, 800);
  await clickThrough(page, '#cab-tab-builder').catch(() => {});
  await settle(page, 500);
  const picker = await page.$('#cb-results .quote-card:visible');
  if (picker) await clickThrough(page, '#cb-results .quote-card');
  await page.waitForSelector('#cb-results .cb-li-row:visible', { timeout: 15_000 });
  await settle(page, 400);
  // pre-select a cabinet so the builder editor is already loaded
  const editorOpen = await page.$(WIDTH_INPUT);
  if (!editorOpen) {
    await clickThrough(page, '#cb-results .cb-li-row .cb-col-name');
    await page.waitForSelector(WIDTH_INPUT);
  }
  await settle(page, 400);
  // open My Rates — the cursor comes to rest ON the tab button
  await clickThrough(page, '#cab-tab-rates');
  await page.waitForSelector('#cb-rates-content .cb-mat-row input[type="number"]');
  await settle(page, 900);

  // ── SCENE START: My Rates open, cabinet selected, cursor on the tab ────
  meta.markSceneStart();
  await settle(page, 900);

  // rate edits
  await typeHuman(page, '#cb-rates-content .cb-mat-row input[type="number"]', '65', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 700);
  await typeHuman(page, '#cb-rates-content .cb-mat-row input[type="number"] >> nth=2', '22', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 700);
  // the full rates editor, scrolled
  await glideTo(page, '#cb-rates-content');
  await wheel(page, 420);
  await settle(page, 900);
  await wheel(page, 480);
  await settle(page, 1100);

  // ── the transition: back to Cabinet Builder (cabinet already open) ─────
  await clickThrough(page, '#cab-tab-builder');
  await page.waitForSelector(WIDTH_INPUT, { timeout: 10_000 });
  await settle(page, 900);

  // spec edits
  await typeHuman(page, WIDTH_INPUT, '800', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 600);
  await typeHuman(page, HEIGHT_INPUT, '750', { clear: true });
  await page.keyboard.press('Tab');
  await settle(page, 700);
  await glideTo(page, '#cb-cab-editor');
  await wheel(page, 380);
  await settle(page, 500);
  await clickThrough(page, `#cb-cab-editor button[onclick="cbStepField('doors',1)"]`);
  await settle(page, 800);
  await wheel(page, 380);
  await settle(page, 500);
  await clickThrough(page, `#cb-cab-editor button[onclick="cbStepField('drawers',1)"]`);
  await settle(page, 800);
  await wheel(page, 550);
  await settle(page, 1400);

  // ── Stock ───────────────────────────────────────────────────────────────
  await clickThrough(page, '.nav-tab[title="Stock"]');
  await page.waitForSelector('.stock-row', { timeout: 10_000 });
  await settle(page, 500);
  await clickThrough(page, '.stock-row:has-text("18mm Birch Plywood")');
  await page.waitForSelector('#stock-qty', { timeout: 5_000 });
  await settle(page, 600);
  await typeHuman(page, '#stock-qty', '15', { clear: true });
  await settle(page, 500);
  await glideTo(page, '#stock-low');
  await settle(page, 1500);
}
