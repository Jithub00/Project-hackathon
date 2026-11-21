import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { LayoutDashboard, LogOut, Menu, Settings, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Logo } from './Logo';
import { useApp } from '@/lib/app-context';
import { useMessagingSelector } from '@/lib/messaging/hooks';
import { cn } from '@/lib/utils';
import type { SessionUser } from '../../../shared/types';

interface NavItem {
  to: string;
  label: string;
  show?: (user: SessionUser | null) => boolean;
  /** Shows the unread count. Only signed-in viewers see this item at all. */
  badge?: boolean;
}

const NAV: NavItem[] = [
  { to: '/discover', label: 'Find creators' },
  { to: '/match', label: 'Match my team' },
  { to: '/opportunities', label: 'Find LA projects', show: (u) => u?.role === 'creator' },
  { to: '/messages', label: 'Messages', show: (u) => Boolean(u), badge: true },
  { to: '/how-it-works', label: 'How it works' },
];

function MessagesNavLabel() {
  const unread = useMessagingSelector((state) => state.unreadTotal);
  return (
    <span className="inline-flex items-center gap-2">
      Messages
      {unread > 0 ? (
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-white tabular-nums"
          data-testid="messages-unread"
        >
          <span aria-hidden>{unread > 99 ? '99+' : unread}</span>
          <span className="sr-only">{unread} unread messages</span>
        </span>
      ) : null}
    </span>
  );
}

function linkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'relative text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground',
    'after:absolute after:-bottom-2 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300',
    isActive && 'text-foreground after:scale-x-100',
  );
}

export function DemoBar() {
  return (
    <div className="border-b border-border bg-black">
      <p className="mx-auto flex max-w-7xl items-center gap-2 px-5 py-1.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground md:px-8">
        <span aria-hidden className="inline-block size-1.5 rounded-full bg-primary" />
        Demonstration environment · payments simulated · profiles labelled
      </p>
    </div>
  );
}

export function SiteHeader() {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((item) => !item.show || item.show(user));

  const handleLogout = async () => {
    // Leave the protected page first, so the sign-out does not bounce through the login redirect.
    setOpen(false);
    navigate('/');
    await logout();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-5 md:px-8">
        <Logo />

        <nav aria-label="Main" className="hidden items-center gap-7 lg:flex">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.badge ? <MessagesNavLabel /> : item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Link to="/dashboard">
                  <LayoutDashboard aria-hidden /> Dashboard
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={`Account menu for ${user.name}`} className="rounded-full">
                    <span className="text-xs font-bold tracking-wide">{user.initials}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="font-normal">
                    <span className="block text-sm font-semibold text-foreground">{user.name}</span>
                    <span className="block text-xs text-muted-foreground">{user.role === 'creator' ? 'Creator account' : 'Customer account'}</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate(user.role === 'creator' ? '/dashboard' : '/dashboard')}>
                    <LayoutDashboard /> Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate('/account/profile')}>
                    <UserRound /> Profile and portfolio
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate('/account/settings')}>
                    <Settings /> Account settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={handleLogout} variant="destructive">
                    <LogOut /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Sign up</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="lg:hidden" aria-label="Open menu" data-testid="mobile-menu-trigger">
              <Menu aria-hidden />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="flex w-[min(92vw,380px)] flex-col gap-0 bg-background p-0" data-testid="mobile-menu">
            <SheetHeader className="border-b border-border p-5">
              <SheetTitle className="sr-only">Site menu</SheetTitle>
              <SheetDescription className="sr-only">Navigate Photo Shoot</SheetDescription>
              <Logo className="h-8" />
            </SheetHeader>
            <nav aria-label="Mobile" className="flex flex-col p-3">
              {items.map((item) => (
                <SheetClose asChild key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-12 items-center border-b border-border px-3 text-base font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground',
                        isActive && 'text-foreground',
                      )
                    }
                  >
                    {item.badge ? <MessagesNavLabel /> : item.label}
                  </NavLink>
                </SheetClose>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-3 border-t border-border p-5">
              {user ? (
                <>
                  <p className="text-sm text-muted-foreground">Signed in as <span className="text-foreground">{user.name}</span></p>
                  <SheetClose asChild>
                    <Button asChild variant="outline" size="lg">
                      <Link to="/dashboard">Dashboard</Link>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button asChild variant="outline" size="lg">
                      <Link to="/account/profile">Profile and portfolio</Link>
                    </Button>
                  </SheetClose>
                  <Button variant="ghost" size="lg" onClick={handleLogout}>
                    <LogOut aria-hidden /> Log out
                  </Button>
                </>
              ) : (
                <>
                  <SheetClose asChild>
                    <Button asChild size="lg">
                      <Link to="/signup">Sign up</Link>
                    </Button>
                  </SheetClose>
                  <SheetClose asChild>
                    <Button asChild variant="outline" size="lg">
                      <Link to="/login">Log in</Link>
                    </Button>
                  </SheetClose>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
