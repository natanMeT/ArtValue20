import { StaggerGroup, Reveal } from '../../../components/ui/motion.jsx';
import { EmptyState } from '../../../components/ui/atoms.jsx';
import LeadCategoryCard from './LeadCategoryCard.jsx';

// Responsive grid of lead-category cards. Pure presentational.
export default function LeadCategoryGrid({ categories, onSelect }) {
  if (!categories?.length) {
    return <EmptyState icon="target" title="אין קטגוריות בסינון הזה" hint="בחר סינון אחר כדי לראות קטגוריות לידים." />;
  }
  return (
    <StaggerGroup className="client-grid">
      {categories.map((cat) => (
        <Reveal key={cat.id} style={{ height: '100%' }}>
          <LeadCategoryCard category={cat} onSelect={onSelect} />
        </Reveal>
      ))}
    </StaggerGroup>
  );
}
