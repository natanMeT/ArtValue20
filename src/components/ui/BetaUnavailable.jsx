import { SectionHeader, EmptyState } from './atoms.jsx';
import { BETA_MESSAGES } from '../../lib/betaCapabilities.js';

// Restrained "not yet in the beta" state for a Memory-Only module (Projects /
// Inventory / Templates) in authenticated cloud mode. Renders instead of the
// working creation UI, so a direct route or old shortcut can't create a record
// that would silently vanish on refresh. Presentational only — no mutation.
export default function BetaUnavailable({ title, sub }) {
  return (
    <div>
      <SectionHeader title={title} sub={sub} />
      <div className="card panel">
        <EmptyState icon="lock" title={BETA_MESSAGES.moduleTitle} hint={BETA_MESSAGES.moduleHint} />
      </div>
    </div>
  );
}
