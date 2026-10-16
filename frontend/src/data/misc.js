import { fmtDate, daysAgo } from '../lib/format';

export const NOTIFICATIONS_SEED = {
  clinician: [
    { id: 'n1', icon: 'alert', tone: 'high', title: 'High severity interaction detected', body: 'Rajesh Kumar · Warfarin + Amiodarone', time: '2 hours ago', unread: true, kind: 'Alerts' },
    { id: 'n2', icon: 'check', tone: 'low', title: 'DDI analysis complete', body: 'Priya Nair · no interactions found', time: '4 hours ago', unread: true, kind: 'Analysis' },
    { id: 'n3', icon: 'file', tone: 'info', title: 'Weekly clinical summary is ready', body: '86 analyses completed this week', time: '1 day ago', unread: false, kind: 'Reports' },
    { id: 'n4', icon: 'user-check', tone: 'low', title: 'Pharmacist review completed', body: 'Michael Brown · approved with a monitoring note', time: '2 days ago', unread: false, kind: 'Reviews' },
    { id: 'n5', icon: 'info', tone: 'info', title: 'Welcome to MediGuard AI', body: 'Take a quick tour of the DDI Analysis workspace.', time: '3 days ago', unread: false, kind: 'System' },
  ],
  patient: [
    { id: 'p1', icon: 'alert', tone: 'high', title: 'Interaction alert on your medications', body: 'Metformin and Omeprazole — talk to your doctor before changing anything.', time: '2 days ago', unread: true, kind: 'Alerts' },
    { id: 'p2', icon: 'file', tone: 'info', title: 'New report available', body: 'Clinical summary is ready to download.', time: '2 days ago', unread: true, kind: 'Reports' },
    { id: 'p3', icon: 'clock', tone: 'moderate', title: 'Medication reminder', body: 'Metformin 500mg · 8:00 PM', time: 'Today', unread: false, kind: 'Reminders' },
  ],
  admin: [
    { id: 'a1', icon: 'shield', tone: 'high', title: '3 failed sign-ins for admin@mediguard.ai', body: 'Blocked after 3 attempts from one address.', time: '1 hour ago', unread: true, kind: 'Security' },
    { id: 'a2', icon: 'info', tone: 'moderate', title: 'Database replication lag', body: 'Lag exceeded 0.4 s for 10 minutes.', time: '5 hours ago', unread: true, kind: 'System' },
    { id: 'a3', icon: 'building', tone: 'low', title: 'New hospital onboarded', body: 'City General Hospital is now live on the platform.', time: '2 days ago', unread: false, kind: 'Hospitals' },
  ],
  administrator: [
    { id: 'h1', icon: 'user-check', tone: 'low', title: 'New pharmacist account approved', body: 'John Fernandes joined City General Hospital.', time: '2 days ago', unread: false, kind: 'Users' },
    { id: 'h2', icon: 'file', tone: 'info', title: 'Weekly hospital summary is ready', body: 'Staff activity and DDI analyses for your hospital are ready.', time: '1 day ago', unread: true, kind: 'Reports' },
  ],
};

export const USERS = [
  { id: 'U-101', name: 'Dr. Sarah Wilson', role: 'Doctor', email: 'sarah.wilson@mediguard.ai', status: 'Active', last: '5 min ago' },
  { id: 'U-102', name: 'John Fernandes', role: 'Pharmacist', email: 'john.f@mediguard.ai', status: 'Active', last: '1 hour ago' },
  { id: 'U-104', name: 'Anita Rao', role: 'Hospital Administrator', email: 'anita.rao@mediguard.ai', status: 'Active', last: '3 hours ago' },
  { id: 'U-105', name: 'Dr. Karan Mehta', role: 'Doctor', email: 'karan.mehta@mediguard.ai', status: 'Suspended', last: '6 days ago' },
  { id: 'U-106', name: 'Priya Nair', role: 'Patient', email: 'priya.nair@example.com', status: 'Active', last: '4 hours ago' },
  { id: 'U-107', name: 'Neha Kulkarni', role: 'Pharmacist', email: 'neha.k@mediguard.ai', status: 'Invited', last: 'Never' },
  { id: 'U-108', name: 'Dr. Imran Khan', role: 'Doctor', email: 'imran.khan@mediguard.ai', status: 'Active', last: 'Yesterday' },
];

