import { NavLink, useLocation } from 'react-router';
import { useI18n } from '@appbase/ui-react/i18n.js';
import { useLearnerCourseRuntime } from './course-runtime';
import { useWordReviewRuntime } from './word-review-runtime';
import { reviewDueCounts } from './review-count';
import { useOtherCourseReviews } from './other-course-review';
import { Icon, type IconName } from './icons';

const TABS: {to: string; icon: IconName; label: string; end?: boolean}[] = [
  {to:'/', icon:'today', label:'nav.today', end:true},
  {to:'/course', icon:'route', label:'nav.route'},
  {to:'/review', icon:'review', label:'nav.review'},
  {to:'/account', icon:'me', label:'nav.me'}
];

/** Lessons, dialogues and AI talks run full-screen; every other screen keeps the bottom bar. */
export function tabBarHidden(pathname: string): boolean {
  return pathname.startsWith('/learn/');
}

function ReviewBadge(){
  const {t, locale} = useI18n();
  const runtime = useLearnerCourseRuntime();
  const words = useWordReviewRuntime();
  const others = useOtherCourseReviews(runtime.state?.set.id ?? '');
  const count = reviewDueCounts(runtime.state, words, locale, undefined, others.courses)?.actionableCount ?? 0;
  if(count <= 0) return null;
  return (
    <span className="tabbar-badge">
      <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
      <span className="sr-only">{t('nav.reviewDue', {count})}</span>
    </span>
  );
}

export function TabBar(){
  const {t} = useI18n();
  const location = useLocation();
  if(tabBarHidden(location.pathname)) return null;
  return (
    <nav className="tabbar" aria-label={t('nav.tabs')}>
      {TABS.map(tab => (
        <NavLink key={tab.to} to={tab.to} end={tab.end ?? false} className="tabbar-item pressable">
          <span className="tabbar-icon">
            <Icon name={tab.icon} size={22} />
            {tab.to === '/review' && <ReviewBadge />}
          </span>
          <span className="tabbar-label">{t(tab.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
