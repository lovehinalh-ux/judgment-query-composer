# Judgment Query Composer

A React + Vite tool for composing high-relevance FJUD search strings for traffic-accident judgments.

## Key Features
- Quick presets and custom keyword selection.
- Plain-language to legal-term mapping.
- One-click copy for generated search strings.
- Shareable URL state for restoring selections.

## Tech Stack
- React 18
- Vite 7
- ESLint + `eslint-plugin-security`

## Installation
```bash
npm install
```

## Development Commands
```bash
npm run dev
npm run lint
npm run build
```

## Security SOP (Implemented)
1. Dependency audit:
   - `npm audit --audit-level=high`
2. Lint security rules:
   - `plugin:security/recommended` enabled in `.eslintrc.cjs`
3. Secret hygiene:
   - Keep secrets in `.env` only.
   - Use `.env.example` for placeholders.
4. CI:
   - On push to `main`, GitHub Actions runs install, lint, audit, build.

## Deployment
This is a static site. Build output is `dist/`.

Supported hosts:
- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages

## Environment Variables
No required runtime secrets for current version.
If needed later, define variables in `.env` and mirror keys in `.env.example`.
