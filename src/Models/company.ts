export type CompanyPlan = 'payg' | 'pro';

export interface Company {
  email: string;
  name: string;
  phone: string;
  role: string;
  darkMode: boolean;
  drivers : string[];
  dailyVolume : string;
  payrate: number;
  /** Commercial plan (spec §12). Defaults to 'payg' when unset — never assume PRO. */
  plan: CompanyPlan;
  /** Overrides the global commission percentage for this company when set. PRO companies are typically 0. */
  commissionRate: number | undefined;
  subscriptionStart: any;
  subscriptionEnd: any;
}

export class Company implements Company {

  constructor(
    public email: string,
    public name: string,
    public phone: string,
    public role: string,
    public darkMode: boolean,
    public drivers : string[] = [],
    public dailyVolume : string,
      public payrate: number,
      public plan: CompanyPlan = 'payg',
      public commissionRate: number | undefined = undefined,
      public subscriptionStart: any = undefined,
      public subscriptionEnd: any = undefined

  ) {}

  static fromJson(json: any): Company {
    return new Company(
      json.email,
      json.name,
      json.phone,
      json.role,
      json.darkMode ?? true,
      json.drivers ?? [],
      json.dailyVolume,
      Number(json.payrate) ?? 0.25,
      json.plan === 'pro' ? 'pro' : 'payg',
      json.commissionRate !== undefined ? Number(json.commissionRate) : undefined,
      json.subscriptionStart ?? undefined,
      json.subscriptionEnd ?? undefined
    );
  }

  toJson(): any {
    return {
      email: this.email,
      name: this.name,
      phone: this.phone,
      role: this.role,
      darkMode: this.darkMode ,
      drivers : this.drivers,
      dailyVolume : this.dailyVolume,
      payrate : this.payrate,
      plan: this.plan,
      commissionRate: this.commissionRate,
      subscriptionStart: this.subscriptionStart,
      subscriptionEnd: this.subscriptionEnd
    }}}

/** Derives current PAYG/PRO subscription status client-side (never stored). Spec §12. */
export type SubscriptionStatus = 'payg' | 'pro_active' | 'pro_expired';

export function computeSubscriptionStatus(company: Pick<Company, 'plan' | 'subscriptionStart' | 'subscriptionEnd'>, now: Date = new Date()): SubscriptionStatus {
  if (company.plan !== 'pro') return 'payg';
  const end = toDate(company.subscriptionEnd);
  if (!end) return 'payg';
  return end.getTime() >= now.getTime() ? 'pro_active' : 'pro_expired';
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}
