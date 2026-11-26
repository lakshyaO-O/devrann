import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

const ITEM_TYPES = [
  'avatar_frame', 'profile_theme', 'name_color', 'badge', 'title', 'code_ace_skin',
  'loading_theme', 'chat_emoji', 'arena_effect', 'profile_background', 'seasonal_collectible',
] as const;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let uid: string;
  try {
    ({ uid } = await getAdminAuth().verifyIdToken(authorization.slice(7)));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  const limited = await enforceSharedRateLimit(uid, 'shop.inventory', { windowMs: 60_000, maxRequests: 30 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!body || !['equip', 'unequip'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid inventory action.' }, { status: 400 });
  }
  const type = body.type;
  if (typeof type !== 'string' || !ITEM_TYPES.includes(type as typeof ITEM_TYPES[number])) {
    return NextResponse.json({ error: 'Invalid item type.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const inventoryRef = userRef.collection('inventory').doc('default');
    const result = await db.runTransaction(async (tx) => {
      const inventorySnap = await tx.get(inventoryRef);
      if (!inventorySnap.exists) return { error: 'Inventory not found.', status: 404 } as const;
      const inventory = inventorySnap.data()!;
      if (body.action === 'unequip') {
        tx.update(inventoryRef, { [`equipped.${type}`]: '' });
        return { success: true } as const;
      }

      const itemId = body.itemId;
      if (typeof itemId !== 'string' || itemId.length > 128) {
        return { error: 'Invalid shop item.', status: 400 } as const;
      }
      const items: string[] = Array.isArray(inventory.items) ? inventory.items : [];
      if (!items.includes(itemId)) return { error: 'Item is not owned.', status: 403 } as const;
      const itemRef = db.collection('shopItems').doc(itemId);
      const itemSnap = await tx.get(itemRef);
      if (!itemSnap.exists || itemSnap.data()?.type !== type) {
        return { error: 'Item cannot be equipped in this slot.', status: 409 } as const;
      }
      tx.update(inventoryRef, { [`equipped.${type}`]: itemId });
      return { success: true } as const;
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Shop Inventory] Transaction failed.', error);
    return NextResponse.json({ error: 'Inventory is temporarily unavailable.' }, { status: 503 });
  }
}
