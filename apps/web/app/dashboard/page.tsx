'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { AppShell } from '../../components/app/AppShell.js';
import { WelcomeBanner } from '../../components/dashboard/WelcomeBanner.js';
import { ActivityChart } from '../../components/dashboard/ActivityChart.js';
import { AIAnalysisPanel } from '../../components/dashboard/AIAnalysisPanel.js';
import { RecentProjects } from '../../components/dashboard/RecentProjects.js';
import { Card } from '../../components/ui/card.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { isActiveStatus } from '../../components/dashboard/pipeline.js';
import { type ProjectItem } from '../../components/dashboard/data.js';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser.js';

function nameFromEmail(email: string | null): string {
  if (!email) return 'creator';
  const handle = email.split('@')[0]!;
  return handle.charAt(0).toUpperCase() + handle.slice(1);
}

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.status === 401) {
          router.push('/login?next=/dashboard');
          return;
        }
        if (!res.ok) {
          setError('Could not load your projects.');
          return;
        }
        const data = await res.json();
        setProjects(data.projects ?? []);
      } catch {
        setError('Network error while loading the dashboard.');
      } finally {
        setLoading(false);
      }
    })();

    void createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => {});
  }, [router]);

  const activeProject = projects.find((p) => isActiveStatus(p.status) && p.status !== 'COMPLETED');
  const activeCount = projects.filter((p) => isActiveStatus(p.status)).length;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <WelcomeBanner name={nameFromEmail(email)} activeCount={activeCount} />

        {error && (
          <Card className="flex items-center gap-3 border-error/30 bg-error/5 p-4 text-sm text-error">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </Card>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left: recent projects */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            {loading ? <Skeleton className="h-64 rounded-card" /> : <RecentProjects projects={projects} />}
          </div>

          {/* Right: live AI analysis when processing, otherwise recent activity chart */}
          <div className="flex flex-col gap-6">
            {loading ? (
              <Skeleton className="h-80 rounded-card" />
            ) : activeProject ? (
              <AIAnalysisPanel project={activeProject} />
            ) : (
              <ActivityChart projects={projects} />
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
