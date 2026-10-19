export type UserRole = 'super_admin' | 'hr_admin' | 'team_manager' | 'employee';

export interface User {
  id: string;
  employee_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  team: string;
  designation: string;
  manager_id: string | null;
  status: 'active' | 'inactive';
  joining_date: string;
  created_at?: number;
}

export interface OfficeSettings {
  id: string;
  company_name: string;
  office_name: string;
  office_latitude: number;
  office_longitude: number;
  permitted_radius_meters: number;
  max_gps_accuracy_meters: number;
  work_start_time: string;
  work_end_time: string;
  scheduled_duration_minutes: number;
  grace_period_minutes: number;
  weekly_holidays: string; // JSON string e.g. '["Friday","Saturday"]'
  timezone: string;
  overtime_policy: string;
  half_day_hours: number;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  employee_id?: string;
  employee_name?: string;
  team?: string;
  designation?: string;
  attendance_date: string;
  work_mode: 'office' | 'remote';
  in_time: string | null;
  in_timestamp: number | null;
  in_latitude: number | null;
  in_longitude: number | null;
  in_distance_meters: number | null;
  in_accuracy_meters: number | null;
  in_verified: number;
  out_time: string | null;
  out_timestamp: number | null;
  out_latitude: number | null;
  out_longitude: number | null;
  out_distance_meters: number | null;
  out_accuracy_meters: number | null;
  out_verified: number;
  total_duration_minutes: number;
  late_minutes: number;
  extra_minutes: number;
  shortfall_minutes: number;
  status: 'present' | 'late' | 'half_day' | 'missing_out';
  schedule_snapshot?: string;
}

export interface LeaveCategory {
  id: string;
  name: string;
  default_days_per_year: number;
  paid: number;
  color: string;
}

export interface LeaveBalance {
  id: string;
  user_id: string;
  category_id: string;
  year: number;
  allocated_days: number;
  used_days: number;
  pending_days: number;
  name: string;
  color: string;
}

export interface LeaveRequest {
  id: string;
  user_id: string;
  employee_id?: string;
  employee_name?: string;
  team?: string;
  category_id: string;
  category_name?: string;
  color?: string;
  start_date: string;
  end_date: string;
  is_half_day: number;
  half_day_type?: 'first_half' | 'second_half' | null;
  days_count: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: string;
  action_reason?: string;
  action_timestamp?: number;
  created_at: number;
}

export interface RemoteRequest {
  id: string;
  user_id: string;
  employee_id?: string;
  employee_name?: string;
  team?: string;
  request_date: string;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approved_by?: string;
  action_reason?: string;
  action_timestamp?: number;
  created_at: number;
}

export interface AttendanceCorrection {
  id: string;
  user_id: string;
  employee_id?: string;
  employee_name?: string;
  team?: string;
  attendance_date: string;
  correction_type: 'in_time' | 'out_time' | 'both';
  original_in_time?: string;
  original_out_time?: string;
  requested_in_time?: string;
  requested_out_time?: string;
  explanation: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  action_timestamp?: number;
  created_at: number;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;
  end_date?: string | null;
  is_full_day: number;
  applicable_office: string;
  description?: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string;
  ip_address: string;
  timestamp: number;
}
