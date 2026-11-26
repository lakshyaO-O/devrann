'use client';

import { useState, useCallback } from 'react';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { SubscriptionTier } from '@/app/lib/types';

const SUBSCRIPTION_BENEFITS: Record<SubscriptionTier, string[]> = {
  free: ['Basic editor', 'Practice problems', 'Leaderboard'],
  pro: ['Monaco editor', 'Analytics dashboard', 'AI code review (50/mo)', 'Custom themes', 'Priority support'],
  elite: ['Everything in Pro', 'Unlimited AI review', 'Spectator mode', 'Early access features', 'Premium badge', 'Recruiter profile'],
};

export function useMonetization(userId: string | null) {
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [aiCredits, setAiCredits] = useState(0);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(true);

  const loadSubscription = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    try {
      const { firestore: db } = initializeFirebase();
      if (!db) { setLoading(false); return; }
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setTier(data.subscriptionTier || 'free');
        setAiCredits(data.aiCredits || 0);
        setReferralCode(data.referralCode || '');
      }
    } catch (e) { console.warn('[useMonetization] Failed to load subscription:', e); }
    setLoading(false);
  }, [userId]);

  const useAiCredit = useCallback(async () => {
    if (!userId || aiCredits <= 0) return false;
    try {
      const { firestore: db } = initializeFirebase();
      if (!db) return false;
      await updateDoc(doc(db, 'users', userId), { aiCredits: increment(-1) });
      setAiCredits(prev => prev - 1);
      return true;
    } catch { return false; }
  }, [userId, aiCredits]);

  const generateReferralCode = useCallback(async () => {
    if (!userId) return '';
    try {
      const { auth } = initializeFirebase();
      if (!auth?.currentUser || auth.currentUser.uid !== userId) return '';
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/referrals/code', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.code !== 'string') return '';
      setReferralCode(result.code);
      return result.code;
    } catch { return ''; }
  }, [userId]);

  const applyReferral = useCallback(async (code: string) => {
    try {
      const { auth } = initializeFirebase();
      if (!auth?.currentUser || auth.currentUser.uid !== userId) return false;
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/referrals/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const result = await response.json().catch(() => ({}));
      return response.ok && result.success === true;
    } catch { return false; }
  }, [userId]);

  const getBenefits = useCallback((t: SubscriptionTier) => SUBSCRIPTION_BENEFITS[t], []);

  return {
    tier, aiCredits, referralCode, loading, loadSubscription,
    useAiCredit, generateReferralCode, applyReferral, getBenefits,
    SUBSCRIPTION_BENEFITS,
  };
}

export { SUBSCRIPTION_BENEFITS };
