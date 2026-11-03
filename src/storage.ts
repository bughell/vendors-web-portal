export type Fields = {
  company: string; inn: string; account: string; bik: string;
  contract: string; actNumber: string; actDate: string;
  description: string; amount: string; vat: string;
};
export type Draft = { id: string; updatedAt: string; fields: Fields; files: File[] };

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('contractor-portal', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function drafts(): Promise<Draft[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').getAll();
      request.onsuccess = () => resolve((request.result as Draft[]).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function saveDraft(draft: Draft): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put(draft);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function removeDraft(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
      tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
