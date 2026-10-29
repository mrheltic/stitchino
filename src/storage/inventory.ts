import type { InventoryItem } from '../core/io/inventoryCsv.ts';
import { threadKey, type ThreadRef } from '../core/threads/types.ts';
import { db, type InventoryRow, type StitchinoDb } from './db.ts';

export async function listInventory(store: StitchinoDb = db): Promise<InventoryRow[]> {
  return store.inventory.toArray();
}

/** Sets how many skeins of a thread you have; 0 removes it from the inventory. */
export async function setSkeins(
  ref: ThreadRef,
  skeins: number,
  store: StitchinoDb = db,
): Promise<void> {
  const key = threadKey(ref);
  if (skeins <= 0) await store.inventory.delete(key);
  else
    await store.inventory.put({
      key,
      brand: ref.brand,
      code: ref.code,
      skeins: Math.round(skeins),
      updatedAt: Date.now(),
    });
}

/** Adds skeins to threads (a new thread starts from zero). */
export async function addSkeins(
  items: readonly InventoryItem[],
  store: StitchinoDb = db,
): Promise<void> {
  await store.transaction('rw', store.inventory, async () => {
    for (const { ref, skeins } of items) {
      const key = threadKey(ref);
      const row = await store.inventory.get(key);
      const total = (row?.skeins ?? 0) + skeins;
      if (total <= 0) continue;
      await store.inventory.put({
        key,
        brand: ref.brand,
        code: ref.code,
        skeins: total,
        updatedAt: Date.now(),
      });
    }
  });
}

/** Imported quantities replace the ones you had for the same threads; others stay. */
export async function importInventory(
  items: readonly InventoryItem[],
  store: StitchinoDb = db,
): Promise<void> {
  await store.transaction('rw', store.inventory, async () => {
    for (const { ref, skeins } of items) await setSkeins(ref, skeins, store);
  });
}

export async function clearInventory(store: StitchinoDb = db): Promise<void> {
  await store.inventory.clear();
}
