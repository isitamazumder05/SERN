import { Activity, FileText } from "lucide-react";
import HospitalCoordinationPage from "./components/HospitalCoordinationPage";

function ReportsPage({ onSystemDataUpdated }) {
  return (
    <div className="reports-page" style={{ padding: 0 }}>
      <HospitalCoordinationPage
        initialTab="notifications"
        onSystemDataUpdated={onSystemDataUpdated}
      />
    </div>
  );
}

export default ReportsPage;