export const AUDIT = [
  { time: 'Today, 10:42', user: 'Dr. Sarah Wilson', action: 'Analysis completed', resource: 'P-002', status: 'Success', org: 'City General Hospital' },
  { time: 'Today, 09:58', user: 'John Fernandes', action: 'Review approved', resource: 'P-003', status: 'Success', org: 'City General Hospital' },
  { time: 'Today, 09:20', user: 'Anita Rao', action: 'User role updated', resource: 'Karan Mehta', status: 'Success', org: 'City General Hospital' },
  { time: 'Yesterday, 18:03', user: 'Unknown', action: 'Failed login attempt', resource: 'admin@mediguard.ai', status: 'Blocked', org: null },
  { time: 'Yesterday, 14:11', user: 'Dr. Sarah Wilson', action: 'Patient record created', resource: 'P-008', status: 'Success', org: 'City General Hospital' },
  { time: 'Yesterday, 11:47', user: 'Dr. Imran Khan', action: 'Report exported (PDF)', resource: 'P-005', status: 'Success', org: 'City General Hospital' },
  { time: '2 days ago, 16:30', user: 'System', action: 'Backup completed', resource: 'Database', status: 'Success', org: null },
  { time: '2 days ago, 08:12', user: 'Neha Kulkarni', action: 'Invitation sent', resource: 'neha.k@mediguard.ai', status: 'Pending', org: 'City General Hospital' },
];

export const SECURITY_EVENTS = [
  { id: 'S-1', severity: 'High', title: 'Repeated failed sign-ins', detail: '3 failed attempts for admin@mediguard.ai from 103.21.x.x', time: '1 hour ago', state: 'Open', org: null },
  { id: 'S-2', severity: 'Moderate', title: 'Sign-in from a new device', detail: 'Dr. Imran Khan · Chrome on Windows · Nagpur', time: 'Yesterday', state: 'Reviewed', org: 'City General Hospital' },
  { id: 'S-3', severity: 'Moderate', title: 'Bulk export of patient records', detail: '48 records exported by Dr. Karan Mehta', time: '6 days ago', state: 'Open', org: 'City General Hospital' },
  { id: 'S-4', severity: 'Low', title: 'Password changed', detail: 'Neha Kulkarni updated her password', time: '1 week ago', state: 'Closed', org: 'City General Hospital' },
];

export const PERMISSIONS = ['View patients', 'Edit patients', 'Run DDI analysis', 'Review interactions', 'Export reports', 'Manage users', 'View audit trail', 'Change configuration'];
export const ROLE_MATRIX = {
  Doctor: [1, 1, 1, 0, 1, 0, 0, 0],
  Pharmacist: [1, 0, 1, 1, 1, 0, 0, 0],
  Patient: [0, 0, 0, 0, 1, 0, 0, 0],
  'Hospital Administrator': [1, 0, 0, 0, 1, 1, 1, 1],
  'Platform Admin': [1, 1, 1, 1, 1, 1, 1, 1],
};

export const CONFIG_DEFAULTS = {
  sessionMinutes: '30',
  mfa: true,
  passwordMinLength: '10',
  ipAllowlist: false,
  retentionDays: '365',
  autoLogout: true,
  severityThreshold: 'Moderate',
  requireReviewForHigh: true,
  showConfidence: true,
  auditExports: true,
};

export const REPORT_HISTORY = [
  { id: 'R-2041', name: 'Clinical summary — John Doe', type: 'Patient report', patientId: 'P-001', date: fmtDate(daysAgo(2)), size: '214 KB', by: 'Dr. Sarah Wilson' },
  { id: 'R-2040', name: 'DDI analysis — Emily Carter', type: 'Interaction report', patientId: 'P-002', date: fmtDate(daysAgo(3)), size: '188 KB', by: 'Dr. Sarah Wilson' },
  { id: 'R-2036', name: 'Weekly platform summary', type: 'System report', patientId: null, date: fmtDate(daysAgo(5)), size: '1.1 MB', by: 'System' },
  { id: 'R-2031', name: 'Pharmacist review log — Q3', type: 'Audit report', patientId: null, date: fmtDate(daysAgo(9)), size: '340 KB', by: 'John Fernandes' },
];

export const FAQS = [
  { q: 'How does MediGuard AI decide an interaction is high severity?', a: 'Each drug pair is looked up in the drug knowledge base (DrugBank-style DDI records and CDSCO brand-to-generic mapping). The severity is then adjusted with patient factors such as age, kidney function (eGFR), liver function (ALT) and the number of active medications. Every result lists the factors that changed the score.' },
  { q: 'Can I search by Indian brand names like Glycomet or Ecosprin?', a: 'Yes. Brand names are mapped to their generic salts before the analysis runs, so \u201cGlycomet\u201d is analysed as metformin.' },
  { q: 'Does MediGuard AI replace clinical judgment?', a: 'No. It is a clinical decision-support tool. Results should be reviewed by a qualified clinician or pharmacist before any change to treatment.' },
  { q: 'Who can see a patient\u2019s clinical profile?', a: 'Access is role-based. Doctors and pharmacists see the patients assigned to their organisation; patients see only their own record. Every view and export is written to the audit trail.' },
  { q: 'How do I export a report as PDF?', a: 'Open Reports & Export, pick a report, then choose Download PDF. You can also print the preview or copy a share link.' },
  { q: 'What happens after I submit a pharmacist review?', a: 'The review is attached to the patient\u2019s record, the requesting doctor is notified and the item leaves the review queue.' },
  { q: 'I forgot my password. What should I do?', a: 'Choose \u201cForgot password?\u201d on the sign-in page. We\u2019ll email you a reset link that expires after 30 minutes.' },
];
