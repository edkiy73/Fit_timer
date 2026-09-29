import { AdminPanel } from '@appbase/ui-react/admin.js';
import { sharedUiLocale, useI18n } from '@appbase/ui-react/i18n.js';
import { adminClient } from './admin';
import { contentAdminSection } from './admin-content';
import { courseAdminSection } from './admin-course';

/* Loaded only on #/admin (lazy route in app.tsx), so learners never download the editors. */
export function AdminScreen({productName}: {productName: string}){
  const {locale} = useI18n();
  return <AdminPanel client={adminClient} locale={sharedUiLocale(locale)} productName={productName} extraSections={[courseAdminSection,contentAdminSection]} />;
}
