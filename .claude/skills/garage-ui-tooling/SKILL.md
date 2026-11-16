---
name: garage-ui-tooling
description: Aturan tooling UI/UX Garage: Crystal V5 untuk permukaan publik, skill animasi, GSAP, image generation, MCP shadcn/context7/playwright/chrome-devtools. Muat sebelum pekerjaan UI/desain/animasi.
---

# garage-ui-tooling

> Dipindah apa adanya dari `CLAUDE.md` (Nov 2026, hemat token). Aturan Owner di sini tetap mengikat penuh.
> Baca hanya bagian yang relevan (Grep judul/kata kunci) bila file ini panjang.

## UI/UX Tooling (skills + free MCP)

Use these automatically when the task calls for them; do not wait to be asked. Design rules above (Garage palette,
`design-system/MASTER.md`, member contract) always win over any skill or MCP output.

Skills (`.claude/skills/`): `ui-ux-pro-max` (style/palette/layout ideas), `frontend-design` (hierarchy, type, restraint,
copy; never a rebrand), `web-design-guidelines` (audit UI code, output `file:line`).
Garage Crystal V5 (owner, 8 Nov 2026) is the visual source of truth for ALL public surfaces (`/order` landing, table
picker, digital menu, member login/dashboard/card) and the internal sidebar: boards `docs/design-references/crystal-v5/`,
spec `docs/crystal-v5/01-DESIGN-SYSTEM.md`, tokens `--gc-*` (`src/lib/crystal-tokens.ts`, `src/components/crystal/crystal.css`,
AA-tested), components `src/components/crystal/` (CrystalCard/Button/Chip/Badge/Sheet/LaserBorder/StatusDot). It replaces the
older Menu V5 boards and member palette as the visual target; behaviour, data and ordering rules stay (self-order kept).
Skill `garage-menu-v5` still applies for menu data rules (no fake options/badges, real photos, Daftar Pilihan wording).
Animation skills (owner, Nov 2026: customer surfaces = cinematic, operational screens = fast and restrained): ONE entry
skill `garage-motion` (router + Garage motion rules). The 19 original skills (Emil Kowalski craft, LottieFiles motion-design,
iart-ai web animation, official GreenSock gsap-*) live unchanged in `.claude/skills/garage-motion/ref/<name>/` (licenses in
`ref/_licenses/`); read only the one file the router points to.
Use `framer-motion` (installed) and CSS first. GSAP (`gsap@3.15.0`, pinned) was added with owner approval (Nov 2026) for the
website Cinematic Laser UI (`src/components/garage-website/cinematic/`: hero, laser border, ScrollTrigger progress, site
SFX default OFF in `site-sfx.ts`); Lottie is still NOT a dependency: ask the owner before adding it.
Skipped on purpose: glassmorphism (heavy blur conflicts with the motion policy) and auto-invoking AI image-generation
skills. Licenses: `.claude/skills/_licenses/`.
Image generation (owner, Nov 2026): MCP `mcp-image` (pinned 0.18.2, template `.claude/mcp-ui.example.json`) needs
`GEMINI_API_KEY` from the environment/secrets, never in a file or chat. Use it ONLY when the owner asks for an image
(it spends API quota; never auto-generate). Output goes to `docs/design-handoff/assets-incoming/generated/`, then follow
`docs/design-handoff/README.md` (no text/prices/logos inside images, logo and AYA only from official assets).

MCP servers (free, no API key; config template `.claude/mcp-ui.example.json`, copy to `.mcp.json` which is gitignored
because it can hold secrets; versions pinned):
- `shadcn`: before writing a new UI component, search the shadcn registry (`search_items_in_registries`,
  `view_items_in_registries`) and prefer adding/adapting an existing one. Style is `radix-nova` in `components.json`.
- `context7`: before using Next.js, Tailwind v4, shadcn/Radix, Drizzle or Better Auth APIs, look up current docs
  (`resolve-library-id` then `query-docs`) instead of relying on memory.
- `playwright`: visual QA after UI changes. Screenshot desktop 1366x900 and mobile 390x844, check console errors,
  horizontal overflow, clipped money/status text. Take screenshots, read them, fix, repeat.
- `chrome-devtools`: debugging only (layout, CSS, network, Lighthouse a11y/perf) when Playwright shows a problem.
  Do not run both browsers on the same task without reason.

Theme workflow: pick the theme/direction from the brief and the Garage system first (or propose it and state any
deviation before building), then use `shadcn` for parts, `context7` for API accuracy, `playwright` to verify.
In a cloud session the preinstalled Chromium is at `/opt/pw-browsers/chromium` (pass `--executable-path` plus
`--no-sandbox` if the default browser is not found). Never put tokens in `.claude/mcp-ui.example.json`.
