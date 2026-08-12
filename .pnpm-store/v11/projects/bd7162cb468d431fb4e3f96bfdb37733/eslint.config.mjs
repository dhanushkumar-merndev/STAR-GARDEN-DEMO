import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores(['.next/**', 'coverage/**', 'supabase/functions/**', 'next-env.d.ts']),

  /**
   * Vendored third-party source.
   *
   * `components/ui/map.tsx` is mapcn's map component, copied in from its
   * registry. It assigns to refs during render and sets state inside an effect
   * to drive MapLibre — patterns the React Compiler rules reject but which are
   * upstream's, not ours. Rewriting them would mean re-doing the work on every
   * update and risking a library we did not write; the rules are switched off
   * for this one file instead.
   *
   * Anything hand-written in this codebase stays under the full rule set — do
   * not widen this glob.
   */
  {
    files: ['src/components/ui/map.tsx'],
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);
