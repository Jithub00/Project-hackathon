import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState, LoadingBlock } from '@/components/site/ui-bits';
import { useApp } from '@/lib/app-context';
import { Match } from './Match';

/**
 * Post a creative project: the brief form, where a client describes the work, the creative roles, the budget, the
 * location and the dates. Only customer accounts can save a project, so creators are pointed to the project board.
 * The route sits behind sign-in, which returns the visitor here once they have signed in.
 */
export function PostProject() {
  const { user, ready } = useApp();
  if (!ready) return <LoadingBlock label="Checking your session" />;
  if (user && user.role !== 'customer') {
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-20 md:px-8">
        <EmptyState
          title="Projects are posted from customer accounts"
          body="Creators join the projects that clients post. Browse the open briefs on the project board and express interest in the ones that fit your work."
          action={<Button asChild><Link to="/opportunities">Join a creative project</Link></Button>}
        />
      </div>
    );
  }
  return <Match mode="post" />;
}
