---
title: How to reduce plywood waste with sheet nesting
description: Real numbers on plywood waste: what a hand layout costs against optimised nesting, and how grain direction and kerf settings protect the yield.
slug: reduce-plywood-waste-nesting
date: 2026-07-03
author: Adam Denney
tags: cut list, nesting, materials
---

You reduce plywood waste by nesting every part onto the sheet with an optimiser before anything is cut, locking grain direction on visible parts and allowing for the saw kerf. Moving from a hand layout at around 65% yield to an optimised 80% saves about 3 sheets on a typical kitchen, roughly £144 of material.

## How much sheet material does a hand layout waste?

More than it feels like at the bench. Laying out by eye, you cut the big rectangles first because those are the parts you are worried about, and the small parts get squeezed into whatever is left. On a simple batch of identical carcasses a careful sawyer does fine. On a real kitchen, with 60-odd parts in a dozen sizes, two materials and grain to respect, my hand layouts settled somewhere around 65% yield, and I was being careful. The other 35% was the offcut pile and the dust bag.

The tell is the offcut rack. If it fills faster than it empties, you are buying more board than the parts need.

## What does poor plywood yield cost in real money?

Put numbers on it for one kitchen. Say the panel parts come to 32.4 square metres and you cut from 2440 x 1220 sheets, which are 2.98 square metres each, at £48 a sheet.

| Layout | Yield | Usable area per sheet | Sheets needed | Cost at £48 a sheet |
|---|---|---|---|---|
| By eye at the saw | 65% | 1.94 m² | 17 | £816 |
| Optimised nesting | 80% | 2.38 m² | 14 | £672 |

Three sheets and £144 saved on one job. At 20 kitchens a year that is £2,880, which dwarfs what a small shop would spend on the software doing the nesting. Run the same sum with your own parts area and sheet price; the shape of it holds.

Material is the second biggest number on a quote after labour, so every point of yield goes straight to your margin or your price. How that material line feeds the final quote is covered in [how to price cabinet jobs](/blog/how-to-price-cabinet-jobs/).

## How does nesting software get a better yield than I can?

Not by being cleverer about any one sheet, but by trying arrangements you never would. An optimiser tests thousands of layouts in seconds, pairs long rips so they share a cut, tucks drawer bottoms into the fall-off from a run of gables, and holds a part back for a later sheet when that works out better across the whole job. A person at a saw does none of that, because a person has to commit to the first cut.

The before and after is easy to test, because you can run it on a job you have already built. The first time I did this, I fed an optimiser the cut list from a kitchen my hand layout had taken 11 sheets to cut. Its answer was 9 sheets, same parts, same grain rules, with room to spare on the ninth. Two sheets I had already paid for and turned into offcuts. That is the test I would set any nesting tool: not a demo project, a real cut list from a job you have actually made.

You give it three things: the parts list, your blade kerf, and which parts have grain that must run one way. Which tool to give them to is a longer conversation, and I have compared seven of them honestly in [best cut list software](/blog/best-cut-list-software/), including the one I built.

