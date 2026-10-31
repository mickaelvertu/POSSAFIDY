import type { Employee, InventoryCount, Payslip, SalaryAdvance, Sale, UserProfile } from '../types';

export interface UserAuditData {
  users: UserProfile[];
  employees: Employee[];
  sales: Sale[];
  advances: SalaryAdvance[];
  payslips: Payslip[];
  counts: InventoryCount[];
}
export interface UserAuditFilters { userId: string; storeId: string; start: string; end: string }

export function buildUserAudit(data: UserAuditData, filters: UserAuditFilters) {
  const inPeriod = (timestamp: number) => Number.isFinite(timestamp) &&
    (!filters.start || timestamp >= new Date(`${filters.start}T00:00:00`).getTime()) &&
    (!filters.end || timestamp <= new Date(`${filters.end}T23:59:59.999`).getTime());
  const inStore = (id?: string) => !filters.storeId || id === filters.storeId;
  return data.users.filter(user => !filters.userId || user.id === filters.userId).map(user => {
    const identities = new Set([user.id, user.uid].filter(Boolean));
    const employees = data.employees.filter(employee => employee.user_id && identities.has(employee.user_id));
    const employeeIds = new Set(employees.map(employee => employee.id));
    const storeIds = [...new Set([...user.storeIds, ...(user.storeId ? [user.storeId] : []), ...employees.flatMap(employee => employee.store_id ? [employee.store_id] : [])])];
    const sales = data.sales.filter(sale => identities.has(sale.seller_id) && inPeriod(sale.created_at) && inStore(sale.store_id));
    // Payroll has no historical store field: its store scope is the employee's current assignment.
    const payrollIds = new Set(employees.filter(employee => inStore(employee.store_id)).map(employee => employee.id));
    const advances = data.advances.filter(advance => payrollIds.has(advance.employee_id) && inPeriod(advance.advance_date));
    const payslips = data.payslips.filter(slip => payrollIds.has(slip.employee_id) && inPeriod(new Date(`${slip.period}-01T00:00:00`).getTime()));
    const counts = data.counts.filter(count => (count.charged_employee_id ? employeeIds.has(count.charged_employee_id) : count.charged_to && (identities.has(count.charged_to) || employeeIds.has(count.charged_to))) && count.status === 'VALIDATED' && inStore(count.store_id) && inPeriod(count.reviewed_at ?? count.updated_at));
    const revenue = sales.filter(sale => sale.status === 'VALIDATED').reduce((sum, sale) => sum + sale.total, 0);
    return { user, employees, storeIds, sales, advances, payslips, counts, revenue };
  }).filter(fiche => !filters.storeId || fiche.storeIds.includes(filters.storeId) || fiche.sales.length > 0 || fiche.counts.length > 0);
}
