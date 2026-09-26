import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider } from './context/AuthContext';
import { SystemStatusProvider } from './context/SystemStatusContext';
import { PatientsProvider } from './context/PatientsContext';
import { ReviewsProvider } from './context/ReviewsContext';
import { NotificationsProvider } from './context/NotificationsContext';
import PublicLayout from './components/layout/PublicLayout';
import { RequireAuth, RoleGate } from './components/layout/AppLayout';

import Home from './pages/public/Home';
import { Privacy, Terms } from './pages/public/Legal';
import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import Dashboard from './pages/dashboard/Dashboard';
import PatientDashboard from './pages/dashboard/PatientDashboard';
import PatientList from './pages/patients/PatientList';
import PatientProfile from './pages/patients/PatientProfile';
import PatientIntake from './pages/intake/PatientIntake';
import RegisterPatient from './pages/intake/RegisterPatient';
import DoctorQueue from './pages/consult/DoctorQueue';
import Consultation from './pages/consult/Consultation';
import ConsultationHistory from './pages/consult/ConsultationHistory';
import Prescription from './pages/consult/Prescription';
import DDIWorkspace from './pages/ddi/DDIWorkspace';
import PharmacistReview from './pages/review/PharmacistReview';
import AdminSecurity from './pages/admin/AdminSecurity';
import Reports from './pages/reports/Reports';
import Pharmacy from './pages/pharmacy/Pharmacy';
import Settings from './pages/settings/Settings';
import { NotificationsPage, HelpPage } from './pages/support/NotificationsHelp';
import NotFound from './pages/NotFound';

const clinician = ['doctor', 'pharmacist'];
const gate = (roles, el) => <RoleGate roles={roles}>{el}</RoleGate>;

export default function App() {
  return (
    <ToastProvider>
      <SystemStatusProvider>
      <AuthProvider>
        <PatientsProvider>
          <ReviewsProvider>
            <NotificationsProvider>
              <HashRouter>
                <Routes>
                  <Route element={<PublicLayout />}>
                    <Route index element={<Home />} />
                    <Route path="privacy" element={<Privacy />} />
                    <Route path="terms" element={<Terms />} />
                  </Route>
                  <Route path="login" element={<Login />} />
                  <Route path="signup" element={<Navigate to="/login" replace />} />
                  <Route path="forgot-password" element={<ForgotPassword />} />
                  <Route path="verify" element={<Navigate to="/login" replace />} />

                  <Route path="app" element={<RequireAuth />}>
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="patients" element={gate([...clinician, 'administrator'], <PatientList />)} />
                    <Route path="patients/:id" element={gate([...clinician, 'administrator'], <PatientProfile />)} />
                    <Route path="intake" element={gate(['administrator'], <PatientIntake />)} />
                    <Route path="intake/register" element={gate(['administrator'], <RegisterPatient />)} />
                    <Route path="queue" element={gate(['doctor'], <DoctorQueue />)} />
                    <Route path="consult/:appointmentId" element={gate(['doctor'], <Consultation />)} />
                    <Route path="consult/:appointmentId/prescription" element={gate(['doctor'], <Prescription />)} />
                    <Route path="consult/history/:encounterId" element={gate(['doctor'], <ConsultationHistory />)} />
                    <Route path="ddi" element={gate(['doctor'], <DDIWorkspace />)} />
                    <Route path="review" element={gate(['pharmacist'], <PharmacistReview />)} />
                    <Route path="medications" element={gate(['patient'], <PatientDashboard initialTab="medications" />)} />
                    <Route path="appointments" element={gate(['patient'], <PatientDashboard initialTab="appointments" />)} />
                    <Route path="pharmacy" element={gate(['administrator', 'pharmacist'], <Pharmacy />)} />
                    <Route path="reports" element={gate(['administrator', 'doctor', 'patient'], <Reports />)} />
                    <Route path="admin/:tab" element={gate(['admin', 'administrator'], <AdminSecurity />)} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="notifications" element={<NotificationsPage />} />
                    <Route path="help" element={<HelpPage />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </HashRouter>
            </NotificationsProvider>
          </ReviewsProvider>
        </PatientsProvider>
      </AuthProvider>
      </SystemStatusProvider>
    </ToastProvider>
  );
}
