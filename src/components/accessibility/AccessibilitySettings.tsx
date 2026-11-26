'use client';

import React, { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Accessibility, Contrast, Save, Type } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useUser } from '@/firebase/auth/use-user';
import { initializeFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useToast } from '@/hooks/use-toast';

interface AccessibilityPreferences {
  fontSize: number;
  highContrast: boolean;
  reducedMotion: boolean;
}

const DEFAULT_PREFERENCES: AccessibilityPreferences = {
  fontSize: 16,
  highContrast: false,
  reducedMotion: false,
};

function isAccessibilityPreferences(value: unknown): value is AccessibilityPreferences {
  if (!value || typeof value !== 'object') return false;
  const preferences = value as Record<string, unknown>;
  return Number.isInteger(preferences.fontSize)
    && (preferences.fontSize as number) >= 12
    && (preferences.fontSize as number) <= 24
    && typeof preferences.highContrast === 'boolean'
    && typeof preferences.reducedMotion === 'boolean';
}

export function AccessibilitySettings() {
  const { user } = useUser();
  const { data: profile } = useDoc(user ? `users/${user.uid}` : null);
  const { toast } = useToast();
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setLoaded(true);
      return;
    }
    if (!profile) return;
    const saved = (profile as Record<string, unknown>).accessibilityPreferences;
    setPreferences(isAccessibilityPreferences(saved) ? saved : DEFAULT_PREFERENCES);
    setLoaded(true);
  }, [profile, user]);

  useEffect(() => {
    if (!loaded) return;
    const root = document.documentElement;
    root.style.fontSize = `${preferences.fontSize}px`;
    root.classList.toggle('high-contrast', preferences.highContrast);
    root.classList.toggle('reduce-motion', preferences.reducedMotion);
  }, [preferences, loaded]);

  const save = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Sign in to sync accessibility preferences across devices.' });
      return;
    }
    const { firestore: db } = initializeFirebase();
    if (!db) {
      toast({ variant: 'destructive', title: 'Settings unavailable', description: 'Firebase is not initialized.' });
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { accessibilityPreferences: preferences });
      toast({ title: 'Accessibility saved', description: 'Your preferences will follow you across devices.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to save accessibility preferences',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-card/50 border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-headline font-bold flex items-center gap-2">
          <Accessibility className="w-5 h-5 text-primary" />
          Accessibility
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Preview changes immediately, then save them to sync with your account.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Type className="w-5 h-5 text-muted-foreground" />
              <div>
                <Label htmlFor="accessibility-font-size" className="text-sm font-medium">Interface text size</Label>
                <p className="text-xs text-muted-foreground">Adjust page text from 12 to 24 pixels.</p>
              </div>
            </div>
            <span className="text-sm font-bold tabular-nums">{preferences.fontSize}px</span>
          </div>
          <Slider
            id="accessibility-font-size"
            aria-label="Interface text size"
            value={[preferences.fontSize]}
            onValueChange={([fontSize]) => setPreferences((current) => ({ ...current, fontSize }))}
            min={12}
            max={24}
            step={1}
            disabled={!loaded || saving}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Smaller</span>
            <span>Larger</span>
          </div>
        </div>

        <Separator />

        <SettingToggle
          icon={<Contrast className="w-5 h-5 text-muted-foreground" />}
          label="High contrast"
          description="Increase text and border contrast throughout the app."
          checked={preferences.highContrast}
          onCheckedChange={(highContrast) => setPreferences((current) => ({ ...current, highContrast }))}
          disabled={!loaded || saving}
        />

        <Separator />

        <SettingToggle
          icon={<Accessibility className="w-5 h-5 text-muted-foreground" />}
          label="Reduce motion"
          description="Reduce non-essential animations and transitions."
          checked={preferences.reducedMotion}
          onCheckedChange={(reducedMotion) => setPreferences((current) => ({ ...current, reducedMotion }))}
          disabled={!loaded || saving}
        />

        <div className="flex justify-end">
          <Button onClick={() => void save()} disabled={saving || !loaded} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save accessibility settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingToggle({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
