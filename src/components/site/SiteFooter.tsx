import { Link } from 'react-router';
import { Logo } from './Logo';
import { SERVICE_AREA_STATEMENT } from '../../../shared/service-area';

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-black">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:px-8">
        <div className="flex flex-col gap-5">
          <Logo />
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{SERVICE_AREA_STATEMENT}</p>
          <p className="eyebrow">Los Angeles only</p>
        </div>
        <nav aria-label="Footer" className="flex flex-col gap-3 text-sm">
          <p className="font-semibold text-foreground">Explore</p>
          <Link className="text-muted-foreground hover:text-foreground" to="/discover">Find Los Angeles photographers and videographers</Link>
          <Link className="text-muted-foreground hover:text-foreground" to="/match">Build your LA creative team</Link>
          <Link className="text-muted-foreground hover:text-foreground" to="/signup/creator">Find creative projects in Los Angeles</Link>
          <Link className="text-muted-foreground hover:text-foreground" to="/how-it-works">How it works</Link>
        </nav>
        <nav aria-label="Legal" className="flex flex-col gap-3 text-sm">
          <p className="font-semibold text-foreground">Trust and policies</p>
          <Link className="text-muted-foreground hover:text-foreground" to="/policies/refund-and-cancellation">Refund and cancellation policy</Link>
          <Link className="text-muted-foreground hover:text-foreground" to="/terms">Terms and Conditions</Link>
          <Link className="text-muted-foreground hover:text-foreground" to="/policies#reviews">Reviews and verification</Link>
          <Link className="text-muted-foreground hover:text-foreground" to="/policies#credits">Sample imagery credits</Link>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="mx-auto max-w-7xl px-5 py-5 text-xs text-muted-foreground md:px-8">
          Photo Shoot is a demonstration marketplace. Demonstration profiles, projects and reviews are labelled. Payments run in test mode unless live Stripe keys are configured.
        </p>
      </div>
    </footer>
  );
}
