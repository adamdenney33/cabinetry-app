---
title: How to reduce plywood waste with sheet nesting
description: Nesting software turns an hour of sheet layout into seconds and lifts yield from about 65% to 80%. The real numbers, and how grain and kerf affect them.
slug: reduce-plywood-waste-nesting
date: 2026-07-03
author: Adam Denney
tags: cut list, nesting, materials
hero: /brand/screenshots/02-cut-list.png
heroAlt: A cut list in ProCabinet with parts grouped by sheet material
---

You reduce plywood waste by letting an optimiser nest every part onto the sheet before anything is cut, with grain locked on visible parts and the saw kerf allowed for. The yield gain is real money, but the bigger everyday win is time: sheet layouts that took me the best part of an hour happen in seconds.

## How much time does sheet nesting software actually save?

For me, the best part of an hour per job, and the worst hour of the job at that. A hand layout means sitting down with the parts list and working out sheet by sheet what comes out of what, second-guessing the grain parts, and still finding at the saw that the last two parts do not fit where you thought. Then the client swaps two doors for drawers and you do it again.

An optimiser does the same work in seconds, and that changes how you use it. You re-nest after every design change instead of living with a stale layout. You print a sheet-by-sheet diagram and follow it at the saw instead of deciding as you go. And if a CNC is involved, the layout goes straight out as DXF instead of being redrawn in CAM. The deciding-at-the-bench time disappears along with the re-dos.

It finds material too. The first real cut list I fed one, a kitchen my hand layout had cut from 11 sheets, came back at 9. But honestly, the sheets were never why I kept using it; the hour at the bench was. The test I would set any nesting tool is the same either way: not a demo project, a real cut list from a job you have already made, and a watch.

You give it three things: the parts list, your blade kerf, and which parts have grain that must run one way. I have compared seven tools honestly in [best cut list software](/blog/best-cut-list-software/), including the one I built. Mine is ProCabinet, declared interest: the cut list is generated from the same cabinets the customer approved at quote stage, so there is no re-typing, then nested with grain and kerf and exported as standard DXF for Vectric, Fusion 360, AlphaCAM or Cabinet Vision. The optimiser is on the [free plan](/#pricing), $0 forever with no card needed, so finding out costs one recent cut list and a few minutes.

## What does poor plywood yield cost in real money?

Put numbers on it for one kitchen: 32.4 square metres of panel parts, cut from 2440 x 1220 sheets of 2.98 square metres each, at £48 a sheet. Laying out by eye, my careful hand layouts settled around 65% yield. An optimiser gets 80% from the same parts.

| Layout | Yield | Usable area per sheet | Sheets needed | Cost at £48 a sheet |
|---|---|---|---|---|
| By eye at the saw | 65% | 1.94 m² | 17 | £816 |
| Optimised nesting | 80% | 2.38 m² | 14 | £672 |

Three sheets and £144 saved on one job. At 20 kitchens a year that is £2,880, which dwarfs what a small shop would spend on the software doing the nesting. Material is the second biggest number on a quote after labour, so every point of yield goes straight to your margin or your price; how the material line feeds the final quote is covered in [how to price cabinet jobs](/blog/how-to-price-cabinet-jobs/).

## How do grain, kerf, offcuts and batching affect the yield?

Grain and yield pull in opposite directions. Locking grain on doors, drawer fronts and exposed ends costs a little yield, because the optimiser loses the freedom to rotate those parts. Let them rotate anyway and the yield number improves while the job gets worse: a front with grain running sideways is a remake, far dearer than the few per cent of sheet the lock cost you. Hidden parts, backs, shelves and plinths can rotate freely, and that freedom is where the optimiser claws yield back.

Kerf is simpler: the blade eats material on every cut. A 3mm blade across ten rips has turned 30mm of board into dust, and a layout that ignores it comes up short on the last part of every row. Set the true kerf once, including the scoring blade if your saw has one, and stop thinking about it.

Offcuts are the yield you already paid for. The tell is the offcut rack: if it fills faster than it empties, you are buying more board than the parts need. My rule was nothing under 300 x 300mm unless it was solid timber, everything labelled with material and thickness, and the rack cleared honestly every few months. The step most shops skip is writing offcuts down; an offcut you cannot remember owning is one you will buy again. I keep mine in ProCabinet's stock tab, covered on the [features page](/#features); stock items are unlimited even on the free plan, so the rack and the records can actually match.

Batching is the cheapest yield gain left once nesting is in place. The waste on any single job concentrates in its last sheet or two, the ones carrying a handful of parts and a lot of air. Nest two jobs in the same 18mm board together and those half-empty sheets merge; when I had a kitchen and a wardrobe job in the workshop at once, cutting them as one nest would regularly save a sheet or two. Two rules keep it from going wrong: label every part with its job as it comes off the saw, and only batch jobs that are both definitely happening, deposits paid, or the postponed one's parts will stand about the workshop collecting edge damage.

## Common questions

### How long does it take to nest a cut list with software?

Seconds, once the parts list exists. The honest comparison is against the hour or so a careful hand layout takes, plus every re-do when the job changes, which is where the real time goes. If the cut list lives in the same tool as the quote, there is nothing to re-type either, so the layout is ready the moment the design settles.

### What is a good yield for cabinet sheet goods?

On mixed jobs with grain locked on the visible parts, 75 to 85% is realistic with an optimiser, and I treat 80% as a good day. Be suspicious of headline numbers above 90%. They usually come from big batches of identical parts, or from letting every part rotate, which no kitchen with visible grain will forgive.

### Does nesting help if I cut on a table saw rather than a CNC?

Yes, arguably more, because a printed layout replaces the deciding-as-you-go at the bench entirely. You follow the drawing instead of committing to guesses. Any optimiser worth using prints a sheet-by-sheet diagram, and rip-first layouts suit a table saw or panel saw fine. The DXF side only matters once a CNC enters the picture.

### Should I include waste when quoting material?

Yes, and the clean way is to quote whole sheets, never the theoretical parts area. If the nest says 14 sheets, the customer's price carries 14 sheets, and the markup on top covers handling and the odd surprise. Quoting 13.6 sheets' worth of board is a quiet discount nobody asked you for.
