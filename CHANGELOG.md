# Changelog

All notable changes to this project will be documented in this file.

## [1.0.4] - 2026-01-24

### Security
- Fix command injection vulnerability in open-editor and open-finder APIs
  - Changed from exec() to execFile() to prevent shell injection
  - Added path validation with path.resolve() to prevent traversal
- Fix path traversal vulnerability in file API
  - Now uses path.resolve() before checking path prefix

### Fixed
- Add missing 'crawlers' status to move API
- Fix double filesystem scan in projects API (performance improvement)
- Add status parameter validation in projects API
- Add crawlers to ProjectCounts interfaces in SidebarWrapper and ProjectGrid

## [1.0.3] - 2026-01-24

### Added
- Bug file preview modal with rendered Markdown
- Click on bug to see formatted content in popup
- "Open in VS Code" button in modal header
- File API endpoint for reading file contents
- @tailwindcss/typography for prose styling

## [1.0.2] - 2026-01-24

### Added
- New "Crawlers" status category for crawler projects in _crawlers folder
- Crawlers section in sidebar (above Icebox) with Bug icon

## [1.0.1] - 2026-01-24

### Fixed
- CodeHealthSection now correctly extracts projects array from API response

## [1.0.0] - 2026-01-24

### Added
- Initial release of Code Management App
- Collapsible sidebar with Navigation Rail/Drawer pattern
- Project scanner detecting tech stack from package.json, pyproject.toml, Cargo.toml, go.mod
- Project cards with search/filter, tech badges, git info, version display
- Project detail view with info cards, README preview, bug tracking
- rcodegen integration: grade badges on cards, CodeQualityCard with task breakdown
- Code Health Dashboard section showing grades overview and projects needing attention
- Settings page foundation
- Terminal panel foundation
- API routes for projects, actions (open editor/finder, move), and terminal
