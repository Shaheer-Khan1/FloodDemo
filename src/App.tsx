import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { ProtectedRoute } from "@/components/protected-route";
import { AppLayout } from "@/components/app-layout";
import ErrorBoundary from "@/components/error-boundary";
import Login from "@/pages/login";
import ProfileSetup from "@/pages/profile-setup";
import RoleSelection from "@/pages/role-selection";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import Teams from "@/pages/teams";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";
// FlowSet Pages
import Devices from "@/pages/devices";
import DeviceImport from "@/pages/device-import";
import BoxImport from "@/pages/box-import";
import OpenBoxes from "@/pages/open-boxes";
import NewInstallation from "@/pages/new-installation";
import MySubmissions from "@/pages/my-submissions";
import Verification from "@/pages/verification";
import InstallationVerification from "@/pages/installation-verification";
import CreateUser from "@/pages/create-user";
import MinistryDevices from "@/pages/ministry-devices";
import MinistryStats from "@/pages/ministry-stats";
import InstallationsMap from "@/pages/installations-map";
import ReviewAudit from "@/pages/review-audit";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/profile-setup" component={ProfileSetup} />
      <Route path="/role-selection" component={RoleSelection} />
      
      <Route path="/dashboard">
        <ProtectedRoute>
          <AppLayout>
            <Dashboard />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/profile">
        <ProtectedRoute>
          <AppLayout>
            <Profile />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/teams">
        <ProtectedRoute>
          <AppLayout>
            <Teams />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/admin">
        <ProtectedRoute>
          <AppLayout>
            <Admin />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/devices">
        <ProtectedRoute>
          <AppLayout>
            <Devices />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/device-import">
        <ProtectedRoute>
          <AppLayout>
            <DeviceImport />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/assign-box">
        <ProtectedRoute>
          <AppLayout>
            <BoxImport />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/open-boxes">
        <ProtectedRoute>
          <AppLayout>
            <OpenBoxes />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/new-installation">
        <ProtectedRoute>
          <AppLayout>
            <NewInstallation />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/installation-verification">
        <ProtectedRoute>
          <AppLayout>
            <InstallationVerification />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/my-submissions">
        <ProtectedRoute>
          <AppLayout>
            <MySubmissions />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/verification">
        <ProtectedRoute>
          <AppLayout>
            <Verification />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/create-user">
        <ProtectedRoute>
          <AppLayout>
            <CreateUser />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/ministry-devices">
        <ProtectedRoute>
          <AppLayout>
            <MinistryDevices />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/ministry-stats">
        <ProtectedRoute>
          <AppLayout>
            <MinistryStats />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/installations-map">
        <ProtectedRoute>
          <AppLayout>
            <InstallationsMap />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/review-audit">
        <ProtectedRoute>
          <AppLayout>
            <ReviewAudit />
          </AppLayout>
        </ProtectedRoute>
      </Route>

      <Route path="/">
        <Redirect to="/login" />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
