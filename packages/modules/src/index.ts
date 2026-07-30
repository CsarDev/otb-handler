export type ModuleDefinition = {
  name: string;
  label: string;
  category: 'core' | 'financial' | 'hr' | 'inventory';
  description: string;
  version: string;
};

export const AVAILABLE_MODULES: ModuleDefinition[] = [
  { name: 'socios', label: 'Socios', category: 'core', description: 'Member management', version: '1.0.0' },
  { name: 'asistencia', label: 'Asistencia', category: 'core', description: 'Attendance tracking', version: '1.0.0' },
  { name: 'aportes', label: 'Aportes', category: 'core', description: 'Contribution management', version: '1.0.0' },
  { name: 'multas', label: 'Multas', category: 'core', description: 'Fine management', version: '1.0.0' },
  { name: 'egresos', label: 'Egresos', category: 'financial', description: 'Expense tracking', version: '1.0.0' },
  { name: 'facturas', label: 'Facturas', category: 'financial', description: 'Invoice generation', version: '0.1.0' },
  { name: 'contabilidad', label: 'Contabilidad', category: 'financial', description: 'Accounting ledger', version: '0.1.0' },
  { name: 'empleados', label: 'Empleados', category: 'hr', description: 'Employee management', version: '0.1.0' },
  { name: 'nominas', label: 'Nóminas', category: 'hr', description: 'Payroll management', version: '0.1.0' },
  { name: 'productos', label: 'Productos', category: 'inventory', description: 'Product inventory', version: '0.1.0' },
  { name: 'movimientos-inventario', label: 'Mov. Inventario', category: 'inventory', description: 'Inventory movements', version: '0.1.0' },
];

export function getModulesByCategory(category: ModuleDefinition['category']) {
  return AVAILABLE_MODULES.filter((m) => m.category === category);
}
