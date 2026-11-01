'use client';

import { useEffect, useState } from 'react';
import { HeroSection } from './HeroSection';
import { FeaturesSection } from './FeaturesSection';
import { LandingFooter } from './Footer';
import type { PublicOverview } from './public-overview';

export function LandingPage() {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/public/overview', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : 'Live platform data is temporarily unavailable.');
        }
        setOverview(data as PublicOverview);
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : 'Live platform data is temporarily unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadOverview();
    return () => controller.abort();
  }, [requestNumber]);

  const retry = () => setRequestNumber((current) => current + 1);

  return (
    <div className="relative min-h-screen bg-background selection:bg-primary/30 selection:text-primary overflow-x-hidden">
      <HeroSection problem={overview?.problems[0] ?? null} loading={loading} error={error} onRetry={retry} />
      <FeaturesSection overview={overview} loading={loading} error={error} onRetry={retry} />
      <LandingFooter />
    </div>
  );
}
