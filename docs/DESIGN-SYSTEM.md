# Photo Shoot design system

The design system governs every page: homepage, discovery, profiles, the matching wizard, dashboards and the project workspace. Tokens live in `src/index.css`. Components come from shadcn/ui and are adapted to the brand in the same file.

## How the system was set up

1. **UI UX Pro Max** generated a design recommendation for the product (`design-system/photo-shoot/MASTER.md`, produced by `scripts/uiux_search.py`, which runs the skill's `search.py` under `python -I`).
2. The recommendation was reviewed against the brief. Its pattern, UX and checklist guidance were adopted. Its colour palette was **not** adopted, because the brief fixes the palette.
3. The palette, typography and components were then implemented as tokens and shadcn/ui variants.

### Adopted from UI UX Pro Max

- **Pattern: scroll-triggered storytelling.** The homepage camera sequence follows it. Under reduced motion the story stays fully readable as a static layout, with no pinning and no scroll-jacking.
- **Typography guidance.** One heavy display face for headlines with a neutral body face. Headlines use Archivo at weight 800 to 900 with tight tracking. Body copy uses Inter.
- **UX checklist.** Visible focus rings on every control, `cursor: pointer` on clickable elements, 150 to 300 ms hover transitions, reduced-motion support, and checks at 375, 768, 1024 and 1440 px.
- **Accessibility.** Body text is white or 72% white on black. Small red labels use a lighter red (`#ff5557`), because the button red (`#e12325`) measures about 4.5:1 on black, which is at the limit for small text. On touch devices (coarse pointers), buttons, tabs, selects, checkboxes and radio items have a 44 px minimum height.

### Overridden from UI UX Pro Max

- The generated palette (pink, cyan, light background, Brutalist sharp corners) conflicts with the brief. This build uses **pure black, cherry red and white**, as the brief requires.
- The style was not set to "Brutalism". The brief asks for a cinematic, photography-focused look with hairline white rules.

## Palette

| Token | Value | Use |
| --- | --- | --- |
| `--background` | `#000000` | Page canvas |
| `--card` | `#0b0b0c` | Cards and panels |
| `--surface-raised` | `#141416` | Raised surfaces and photo frames |
| `--primary` | `#e12325` | Primary actions, selected states, the brand red (sampled from the supplied logo) |
| `--brand-red-text` | `#ff5557` | Small red text on black (higher contrast than the button red) |
| `--foreground` | `#ffffff` | Headings and body |
| `--muted-foreground` | `rgb(255 255 255 / 0.72)` | Secondary text |
| `--border` | `rgb(255 255 255 / 0.14)` | Hairline rules |
| `--ring` | `#ffffff` | Focus outlines |

Cherry red is reserved for primary actions, selected highlights and the single accent per section. Status uses shape and label rather than extra colours: the status badge is solid for progress, outlined for waiting, and muted for cancelled.

## Typography

- Display: **Archivo Variable** (self-hosted through `@fontsource-variable/archivo`), weights 800 and 900, uppercase for headlines, tracking `-0.02em`.
- Body and UI: **Inter Variable** (`@fontsource-variable/inter`).
- Eyebrow labels: 12 px, uppercase, `0.22em` tracking, with a short red rule.

## Layout and spacing

- Container: 1280 px maximum, with 20 px side padding on phones and 32 px from 768 px up.
- Section rhythm: 80 px vertical padding on phones, 112 px on tablets, 128 px on desktop.
- Radius: 6 px for controls and cards (`--radius: 0.375rem`). Photo frames use 6 px as well, to keep the look crisp.

## Components

shadcn/ui components in use: Button, Badge, Tabs, Input, Label, Textarea, Select, Checkbox, Radio Group, Switch, Dialog, Sheet, Dropdown Menu, Calendar and Carousel. The Carousel (built on Embla, `embla-carousel-react`) drives the portfolio preview at the top of each creator card. The shadcn Tabs drive the creator profile (Biography, Photography, Videography) and the project workspace; the Calendar drives availability. The other components were installed for later use and are not imported. Custom marketplace components sit on top: creator cards with fit reasons, portfolio grids with labelled video previews, the word-counted biography field, Los Angeles neighbourhood selects, the availability calendar, price breakdowns, and status badges.

## Motion

- The **camera sequence** is a pinned GSAP ScrollTrigger tween, scrubbed by scroll, that drives an original 3D camera rendered with Three.js and React Three Fiber (`src/components/home/CameraSequence.tsx` and `src/components/home/camera/`). The camera's pose, light and shutter follow a pure function of progress. See [CAMERA.md](CAMERA.md).
- Hover transitions run 150 to 300 ms. Scroll-behaviour is smooth except under reduced motion.
- The camera pins with explicit `pinSpacing`, because the page's `<main>` is a flex column and GSAP would otherwise drop the scroll room the pin needs.
- `prefers-reduced-motion: reduce` disables the pinned sequence, shortens every transition to near zero, and shows the finished camera frame with every chapter in its final, readable state.

## Verification

- The Playwright suite (`tests/e2e`) checks the navigation, sign-up validation, biography limits, Los Angeles restrictions, discovery filters, the matching wizard, profile tabs and their keyboard behaviour, availability, team pricing, the agreement, payments, delivery, revisions, reviews and the camera animation, on desktop and on phone-sized viewports.
- Screenshots of representative pages at 1440, 768 and 390 px are generated by `tests/e2e/screenshots.spec.ts` into `screenshots/` for layout review.
