import { StaggerGroup, Reveal } from '../../../components/ui/motion.jsx';
import { EmptyState } from '../../../components/ui/atoms.jsx';
import ContentAdsCard from './ContentAdsCard.jsx';

// Responsive grid of content/ad template cards. Pure presentational.
export default function ContentAdsGrid({ items, onSelect }) {
  if (!items?.length) {
    return <EmptyState icon="image" title="אין תבניות בסינון הזה" hint="בחר סינון אחר כדי לראות תבניות פרסום ותוכן." />;
  }
  return (
    <StaggerGroup className="client-grid">
      {items.map((item) => (
        <Reveal key={item.id} style={{ height: '100%' }}>
          <ContentAdsCard item={item} onSelect={onSelect} />
        </Reveal>
      ))}
    </StaggerGroup>
  );
}
