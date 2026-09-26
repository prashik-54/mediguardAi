import { TriangleAlert } from 'lucide-react';

const SEV = { High: 'badge-high', Moderate: 'badge-moderate', Medium: 'badge-moderate', Low: 'badge-low', None: 'badge-neutral' };

export function SeverityBadge({ level, noDot, suffix = '' }) {
  return <span className={`badge ${SEV[level] || 'badge-neutral'} ${noDot ? 'no-dot' : ''}`}>{level}{suffix}</span>;
}

export function RiskBadge({ level }) {
  return <SeverityBadge level={level} />;
}

const STATUS = { Active: 'badge-low', Inactive: 'badge-neutral', Watchlist: 'badge-moderate', Success: 'badge-low', Blocked: 'badge-high', Pending: 'badge-moderate', Suspended: 'badge-high', Invited: 'badge-info', 'Portal Access': 'badge-low', Open: 'badge-high', Reviewed: 'badge-info', Closed: 'badge-neutral', Operational: 'badge-low', Degraded: 'badge-moderate', 'Not deployed': 'badge-neutral', Approved: 'badge-low', Escalated: 'badge-high', Scheduled: 'badge-info', 'Checked In': 'badge-info', 'In Consultation': 'badge-moderate', Completed: 'badge-low', Cancelled: 'badge-neutral', 'No Show': 'badge-high', 'In Progress': 'badge-moderate', Draft: 'badge-info', 'Under DDI Review': 'badge-moderate', 'Awaiting Doctor Decision': 'badge-high', 'Doctor Decision Recorded': 'badge-moderate', Finalized: 'badge-low', Sent: 'badge-info', Accepted: 'badge-moderate', Dispensed: 'badge-low', 'Partially Dispensed': 'badge-moderate', 'Unable to Dispense': 'badge-high', Unavailable: 'badge-high', Released: 'badge-low', 'Not released': 'badge-neutral', Received: 'badge-info', Unknown: 'badge-neutral' };
export function StatusBadge({ status }) {
  return <span className={`badge ${STATUS[status] || 'badge-neutral'}`}>{status}</span>;
}

export function HighFlag() {
  return <TriangleAlert size={14} color="var(--high)" aria-label="High severity" />;
}
