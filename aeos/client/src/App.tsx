import { Switch, Route, Router, useLocation } from "wouter";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import CognitionPlane from "@/pages/CognitionPlane";
import ObservationPlane from "@/pages/ObservationPlane";
import PredictiveLedger from "@/pages/PredictiveLedger";
import CoverageManifest from "@/pages/CoverageManifest";
import Recommendations from "@/pages/Recommendations";
import LiveMonitor from "@/pages/LiveMonitor";
import AgentRoster from "@/pages/AgentRoster";
import FinancialImpact from "@/pages/FinancialImpact";
import FiveEquations from "@/pages/FiveEquations";
import Audit from "@/pages/Audit";
import BoardReport from "@/pages/BoardReport";
import ComingSoon from "@/pages/ComingSoon";
import RiskAnalysis from "@/pages/RiskAnalysis";
import UoPLibrary from "@/pages/UoPLibrary";
import DeployAgentCode from "@/pages/DeployAgentCode";
import Correlations from "@/pages/Correlations";
import Scenarios from "@/pages/Scenarios";
import Quality from "@/pages/Quality";
import BuildVsBuy from "@/pages/BuildVsBuy";
import AIMaturity from "@/pages/AIMaturity";
import Oversight from "@/pages/Oversight";
import Rules from "@/pages/Rules";
import Compliance from "@/pages/Compliance";
import AgentCompare from "@/pages/AgentCompare";
import Dependencies from "@/pages/Dependencies";
import ApiKeys from "@/pages/ApiKeys";
import ApiDocs from "@/pages/ApiDocs";
import { useEffect, useState } from "react";

// --- 1. NEW: Auth Hook ---
// This checks the backend on first load to see if the user's HttpOnly cookie is valid
function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}

function AppRouter() {

  // --- 2. NEW: Auth Guard Logic ---
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  // Show a blank screen or spinner while checking the cookie
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Loading workspace...</div>;
  }

  // If there is no user and they aren't on the login page, kick them to login
  if (!user && location !== "/login" && location !== "/register") {
    setLocation("/login");
    return null;
  }

  // If they ARE logged in but try to go to the login page, push them to the dashboard
  if (user && (location === "/login" || location === "/register")) {
    setLocation("/");
    return null;
  }
  
  return (
    <Switch>
      {/* AUTH ROUTES */}
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      {/* HOME */}
      <Route path="/" component={Dashboard} />
      <Route path="/monitor" component={LiveMonitor} />

      {/* MY AI AGENTS */}
      <Route path="/agents" component={AgentRoster} />
      <Route path="/agents/compare" component={AgentCompare} />
      <Route path="/agents/dependencies" component={Dependencies} />

      {/* INSIGHTS */}
      <Route path="/insights/financial" component={FinancialImpact} />
      <Route path="/insights/equations" component={FiveEquations} />
      <Route path="/insights/benchmarks">
        {() => <ComingSoon title="Benchmarks" kicker="Insights / Benchmarks"
          blurb="Cross-process benchmarks comparing every workflow's CUoW, MER, and CTR against industry baselines and your own historical sigma." />}
      </Route>
      <Route path="/insights/scenarios" component={Scenarios} />
      <Route path="/insights/models">
        {() => <ComingSoon title="Model Comparison" kicker="Insights / Models"
          blurb="Cost-vs-sigma trade-offs across registered models, recomputed every rollup window. Drives the vendor_swap recommendation template." />}
      </Route>
      <Route path="/insights/maturity" component={AIMaturity} />
      <Route path="/insights/build-vs-buy" component={BuildVsBuy} />

      {/* SIX SIGMA */}
      <Route path="/insights/correlations" component={Correlations} />

      {/* ECONOMIC COGNITION */}
      <Route path="/ecl/cognition" component={CognitionPlane} />
      <Route path="/ecl/observation" component={ObservationPlane} />
      <Route path="/ecl/ledger" component={PredictiveLedger} />
      <Route path="/ecl/coverage" component={CoverageManifest} />
      <Route path="/ecl/recommendations" component={Recommendations} />
      <Route path="/ecl/uop-library" component={UoPLibrary} />

      {/* GOVERNANCE */}
      <Route path="/governance/audit" component={Audit} />
      <Route path="/governance/risk" component={RiskAnalysis} />
      <Route path="/governance/deploy" component={DeployAgentCode} />
      <Route path="/governance/oversight" component={Oversight} />
      <Route path="/governance/api-keys" component={ApiKeys} />
      <Route path="/governance/api-docs" component={ApiDocs} />
      <Route path="/governance/compliance" component={Rules} />
      <Route path="/governance/certification" component={Compliance} />

      {/* QUALITY */}
      <Route path="/quality" component={Quality} />

      {/* PLANNING */}
      <Route path="/planning/board" component={BoardReport} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
