# Design System: GARAGE ProfitMax

## Brand Summary
A modern, dark-themed, premium POS and management dashboard for a coffee shop and garage. The UI emphasizes high contrast, readability, and a sleek layout suitable for both daytime operations and dimly lit garage environments.

## Color Tokens
| Token | Value | Usage |
|---|---:|---|
| Background Dark | `#0f172a` | Main app background, deeper sections |
| Background Card | `#1e293b` | Cards, sidebar, elevated containers |
| Text Main | `#f8fafc` | Primary body text and headings |
| Text Muted | `#94a3b8` | Subtext, labels, inactive elements |
| Primary Accent | `#3b82f6` | Primary buttons, active navigation, links |
| Success Accent | `#10b981` | Positive indicators, paid status, growth |
| Warning Accent | `#f59e0b` | Alerts, neutral/warning indicators |
| Danger Accent | `#ef4444` | Errors, negative growth, missing stock |
| Border | `#334155` | Dividers, card borders, table rows |

## Typography
| Role | Font | Size | Weight | Line Height | Usage |
|---|---|---:|---:|---:|---|
| Headings | Inter | 1.5rem - 2rem | 700 - 800 | 1.2 | Page titles, major section headers |
| Body | Inter | 1rem | 400 | 1.5 | Standard text, table data |
| Small / Label | Inter | 0.75rem - 0.875rem | 500 - 600 | 1.5 | Uppercase labels, table headers, subtext |

## Spacing and Layout
- **Base spacing unit:** `0.25rem` (4px)
- **Container padding:** `2rem` (32px) for main content area.
- **Card padding:** `1.5rem` (24px).
- **Grid behavior:** Standard 1-to-4 column responsive grid with `1.5rem` gaps.
- **Sidebar width:** `250px`.

## Shape, Borders, and Elevation
- **Radius scale:** `0.5rem` (8px) for buttons/inputs, `1rem` (16px) for cards.
- **Border style:** Solid `1px` borders using `--border-color`.
- **Shadow/elevation rules:**
  - `sm`: Subtle lift for cards default state.
  - `md`: Hover state for cards and active navigation.
  - `lg`: Modals or deep overlays.

## Components
### Button
- **Variants:** Primary (Blue), Success (Green), Default/Outline (Transparent).
- **States:** Hover darkens the background color by ~10-20%.
- **Shape:** `0.5rem` radius, bold text.

### Card
- **Structure:** Contains an uppercase muted title, bold large value, and optional right-aligned icon.
- **Interaction:** `translateY(-2px)` with increased shadow on hover.

### Sidebar Navigation
- **Active State:** Solid primary background, white text, medium shadow.
- **Inactive State:** Transparent background, muted text, hovers to light blue tint.

### Tables
- **Structure:** Edge-to-edge within cards.
- **Headers:** Uppercase, muted text, `0.75rem`.
- **Rows:** Separated by `1px` border, padding `1rem`.

## Responsive Rules
- **Desktop:** Sidebar is fixed left, main content flexes to fill width. Cards use 2-4 column grids.
- **Tablet/Mobile:** (To be implemented in Stitch) Sidebar should collapse into a drawer or bottom tab bar. Grids should stack to 1 column.

## Accessibility Notes
- **Contrast:** Ensures high contrast between `#f8fafc` text and `#0f172a` / `#1e293b` backgrounds.
- **Focus states:** Inputs glow with primary accent border color when focused.

## Stitch Generation Guidance
- Use these exact color hex codes if creating a new design system inside Stitch.
- Apply the `1rem` radius to major structural cards and `0.5rem` to interactive elements.
- Keep the dark mode theme strict; do not mix light mode components into the generated screens.
