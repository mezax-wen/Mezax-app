import type { RequiredDocument } from './folderPlan';

const DATABASE_NAME = 'mezax-local';
const DATABASE_VERSION = 1;
const DRAFT_STORE = 'application-drafts';

export type StoredDraftDocument = {
  id: number;
  name: string;
  size: number;
  type: string;
  slot?: RequiredDocument;
  file: Blob;
};

export type StoredDraftPhoto = {
  name: string;
  file: Blob;
};

export type ApplicationDraft = {
  id: string;
  title: string;
  address: string;
  watermark: string;
  watermarkCustomized: boolean;
  includeCover: boolean;
  showApplicantPhoto: boolean;
  showRentalAddress: boolean;
  showMezaxNotice: boolean;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantCurrentAddress: string;
  applicantPhoto: StoredDraftPhoto | null;
  documents: StoredDraftDocument[];
  updatedAt: number;
};

export type DraftSummary = Pick<ApplicationDraft, 'id' | 'title' | 'address' | 'updatedAt'> & {
  documentCount: number;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('Lokaler Speicherfehler')), { once: true });
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Speichern abgebrochen')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Lokaler Speicherfehler')), { once: true });
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error ?? new Error('Lokaler Speicher konnte nicht geöffnet werden')), { once: true });
  });
}

export async function saveApplicationDraft(draft: ApplicationDraft) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).put(draft);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}

export async function loadApplicationDraft(id: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, 'readonly');
    return await requestResult<ApplicationDraft | undefined>(transaction.objectStore(DRAFT_STORE).get(id));
  } finally {
    database.close();
  }
}

export async function listApplicationDrafts(): Promise<DraftSummary[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, 'readonly');
    const drafts = await requestResult<ApplicationDraft[]>(transaction.objectStore(DRAFT_STORE).getAll());
    return drafts
      .map((draft) => ({
        id: draft.id,
        title: draft.title,
        address: draft.address,
        updatedAt: draft.updatedAt,
        documentCount: draft.documents.length,
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  } finally {
    database.close();
  }
}

export async function removeApplicationDraft(id: string) {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
}
