export type UserRole = 'super_admin' | 'admin' | 'teacher' | 'student'
export type EventStatus = 'scheduled' | 'open' | 'in_progress' | 'completed' | 'cancelled'
export type MeasurementType = 'time' | 'distance' | 'height' | 'points' | 'position'

export interface Profile {
  id: string
  email: string | null
  first_name: string
  last_name: string
  role: UserRole
  year_level: number | null
  house_id: number | null
  school_id: number | null
  active: boolean
}
