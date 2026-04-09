/**
 * Style Dictionary v4 config
 * Transforms design tokens (tokens/**\/*.json) → dist/tokens.css + dist/tokens.js
 *
 * Run:  npm run build:tokens
 * Watch: npm run watch:tokens
 */

export default {
  // Token source files — order matters for alias resolution
  source: [
    'tokens/base/*.json',       // primitives first
    'tokens/semantic/*.json',   // semantic aliases second
    'tokens/component/*.json',  // component-level tokens last
  ],

  // Custom transform: convert px dimension values to rem (except line-height/letter-spacing)
  hooks: {
    transforms: {
      'size/pxToRem': {
        type: 'value',
        filter: (token) =>
          token.$type === 'dimension' &&
          !token.path.includes('letter-spacing') &&
          !token.path.includes('line-height') &&
          !token.path.includes('breakpoint') &&
          !token.path.includes('font-weight'),
        transform: (token) => {
          const val = parseFloat(token.$value ?? token.value)
          if (isNaN(val)) return token.$value ?? token.value
          return val === 0 ? '0' : `${val / 16}rem`
        },
      },
    },
  },

  platforms: {
    // ─── CSS custom properties ─────────────────────────────────────────────
    css: {
      transformGroup: 'css',
      transforms: ['attribute/cti', 'name/kebab', 'size/pxToRem', 'color/css'],
      prefix: '',
      buildPath: 'dist/',
      files: [
        // Light mode (default)
        {
          destination: 'tokens.css',
          format: 'css/variables',
          filter: (token) => !token.path[0].startsWith('semantic-dark'),
          options: {
            selector: ':root',
            outputReferences: false,
          },
        },
        // Dark mode overrides
        {
          destination: 'tokens.dark.css',
          format: 'css/variables',
          filter: (token) => token.path[0] === 'semantic-dark',
          options: {
            selector: '[data-theme="dark"]',
            outputReferences: false,
          },
        },
      ],
    },

    // ─── JavaScript / TypeScript ───────────────────────────────────────────
    js: {
      transformGroup: 'js',
      transforms: ['attribute/cti', 'name/camel'],
      buildPath: 'dist/',
      files: [
        {
          destination: 'tokens.mjs',
          format: 'javascript/es6',
        },
        {
          destination: 'tokens.d.ts',
          format: 'typescript/es6-declarations',
        },
      ],
    },
  },
}
