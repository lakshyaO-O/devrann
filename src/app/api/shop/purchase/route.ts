import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    ({ uid } = await getAdminAuth().verifyIdToken(authorization.slice(7)));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  const limited = await enforceSharedRateLimit(uid, 'shop.purchase', { windowMs: 60_000, maxRequests: 10 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (typeof body?.itemId !== 'string' || body.itemId.length > 128) {
    return NextResponse.json({ error: 'Invalid shop item.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const itemRef = db.collection('shopItems').doc(body.itemId);
    const userRef = db.collection('users').doc(uid);
    const inventoryRef = userRef.collection('inventory').doc('default');
    const purchaseRef = userRef.collection('purchaseHistory').doc();
    const result = await db.runTransaction(async (tx) => {
      const [itemSnap, userSnap, inventorySnap] = await Promise.all([
        tx.get(itemRef),
        tx.get(userRef),
        tx.get(inventoryRef),
      ]);
      if (!itemSnap.exists || !userSnap.exists) return { error: 'Item or account not found.', status: 404 } as const;
      const item = itemSnap.data()!;
      const user = userSnap.data()!;
      const inventory = inventorySnap.data() || {};
      const items: string[] = Array.isArray(inventory.items) ? inventory.items : [];
      const price = item.price;
      if (item.available !== true || item.currency !== 'devcoins'
        || !Number.isSafeInteger(price) || price < 0
        || typeof item.name !== 'string' || typeof item.type !== 'string') {
        return { error: 'This shop item is unavailable.', status: 409 } as const;
      }
      if (user.banned === true) return { error: 'Account unavailable.', status: 403 } as const;
      if (items.includes(body.itemId)) return { error: 'Already owned.', status: 409 } as const;
      if ((Number(user.devcoins) || 0) < price) return { error: 'Insufficient DevCoins.', status: 409 } as const;

      tx.update(userRef, {
        devcoins: FieldValue.increment(-price),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(inventoryRef, {
        userId: uid,
        items: FieldValue.arrayUnion(body.itemId),
        equipped: inventory.equipped || {},
      }, { merge: true });
      tx.create(purchaseRef, {
        userId: uid,
        itemId: body.itemId,
        itemName: item.name,
        itemType: item.type,
        itemRarity: typeof item.rarity === 'string' ? item.rarity : 'common',
        price,
        purchasedAt: FieldValue.serverTimestamp(),
      });
      return { success: true } as const;
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Shop Purchase] Transaction failed.', error);
    return NextResponse.json({ error: 'Shop is temporarily unavailable.' }, { status: 503 });
  }
}
