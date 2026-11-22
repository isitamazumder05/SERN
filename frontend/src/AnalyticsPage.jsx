import { Activity, TrendingUp } from "lucide-react";
import HospitalCoordinationPage from "./components/HospitalCoordinationPage";
import "./AnalyticsPage.css";

function AnalyticsPage({ onSystemDataUpdated }) {
  return (
    <div className="analytics-page" style={{ padding: 0 }}>
      <HospitalCoordinationPage
        initialTab="analytics"
        onSystemDataUpdated={onSystemDataUpdated}
      />
    </div>
  );
}

export default AnalyticsPage;