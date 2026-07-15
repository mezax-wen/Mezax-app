export type ApplicantProfile = {
  name: string;
  email: string;
  phone: string;
  currentAddress: string;
};

type ProfileStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const emptyApplicantProfile: ApplicantProfile = {
  name: '',
  email: '',
  phone: '',
  currentAddress: '',
};

const storageKey = 'mezax.applicant-profile.v1';

const textValue = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function normalizeApplicantProfile(value: Partial<ApplicantProfile> | null | undefined): ApplicantProfile {
  return {
    name: textValue(value?.name),
    email: textValue(value?.email),
    phone: textValue(value?.phone),
    currentAddress: textValue(value?.currentAddress),
  };
}

export function loadApplicantProfile(storage: ProfileStorage = window.localStorage): ApplicantProfile {
  try {
    const stored = storage.getItem(storageKey);
    return stored ? normalizeApplicantProfile(JSON.parse(stored) as Partial<ApplicantProfile>) : { ...emptyApplicantProfile };
  } catch {
    return { ...emptyApplicantProfile };
  }
}

export function saveApplicantProfile(profile: ApplicantProfile, storage: ProfileStorage = window.localStorage): ApplicantProfile {
  const normalized = normalizeApplicantProfile(profile);
  storage.setItem(storageKey, JSON.stringify(normalized));
  return normalized;
}
