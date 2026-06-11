// Subtle full-screen loader matching the dark+lime aesthetic.
export default function Loader({ label = 'טוען נתונים…' }) {
  return (
    <div className="app-loader">
      <div className="app-loader-inner">
        <span className="loader-ring" />
        <span className="loader-label muted">{label}</span>
      </div>
    </div>
  );
}
