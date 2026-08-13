import { useAuthStore } from '../stores/auth.store';

export function usePermission() {
  const { user } = useAuthStore();

  const hasPermission = (permission: string) => {
    if (!user) return false;
    const permissions = user.permissions ?? [];
    return permissions.includes(permission) || permissions.includes(`${permission.split(':')[0]}:manage`);
  };

  const hasAnyPermission = (...permissions: string[]) => {
    return permissions.some(hasPermission);
  };

  return { hasPermission, hasAnyPermission };
}
