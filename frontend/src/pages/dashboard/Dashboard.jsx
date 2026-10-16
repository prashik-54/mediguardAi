import { useAuth } from '../../context/AuthContext';
import DoctorDashboard from './DoctorDashboard';
import PharmacistDashboard from './PharmacistDashboard';
import PatientDashboard from './PatientDashboard';
import AdminDashboard from './AdminDashboard';
import HospitalAdminDashboard from './HospitalAdminDashboard';

export default function Dashboard() {
  const { user } = useAuth();
  const Page = { doctor: DoctorDashboard, pharmacist: PharmacistDashboard, patient: PatientDashboard, administrator: HospitalAdminDashboard, admin: AdminDashboard }[user.role];
  return <Page />;
}
