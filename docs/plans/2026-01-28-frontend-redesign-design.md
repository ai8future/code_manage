# Frontend Redesign - Design Document

## Goal

Comprehensive visual polish pass across the Code Management App. Improve depth, micro-interactions, layout hierarchy, and dark mode without changing functionality.

## 1. Visual Foundation -- Depth, Blur, Shadows

### Card Elevation System
- **Resting**: `shadow-sm` on all cards
- **Hover**: `shadow-md` with `scale-[1.01]` transform
- **Modals**: `shadow-2xl` with `backdrop-blur-sm` on overlay
- **Sidebar**: Right-edge shadow `shadow-[2px_0_8px_rgba(0,0,0,0.06)]`

### Background
- Light mode: Soften from `gray-50` to a warmer tone
- Cards remain `white` / `gray-800` but gain shadow separation

### Transitions
- All shadow/scale changes: `transition-all duration-200 ease-out`

## 2. Micro-interactions

### Toast Notification System
- React context + provider wrapping the app
- Position: bottom-right, stacked
- Auto-dismiss: 3 seconds
- Animation: slide-in from right, fade out
- Variants: success (green), error (red), info (blue)
- Used for: copy path, open editor, move project, errors

### Card Entrance Animations
- Staggered fade-up on mount
- Per-card delay: `index * 50ms`
- Animation: `opacity 0->1`, `translateY 8px->0`, `duration 300ms`
- CSS keyframes in globals.css, applied via inline style for delay

### Skeleton Loaders
- Replace `Loader2` spinner in ProjectGrid with skeleton cards
- Skeleton matches card dimensions: rounded-lg, pulsing gray rectangles
- 8 skeleton cards shown during load (matches typical grid)

### Hover Effects
- Cards: `hover:shadow-md hover:scale-[1.01]` with `transition-all`
- Buttons: `active:scale-95` press effect
- Sidebar items: smooth background fill `transition-colors duration-150`

### Expand/Collapse
- Bug tracking and code quality sections: `max-height` + `overflow-hidden` transition
- Duration: 200ms ease-out

## 3. Layout & Hierarchy

### Sticky Page Header
- Fixed at top of content area (not sidebar)
- Contains: breadcrumbs, page title, action buttons
- Style: `sticky top-0 z-10 backdrop-blur-sm bg-white/80 dark:bg-gray-900/80 border-b`
- Breadcrumbs: `Dashboard > Status > Project Name` with chevron separators

### Section Spacing
- Between major sections: `gap-6` or `space-y-6`
- Within sections: `gap-4`
- Creates clear visual rhythm

### Card Accent Borders
- Project detail info cards get `border-l-4` with themed colors:
  - Tech Stack: `border-l-blue-500`
  - Git Info: `border-l-orange-500`
  - Dependencies: `border-l-green-500`
  - Bug Tracking: `border-l-red-500`
  - Code Quality: `border-l-purple-500`

### Section Dividers
- Dashboard sections get labeled dividers
- Horizontal rule with section name: `flex items-center gap-4` with `<hr>` segments

### Enhanced Empty States
- Larger icon (48px -> 64px)
- Descriptive subtext explaining why empty
- Call-to-action button when relevant

### Search Bar Enhancement
- Larger with background fill (`bg-gray-100 dark:bg-gray-700`)
- Keyboard shortcut hint: `/ to search` shown as badge
- Focus ring with slight expand effect

## 4. Dark Mode Refinements

### Backgrounds
- Page background: `#111827` (gray-900) instead of `#0a0a0a`
- Card background: `gray-800` with subtle border
- Borders: `gray-700/50` (semi-transparent) instead of solid `gray-700`

### Text Hierarchy
- Headings: `gray-100`
- Body text: `gray-300`
- Secondary/meta: `gray-500`

### Accents
- Badge backgrounds: `/20` opacity instead of `/30`
- Modal overlay: `bg-black/60 backdrop-blur-md`

## Implementation Order

1. **globals.css + Tailwind config**: Animation keyframes, CSS variables
2. **Toast system**: Context, provider, component
3. **Layout component**: Sticky header with breadcrumbs
4. **Card updates**: Shadows, hover effects, accent borders
5. **ProjectGrid**: Skeleton loaders, entrance animations
6. **Modals**: Backdrop blur, enhanced shadows
7. **Sidebar**: Shadow, refined transitions
8. **Dark mode**: Background/border/text refinements across all components
9. **Search bar**: Enhanced styling
10. **Section dividers + empty states**: Final polish

## Files Modified

- `app/globals.css` - Keyframes, CSS variables, dark mode base
- `app/layout.tsx` - Toast provider, background updates
- `app/page.tsx` - Section dividers, spacing
- `app/project/[slug]/page.tsx` - Breadcrumbs, card accents
- `app/[status]/page.tsx` - Breadcrumbs
- `components/toast/ToastContext.tsx` - New
- `components/toast/Toast.tsx` - New
- `components/layout/PageHeader.tsx` - New
- `components/layout/SectionDivider.tsx` - New
- `components/layout/SkeletonCard.tsx` - New
- `components/sidebar/Sidebar.tsx` - Shadow, transitions
- `components/dashboard/ProjectGrid.tsx` - Skeletons, animations
- `components/dashboard/ProjectCard.tsx` - Hover effects, shadows
- `components/dashboard/SearchBar.tsx` - Enhanced styling
- `components/project/InfoCards.tsx` - Accent borders
- `components/project/BugsCard.tsx` - Accent border, expand animation
- `components/project/CodeQualityCard.tsx` - Accent border
- `components/project/ReadmePreview.tsx` - Shadow
