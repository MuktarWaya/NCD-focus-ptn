---
name: Vital Glass
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#3e4850'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#6e7881'
  outline-variant: '#bec8d2'
  surface-tint: '#006591'
  primary: '#006591'
  on-primary: '#ffffff'
  primary-container: '#0ea5e9'
  on-primary-container: '#003751'
  inverse-primary: '#89ceff'
  secondary: '#4648d4'
  on-secondary: '#ffffff'
  secondary-container: '#6063ee'
  on-secondary-container: '#fffbff'
  tertiary: '#006c49'
  on-tertiary: '#ffffff'
  tertiary-container: '#00b17b'
  on-tertiary-container: '#003b26'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c9e6ff'
  primary-fixed-dim: '#89ceff'
  on-primary-fixed: '#001e2f'
  on-primary-fixed-variant: '#004c6e'
  secondary-fixed: '#e1e0ff'
  secondary-fixed-dim: '#c0c1ff'
  on-secondary-fixed: '#07006c'
  on-secondary-fixed-variant: '#2f2ebe'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
  risk-warning: '#f59e0b'
  risk-danger: '#ef4444'
  surface-glass: rgba(255, 255, 255, 0.7)
  background-base: '#f4f6fa'
  text-slate: '#0f172a'
typography:
  headline-lg:
    fontFamily: Outfit
    fontSize: 40px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Outfit
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Sarabun
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Sarabun
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-sm:
    fontFamily: Sarabun
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Outfit
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.05em
  stat-display:
    fontFamily: Outfit
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 1.5rem
  margin-mobile: 1rem
  margin-desktop: 2.5rem
  stack-sm: 0.5rem
  stack-md: 1rem
  stack-lg: 2rem
---

## Brand & Style

This design system is engineered for a high-end medical health tracking experience, specifically tailored for health professionals and community volunteers. The aesthetic blends **Modern Corporate** reliability with a **Glassmorphism** layer to create an interface that feels airy, sterile, yet technologically advanced.

The visual narrative centers on "clarity through transparency." By utilizing frosted glass surfaces, the UI avoids the heaviness often associated with data-dense health dashboards. It prioritizes high legibility and a calming atmosphere to reduce cognitive load during medical monitoring. The emotional response is one of clinical precision met with modern, approachable technology.

## Colors

The palette is anchored by a "Medical Teal" primary color, symbolizing trust and hygiene. The secondary Indigo provides a sophisticated contrast for functional logging actions, while the Emerald tertiary color is reserved exclusively for positive health outcomes and metrics.

Status-based colors (Amber and Coral) are used with high saturation to ensure critical patient risks are immediately identifiable. The background is a cool-toned gray-blue to allow the white glass cards to pop. Transparency is a functional color state in this design system: background surfaces should utilize 70-80% opacity with a heavy backdrop blur.

## Typography

This design system uses a dual-font strategy to optimize for both Latin numerals and Thai script. 

**Outfit** is the lead typeface for headers, labels, and numerical data. Its geometric clarity makes it ideal for health metrics and quick-scan information. **Sarabun** is utilized for all body copy and Thai descriptions, ensuring high legibility for local health officers. 

For data dashboards, use the `stat-display` style for primary health indicators (e.g., blood pressure readings or blood sugar levels) to ensure they are the focal point of the screen.

## Layout & Spacing

The design follows a **Fluid Grid** model with generous safe areas to maintain an "airy" feel. On desktop, a 12-column grid is used with 24px gutters. Elements should be grouped into cards that span logical column groups (e.g., 3 columns for quick stats, 6-9 columns for main health charts).

Vertical rhythm is strictly maintained using an 8px base unit. Section spacing should favor `stack-lg` to prevent the UI from feeling cluttered, which is vital for users processing complex medical data. Mobile layouts reflow to a single column with 16px side margins.

## Elevation & Depth

Depth is achieved through **Glassmorphism** rather than traditional heavy shadows. Surfaces use a hierarchical stacking method:

1.  **Background Base:** Solid `#f4f6fa`.
2.  **Primary Cards:** 70% opacity white with a 12px backdrop-blur and a subtle 1px border (`rgba(255, 255, 255, 0.4)`). These cards use a "Micro-shadow" (`0 8px 32px 0 rgba(31, 38, 135, 0.05)`) to appear slightly lifted.
3.  **Floating Elements (Modals/Tooltips):** 90% opacity white with increased backdrop-blur (20px) and a slightly more pronounced shadow to indicate top-level priority.

Avoid dark shadows or solid-colored borders; the edge of elements should be defined by the contrast between the blur and the background.

## Shapes

The shape language is "Soft-Modern." Large radii are applied to primary containers to create a friendly, non-threatening environment for health monitoring. 

Cards and main dashboard panels must use the `rounded-lg` (1rem/16px) or `rounded-xl` (1.5rem/24px) setting—specifically targeted at 20px for standard medical cards. Buttons and input fields use a more precise 12px radius to maintain a functional, interactive feel, while status badges use a full pill-shape for immediate recognition.

## Components

### Buttons
Primary buttons use a solid primary color fill with a subtle glow shadow (`rgba(14, 165, 233, 0.2)`). Secondary buttons should be styled as "ghost" buttons with a primary color border and semi-transparent background to fit the glass aesthetic.

### Cards
All cards must implement backdrop-blur. Health "Status Cards" should feature a small vertical color-bar on the left edge (Teal, Amber, or Coral) to indicate the health category without overwhelming the glass effect.

### Input Fields
Inputs should be semi-transparent with a 1px border. On focus, the border should transition to the Primary Teal with a soft outer glow.

### Chips & Badges
Badges for risk levels (e.g., "Normal", "At Risk", "High Blood Pressure") use the pill-shape with a high-saturation background and white text for maximum contrast and immediate readability.

### Progress Indicators
Health tracking bars should use a thick, rounded track (8px height) with a soft background version of the metric's color (e.g., `success_light` for the track and `success` for the fill).