Mine is ProCabinet, declared interest. The cut list is generated from the same cabinets the customer approved at quote stage, nested onto sheets with grain direction and kerf allowance, and the layout exports as standard DXF that opens in Vectric, Fusion 360, AlphaCAM or Cabinet Vision. The optimiser is included on the [free plan](/#pricing), which is $0 forever with no card needed, so testing it against your current layouts costs nothing but an hour with a recent cut list.

## Why do grain direction and kerf settings matter for waste?

They pull in opposite directions, which is exactly why both need setting rather than guessing.

Locking grain on doors, drawer fronts and exposed ends costs a little yield, because the optimiser loses the freedom to rotate those parts. Let them rotate anyway and the yield number improves while the job gets worse: a front with grain running sideways is a remake, and a remake is a whole new part plus edging and finishing time, far dearer than the few per cent of sheet the lock cost you. Hidden parts, backs, shelves and plinths can usually rotate freely, and that freedom is where the optimiser claws yield back.

Kerf is simpler: the blade eats material on every cut. A 3mm blade across ten rips has turned 30mm of board into dust, and a layout that ignores it comes up short on the last part of every row. Set the true kerf once, including the scoring blade if your saw has one, and stop thinking about it.

## What should you do with offcuts?

Keep the ones you would genuinely reach for and bin the rest. My rule was nothing under 300 x 300mm unless it was solid timber, everything labelled with material and thickness on a strip of masking tape, and the rack cleared honestly every few months.

The step most shops skip is writing offcuts down. An offcut you cannot remember owning is one you will buy again, and a rack nobody trusts just gets ignored while a fresh sheet is opened. I keep mine in the stock tab in ProCabinet, one of the eight tabs listed on the [features page](/#features), and stock items are unlimited even on the free plan, so the rack and the records can actually match. A recorded offcut can go back into the next job's cut list with a clear conscience, and a part cut from one is the cheapest sheet material there is. It is already paid for.

## Does batching jobs onto shared sheets save material?

Yes, when the jobs share a material and thickness, and it is the cheapest yield gain left once nesting is already in place. The waste on any single job concentrates in its last sheet or two, the ones carrying a handful of parts and a lot of air. Nest two jobs in the same 18mm board together and those half-empty sheets merge, because the second job's small parts fill the first job's fall-off. When I had a kitchen and a utility room, or a kitchen and a wardrobe job, in the workshop at the same time and in the same board, cutting them as one nest would regularly save a sheet or two over cutting them separately.

Two rules keep it from going wrong. Label every part with its job as it comes off the saw, because a mixed stack of near-identical gables will absorb an afternoon of sorting if you let it. And only batch jobs that are both definitely happening, deposits paid, because if one is postponed after the sheets are cut, its parts stand about the workshop collecting edge damage while they wait.

Shared sheets also raise a small pricing question, and whole-sheet quoting answers it: each job is quoted its own whole sheets, and the batching saving stays with the shop, a reward for scheduling well rather than a discount anyone was owed.

## Common questions

### What is a good yield for cabinet sheet goods?

On mixed jobs with grain locked on the visible parts, 75 to 85% is realistic with an optimiser, and I treat 80% as a good day. Be suspicious of headline numbers above 90%. They usually come from big batches of identical parts, or from letting every part rotate, which no kitchen with visible grain will forgive.

### Does nesting help if I cut on a table saw rather than a CNC?

Yes, arguably more, because a printed layout replaces the deciding-as-you-go at the bench entirely. You follow the drawing instead of committing to guesses. Any optimiser worth using prints a sheet-by-sheet diagram, and rip-first layouts suit a table saw or panel saw fine. The DXF side only matters once a CNC enters the picture.

### Should I include waste when quoting material?

Yes, and the clean way is to quote whole sheets, never the theoretical parts area. If the nest says 14 sheets, the customer's price carries 14 sheets, and the markup on top covers handling and the odd surprise. Quoting 13.6 sheets' worth of board is a quiet discount nobody asked you for.

### Does grain matching cost extra material?

Yes, and it is usually worth paying. Locking grain on doors, fronts and exposed ends takes rotation freedom away from the optimiser, and on my jobs that cost a few per cent of yield, call it half a sheet to a sheet on a full kitchen. Sequence-matched fronts, where the figure flows across a run of doors, cost more again, because those parts must also sit together on the sheet in order. Treat it as a visible upgrade and price it into the job, rather than absorbing it and wondering where the sheet went.

### Is nesting software worth it for a one-man shop?

Mine was a one-man shop, so I will answer from there: yes, if sheet goods go through it most weeks. The worked table above is the whole argument, £144 saved on a single kitchen, and the nesting in ProCabinet sits on the free plan, so the cost of finding out is an hour with an old cut list. If you build mostly in solid timber, or open a couple of sheets a month, the saving shrinks toward nothing and the money is better spent on blades.
