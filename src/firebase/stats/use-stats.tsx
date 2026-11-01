'use client';

import { useEffect, useState } from 'react';

export interface GlobalStats {
  totalPlayers: number;
  totalBattles: number;
  avgExecutionTime: number;
  activeBattles: number;
}

export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats>({
    totalPlayers: 0,
    totalBattles: 0,
    avgExecutionTime: 0,
    activeBattles: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/public/stats', { cache: 'no-store' });
        if (!response.ok) throw new Error('Unable to load public statistics.');
        const data = await response.json() as GlobalStats;
        if (active) setStats(data);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchStats();
    return () => { active = false; };
  }, []);

  return { stats, loading };
}
