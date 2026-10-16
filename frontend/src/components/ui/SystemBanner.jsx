import { useSystemStatus } from '../../context/SystemStatusContext';
import { usePatients } from '../../context/PatientsContext';
import { useReviews } from '../../context/ReviewsContext';
import { useNotifications } from '../../context/NotificationsContext';

/** Status strip: only shows real problems (server unreachable, a data load that failed, or storage that will
 *  not survive a restart). Real backend state is authoritative: when something fails to load, say so instead of
 *  quietly showing stale data. */
export default function SystemBanner() {
  const { online, info, refresh } = useSystemStatus();
  const patients = usePatients();
  const reviews = useReviews();
  const notes = useNotifications();

  const errors = [
    patients?.loadError && ['patient records', patients.loadError, patients.refresh],
    reviews?.error && ['the review queue', reviews.error, reviews.refresh],
    notes?.error && ['notifications', notes.error, notes.refresh],
  ].filter(Boolean);

  const volatileStorage = info.database === 'in-memory';

  if (online !== false && !errors.length && !volatileStorage) return null;
  return (
    <div role="status" aria-live="polite">
      {online === false && (
        <div className="sys-banner danger"><span><b>Server unreachable.</b> Records, queues and notifications shown may be missing or out of date, and changes will not be saved.</span>
          <button className="btn btn-outline btn-sm" onClick={refresh}>Retry</button></div>
      )}
      {errors.map(([what, msg, retry]) => (
        <div key={what} className="sys-banner danger"><span><b>Could not load {what}.</b> {msg}</span>
          <button className="btn btn-outline btn-sm" onClick={retry}>Retry</button></div>
      ))}
      {volatileStorage && <div className="sys-banner warn"><span><b>Database not connected.</b> The server is using temporary storage, so everything is lost when it restarts. Check MONGODB_URI.</span></div>}
    </div>
  );
}
