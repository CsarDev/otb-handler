import { useAuthStore } from '../stores/auth.store';

export function usePermission() {
  const { user } = useAuthStore();

  const hasPermission = (permission: string) => {
    if (!user) return false;
    return user.permissions.includes(permission) || user.permissions.includes(`${permission.split(':')[0]}:manage`);
  };

  const hasAnyPermission = (...permissions: string[]) => {
    return permissions.some(hasPermission);
  };

  return { hasPermission, hasAnyPermission };
}
