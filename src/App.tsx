import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router';
import { DemoBar, SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { useApp } from '@/lib/app-context';
import { MessagingProvider } from '@/lib/messaging/context';
import { Home } from '@/pages/Home';

import { LoadingBlock } from '@/components/site/ui-bits';

// Heavier routes load on demand. The homepage stays eager so the first view renders immediately.
const Discover = lazy(() => import('@/pages/Discover').then((m) => ({ default: m.Discover })));
const Match = lazy(() => import('@/pages/Match').then((m) => ({ default: m.Match })));
const PostProject = lazy(() => import('@/pages/PostProject').then((m) => ({ default: m.PostProject })));
const CreatorProfile = lazy(() => import('@/pages/CreatorProfile').then((m) => ({ default: m.CreatorProfile })));
const CustomerProfile = lazy(() => import('@/pages/CustomerProfile').then((m) => ({ default: m.CustomerProfile })));
const Opportunities = lazy(() => import('@/pages/Opportunities').then((m) => ({ default: m.Opportunities })));
const DemonstrationProject = lazy(() => import('@/pages/DemonstrationProject').then((m) => ({ default: m.DemonstrationProject })));
const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const ProfileEditor = lazy(() => import('@/pages/ProfileEditor').then((m) => ({ default: m.ProfileEditor })));
const Settings = lazy(() => import('@/pages/Settings').then((m) => ({ default: m.Settings })));
const ProjectWorkspace = lazy(() => import('@/pages/ProjectWorkspace').then((m) => ({ default: m.ProjectWorkspace })));
const Checkout = lazy(() => import('@/pages/Checkout').then((m) => ({ default: m.Checkout })));
const Messages = lazy(() => import('@/pages/Messages').then((m) => ({ default: m.Messages })));
const SignupChooser = lazy(() => import('@/pages/Signup').then((m) => ({ default: m.SignupChooser })));
const SignupCustomer = lazy(() => import('@/pages/Signup').then((m) => ({ default: m.SignupCustomer })));
const SignupCreator = lazy(() => import('@/pages/Signup').then((m) => ({ default: m.SignupCreator })));
const HowItWorks = lazy(() => import('@/pages/Content').then((m) => ({ default: m.HowItWorks })));
const Policies = lazy(() => import('@/pages/Content').then((m) => ({ default: m.Policies })));
const NotFound = lazy(() => import('@/pages/Content').then((m) => ({ default: m.NotFound })));
const RefundPolicyPage = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.RefundPolicyPage })));
const TermsPage = lazy(() => import('@/pages/Legal').then((m) => ({ default: m.TermsPage })));
const StaffRefunds = lazy(() => import('@/pages/StaffRefunds').then((m) => ({ default: m.StaffRefunds })));

function Layout() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <DemoBar />
      <SiteHeader />
      <main id="main" className="flex flex-1 flex-col">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

/** Blocks signed-out visitors and sends them to log in, returning them afterwards. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { user, ready } = useApp();
  const location = useLocation();
  if (!ready) return <LoadingBlock label="Checking your session" />;
  if (!user) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <MessagingProvider>
    <Suspense fallback={<LoadingBlock label="Loading page" />}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="discover" element={<Discover />} />
        <Route path="match" element={<Match />} />
        <Route path="projects/new" element={<RequireAuth><PostProject /></RequireAuth>} />
        <Route path="creators/:id" element={<CreatorProfile />} />
        <Route path="customers/:id" element={<CustomerProfile />} />
        <Route path="opportunities" element={<Opportunities />} />
        <Route path="opportunities/demo/:slug" element={<DemonstrationProject />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<SignupChooser />} />
        <Route path="signup/customer" element={<SignupCustomer />} />
        <Route path="signup/creator" element={<SignupCreator />} />
        <Route path="dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="account/profile" element={<RequireAuth><ProfileEditor /></RequireAuth>} />
        <Route path="account/settings" element={<RequireAuth><Settings /></RequireAuth>} />
        <Route path="projects/:id" element={<RequireAuth><ProjectWorkspace /></RequireAuth>} />
        <Route path="projects/:id/checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
        <Route path="messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="messages/new/:userId" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="messages/:conversationId" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="how-it-works" element={<HowItWorks />} />
        <Route path="policies" element={<Policies />} />
        <Route path="policies/refund-and-cancellation" element={<RefundPolicyPage />} />
        <Route path="terms" element={<TermsPage />} />
        <Route path="staff/refunds" element={<RequireAuth><StaffRefunds /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </Suspense>
    </MessagingProvider>
  );
}
