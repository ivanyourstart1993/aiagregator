import { redirect } from '@/i18n/navigation';

// /admin has no own content yet — send to the most useful landing.
// AdminLayout already enforces the role check, so we don't repeat it here.
export default function AdminIndexPage() {
  redirect('/admin/users');
}
