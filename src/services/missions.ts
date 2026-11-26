'use client';

import { initializeFirebase } from '@/firebase';
import type { DailyMission } from '@/types';

async function getToken(userId: string): Promise<string> {
  const { auth } = initializeFirebase();
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in to access daily missions.');
  }
  return auth.currentUser.getIdToken();
}

export async function getDailyMissions(userId: string): Promise<DailyMission[]> {
  const token = await getToken(userId);
  const response = await fetch('/api/missions/daily', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Daily missions are unavailable.');
  }
  if (!Array.isArray(data.missions)) throw new Error('Daily missions returned an invalid response.');
  return data.missions as DailyMission[];
}

export async function updateMissionProgress(_userId: string, _missionId: string, _progress: number): Promise<void> {
  throw new Error('Mission progress is derived from verified server activity.');
}

export async function claimMissionReward(userId: string, missionId: string): Promise<boolean> {
  const token = await getToken(userId);
  const response = await fetch('/api/missions/daily', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ missionId }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409 || response.status === 404) return false;
  if (!response.ok || data.success !== true) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Mission reward could not be claimed.');
  }
  return true;
}

export async function generateDailyMissions(userId: string): Promise<DailyMission[]> {
  return getDailyMissions(userId);
}
