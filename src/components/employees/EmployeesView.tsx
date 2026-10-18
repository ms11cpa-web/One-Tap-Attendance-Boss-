import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../api/client';
import { User, UserRole } from '../../types';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  KeyRound,
  Edit2,
  CheckCircle2,
  XCircle,
  Shield,
  Building2,
  RefreshCw,
  X,
  AlertTriangle,
} from 'lucide-react';

export const EmployeesView: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<User | null>(null);
  const [resetPwdEmployee, setResetPwdEmployee] = useState<User | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<User | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');

  // Add form fields
  const [empId, setEmpId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('employee');
  const [team, setTeam] = useState('General');
  const [designation, setDesignation] = useState('Staff');
  const [joiningDate, setJoiningDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [password, setPassword] = useState('');

  // Reset password field
  const [newPassword, setNewPassword] = useState('');

  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isHrAdmin = currentUser?.role === 'hr_admin';
  const canManage = isSuperAdmin || isHrAdmin;

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (selectedTeam) params.set('team', selectedTeam);
      if (selectedRole) params.set('role', selectedRole);
      if (selectedStatus) params.set('status', selectedStatus);

      const res = await apiRequest<{ employees: User[] }>(`/api/employees?${params.toString()}`);
      setEmployees(res.employees || []);
    } catch (err) {
      console.error('Failed to load employees:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedTeam, selectedRole, selectedStatus]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      await apiRequest('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empId,
          name,
          email,
          phone,
          role,
          team,
          designation,
          joining_date: joiningDate,
          password,
        }),
      });

      setFormSuccess('Employee created successfully.');
      setTimeout(() => {
        setShowAddModal(false);
        setEmpId('');
        setName('');
        setEmail('');
        setPhone('');
        setPassword('');
        setFormSuccess('');
      }, 1000);
      await fetchEmployees();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to add employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      await apiRequest(`/api/employees/${editingEmployee.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editingEmployee.name,
          email: editingEmployee.email,
          phone: editingEmployee.phone,
          team: editingEmployee.team,
          designation: editingEmployee.designation,
          role: editingEmployee.role,
          status: editingEmployee.status,
          joining_date: editingEmployee.joining_date,
        }),
      });

      setFormSuccess('Employee updated successfully.');
      setTimeout(() => {
        setEditingEmployee(null);
        setFormSuccess('');
      }, 1000);
      await fetchEmployees();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update employee');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPwdEmployee) return;
    setFormError('');
    setFormSuccess('');
    setSubmitting(true);

    try {
      await apiRequest(`/api/employees/${resetPwdEmployee.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: newPassword }),
      });

      setNewPassword('');
      setFormSuccess('Password updated successfully.');
      setTimeout(() => {
        setResetPwdEmployee(null);
        setFormSuccess('');
      }, 1500);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEmployee = async (e: React.FormEvent) => {
    e.preventDefault(); if (!deletingEmployee) return;
    setFormError(''); setSubmitting(true);
    try {
      await apiRequest(`/api/employees/${deletingEmployee.id}`, { method: 'DELETE', body: JSON.stringify({ confirm_employee_id: deleteConfirmation, current_password: deleteAdminPassword }) });
      setDeletingEmployee(null); setDeleteConfirmation('');setDeleteAdminPassword(''); await fetchEmployees();
    } catch (e) { setFormError(e instanceof Error ? e.message : 'Deletion failed'); }
    finally { setSubmitting(false); }
  };

  const getRoleBadge = (r: UserRole) => {
    switch (r) {
      case 'super_admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Super Admin</span>;
      case 'hr_admin':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">HR Admin</span>;
      case 'team_manager':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Team Manager</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">Employee</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Employee Directory & Roles
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Manage corporate roster, departments, reporting assignments, and system privileges.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add New Employee</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search name, ID or email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Department</label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="">All Departments</option>
              <option value="Software Engineering">Software Engineering</option>
              <option value="Product & Design">Product & Design</option>
              <option value="Human Resources">Human Resources</option>
              <option value="Executive Leadership">Executive Leadership</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Role</label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="hr_admin">HR Admin</option>
              <option value="team_manager">Team Manager</option>
              <option value="employee">Employee</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
            <p className="text-xs">Loading employees...</p>
          </div>
        ) : employees.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm font-semibold text-slate-700">No employees match filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">Employee ID</th>
                  <th className="py-3.5 px-4">Name & Designation</th>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Joining Date</th>
                  <th className="py-3.5 px-4">Status</th>
                  {canManage && <th className="py-3.5 px-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {emp.employee_id}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900">{emp.name}</div>
                      <div className="text-[11px] text-teal-700 font-medium">{emp.designation}</div>
                      {emp.email && <div className="text-[10px] text-slate-400">{emp.email}</div>}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {emp.team}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {getRoleBadge(emp.role)}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                      {emp.joining_date}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                        {emp.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {canManage && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setEditingEmployee(emp)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                            title="Edit Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          {isSuperAdmin && emp.role === 'employee' && <button onClick={() => { setDeletingEmployee(emp);setDeleteConfirmation('');setDeleteAdminPassword('');setFormError(''); }} className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50" title="Permanently delete demo employee"><Trash2 className="w-3.5 h-3.5"/></button>}
                          <button
                            onClick={() => setResetPwdEmployee(emp)}
                            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                            title="Reset Password"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">Add New Employee</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-3 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleAddEmployee} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employee ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. EMP006"
                    value={empId}
                    onChange={e => setEmpId(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ayesha Siddiqa"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department / Team</label>
                  <input
                    type="text"
                    value={team}
                    onChange={e => setTeam(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Job Designation</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={e => setDesignation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email (Optional)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone (Optional)</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">System Role</label>
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="employee">Employee</option>
                    <option value="team_manager">Team Manager</option>
                    {isSuperAdmin && <option value="hr_admin">HR Admin</option>}
                    {isSuperAdmin && <option value="super_admin">Super Admin</option>}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employment Joining Date</label>
                  <input
                    type="date"
                    required
                    value={joiningDate}
                    onChange={e => setJoiningDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Initial Password</label>
                <input
                  type="text"
                  required
                  value={password}
                  minLength={12}
                  required
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Edit {editingEmployee.name} ({editingEmployee.employee_id})
              </h3>
              <button
                onClick={() => setEditingEmployee(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-3 p-3 rounded-xl bg-rose-50 text-rose-700 text-xs font-medium">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleUpdateEmployee} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={editingEmployee.name}
                  onChange={e => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={editingEmployee.team}
                    onChange={e => setEditingEmployee({ ...editingEmployee, team: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Designation</label>
                  <input
                    type="text"
                    value={editingEmployee.designation}
                    onChange={e => setEditingEmployee({ ...editingEmployee, designation: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isSuperAdmin && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Role</label>
                    <select
                      value={editingEmployee.role}
                      onChange={e => setEditingEmployee({ ...editingEmployee, role: e.target.value as UserRole })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                    >
                      <option value="employee">Employee</option>
                      <option value="team_manager">Team Manager</option>
                      <option value="hr_admin">HR Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Employment Status</label>
                  <select
                    value={editingEmployee.status}
                    onChange={e => setEditingEmployee({ ...editingEmployee, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 transition cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingEmployee && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
        <form onSubmit={handleDeleteEmployee} className="w-full max-w-md rounded-3xl bg-white p-6 space-y-3">
          <h3 className="font-bold text-rose-700 flex gap-2 items-center"><Trash2 className="w-5 h-5"/> Permanently delete employee?</h3>
          <p className="text-sm text-slate-700">{deletingEmployee.name} ({deletingEmployee.employee_id})</p>
          <p className="text-xs text-slate-600">Allowed for ordinary employees only when there are no attendance, leave, remote-work, correction or dependent business records. Otherwise use Inactive. This action cannot be undone.</p>
          {formError && <p role="alert" className="bg-rose-50 text-rose-700 text-xs p-2 rounded-lg">{formError}</p>}
          <label className="text-xs font-semibold">Type {deletingEmployee.employee_id} to confirm<input value={deleteConfirmation} onChange={e=>setDeleteConfirmation(e.target.value.toUpperCase())} className="block mt-1 w-full rounded-xl border border-slate-300 p-2.5 font-mono" /></label>
          <label className="text-xs font-semibold">Your Super Admin password<input type="password" autoComplete="current-password" required value={deleteAdminPassword} onChange={e=>setDeleteAdminPassword(e.target.value)} className="block mt-1 w-full rounded-xl border border-slate-300 p-2.5" /></label>
          <div className="flex gap-2 justify-end"><button type="button" onClick={()=>{setDeletingEmployee(null);setFormError('');}} className="px-4 py-2 text-xs">Cancel</button><button type="submit" disabled={submitting || !deleteAdminPassword || deleteConfirmation !== deletingEmployee.employee_id} className="bg-rose-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl px-4 py-2">{submitting?'Deleting…':'Delete permanently'}</button></div>
        </form>
      </div>}

      {/* Password Reset Modal */}
      {resetPwdEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl border border-slate-100">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Reset Password for {resetPwdEmployee.name}
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-mono">
              Employee ID: {resetPwdEmployee.employee_id}
            </p>

            {formSuccess && (
              <div className="mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium">
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Password
                </label>
                <input
                  type="text"
                  required
                  value={newPassword}
                  minLength={12}
                  required
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetPwdEmployee(null)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition cursor-pointer"
                >
                  {submitting ? 'Resetting...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
