'use client';

import { initializeFirebase } from '@/firebase';
import {
  collection, doc, getDoc, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type {
  ShopItem, UserInventory, PurchaseRecord, DevCoinEarning, DevCoinSource, EarningLimit, ShopItemType,
} from '@/types';

const SHOP_COLLECTION = 'shopItems';
const INVENTORY_DOC = 'default';

async function postShopAction(path: string, body: Record<string, unknown>) {
  const user = initializeFirebase().auth?.currentUser;
  if (!user) throw new Error('Sign in to use the shop.');
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Shop action failed.');
  return data;
}

// ---- Shop Items ----

export async function getShopItems(category?: ShopItemType): Promise<ShopItem[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];

  const constraints: any[] = [where('available', '==', true), orderBy('sortOrder', 'asc'), orderBy('price', 'asc')];
  if (category) constraints.unshift(where('type', '==', category));

  const q = query(collection(db, SHOP_COLLECTION), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as ShopItem));
}

export async function getShopItemById(itemId: string): Promise<ShopItem | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, SHOP_COLLECTION, itemId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as ShopItem) : null;
}

export async function getFeaturedItems(): Promise<ShopItem[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const q = query(
    collection(db, SHOP_COLLECTION),
    where('available', '==', true),
    where('featured', '==', true),
    orderBy('sortOrder', 'asc'),
    limit(6),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as ShopItem));
}

// ---- DevCoin Balance ----

export async function getDevCoinBalance(userId: string): Promise<number> {
  const { firestore: db } = initializeFirebase();
  if (!db) return 0;
  const snap = await getDoc(doc(db, 'users', userId));
  return snap.exists() ? (snap.data().devcoins || 0) : 0;
}

// ---- Purchase ----

export async function purchaseItem(userId: string, itemId: string): Promise<{ success: boolean; error?: string }> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) return { success: false, error: 'Invalid shop user.' };
  try {
    await postShopAction('/api/shop/purchase', { itemId });
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Purchase failed.' };
  }
}

// ---- Inventory ----

export async function getInventory(userId: string): Promise<UserInventory | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', userId, 'inventory', INVENTORY_DOC));
  return snap.exists() ? ({ userId, ...snap.data() } as UserInventory) : null;
}

export async function getOwnedItems(userId: string): Promise<ShopItem[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const inv = await getInventory(userId);
  if (!inv || !inv.items.length) return [];

  const items: ShopItem[] = [];
  for (const itemId of inv.items) {
    const item = await getShopItemById(itemId);
    if (item) items.push(item);
  }
  return items;
}

export async function equipItem(userId: string, itemId: string): Promise<boolean> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) return false;
  try {
    const item = await getShopItemById(itemId);
    if (!item) return false;
    await postShopAction('/api/shop/inventory', { action: 'equip', itemId, type: item.type });
    return true;
  } catch (error) {
    console.error('[Shop] Unable to equip item.', error);
    return false;
  }
}

export async function unequipItem(userId: string, itemType: ShopItemType): Promise<boolean> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) return false;
  try {
    await postShopAction('/api/shop/inventory', { action: 'unequip', type: itemType });
    return true;
  } catch (error) {
    console.error('[Shop] Unable to unequip item.', error);
    return false;
  }
}

export async function isItemOwned(userId: string, itemId: string): Promise<boolean> {
  const inv = await getInventory(userId);
  if (!inv) return false;
  return (inv.items || []).includes(itemId);
}

// ---- Purchase History ----

export async function getPurchaseHistory(userId: string, max: number = 50): Promise<PurchaseRecord[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const q = query(
    collection(db, 'users', userId, 'purchaseHistory'),
    orderBy('purchasedAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as PurchaseRecord));
}

// ---- DevCoin Earning ----

export async function recordEarning(
  userId: string,
  source: DevCoinSource,
  description: string,
  metadata?: Record<string, any>,
): Promise<{ success: boolean; amount: number; error?: string }> {
  void source;
  void description;
  void metadata;
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) return { success: false, amount: 0, error: 'Invalid shop user.' };
  return {
    success: false,
    amount: 0,
    error: 'DevCoin rewards are available only from verified server-side platform events.',
  };
}

export async function getRecentEarnings(userId: string, max: number = 20): Promise<DevCoinEarning[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const q = query(
    collection(db, 'users', userId, 'earnings'),
    orderBy('earnedAt', 'desc'),
    limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as DevCoinEarning));
}

export async function getTotalDevCoinsEarned(userId: string): Promise<number> {
  const { firestore: db } = initializeFirebase();
  if (!db) return 0;
  const snap = await getDocs(collection(db, 'users', userId, 'earnings'));
  let total = 0;
  snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => { total += (d.data() as DevCoinEarning).amount; });
  return total;
}
