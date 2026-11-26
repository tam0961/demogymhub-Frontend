export const isTrainerOnly = (roles: string[]) => roles.includes('trainer') && !roles.some((r) => ['owner', 'super_admin', 'branch_manager', 'receptionist', 'admin'].includes(r))
