import { BannerArt } from '../art/Spots';
import '../../styles/dashboard.css';

/** Welcome banner used at the top of every dashboard. */
export default function Banner({ title, subtitle, children }) {
  return (
    <section className="banner">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {children && <div className="banner-actions">{children}</div>}
      </div>
      <BannerArt />
    </section>
  );
}
