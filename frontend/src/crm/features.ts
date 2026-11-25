// Features disabled for this CRM deployment: Ads, Instagram, Messenger, Create.
// Only WhatsApp CRM features are provided.

const WAITING = {
  ads: true,
  instagram: true,
  messenger: true,
  create: true,
};

export type SoonFeature = keyof typeof WAITING;

export const COMING_SOON: Record<SoonFeature, boolean> = { ...WAITING };

export const isSoon = (_f: SoonFeature): boolean => true;

/** Features disabled for this CRM installation. */
export function setEarlyAccess(_on: boolean) {
  for (const k of Object.keys(WAITING) as SoonFeature[]) COMING_SOON[k] = true;
}
