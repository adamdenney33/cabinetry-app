// @ts-nocheck
// ProCabinet — npm-package bridge module
//
// Loaded as <script type="module"> BEFORE the classic <script> tags in
// index.html. Imports Supabase + jsPDF from npm and re-exports them onto
// `window` under the same names the CDN scripts used to provide. This lets
// the rest of the codebase (db.js, ui.js, app.js, migrate.js) stay as
// classic globals-only scripts unchanged.
//
// This bridge is the ONLY module-syntax file in the codebase right now.
// Phase C of the modernization plan converts everything else.

import { createClient } from '@supabase/supabase-js';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

window.supabase = { createClient };
window.jspdf = { jsPDF };
