export class ShnellUser {
  email: string;
  name: string;
  phone: string;
  role: string;
  fcmToken: string | null;
  balance: number;
  isActive: boolean;
  darkMode: boolean;
  platform: string;
  uid?: string;
  id?: string;
  accType?: string;
  isBan?: boolean;
  isBanned?: boolean;
  isPhoneVerified?: boolean;

  constructor(data: any) {
    this.email = data.email || '';
    this.name = data.name || '';
    this.phone = data.phone || '';
    this.role = data.role || 'client';
    this.fcmToken = data.fcmToken || null;
    this.balance = Number(data.balance ?? 0);
    this.isActive = data.isActive ?? true;
    this.darkMode = data.darkMode ?? true;
    this.platform = data.platform || 'unknown';
    this.uid = data.uid || data.id;
    this.id = data.id || data.uid;
    this.accType = data.accType || 'standard';
    this.isBan = data.isBan ?? data.isBanned ?? false;
    this.isBanned = data.isBanned ?? data.isBan ?? false;
    this.isPhoneVerified = data.isPhoneVerified ?? false;
  }

  static fromJson(json: any): ShnellUser {
    return new ShnellUser(json);
  }

  toJson() {
    return {
      email: this.email,
      name: this.name,
      phone: this.phone,
      role: this.role,
      fcmToken: this.fcmToken,
      balance: this.balance,
      isActive: this.isActive,
      darkMode: this.darkMode,
      platform: this.platform,
      accType: this.accType,
      isBan: this.isBan,
      isBanned: this.isBanned,
      isPhoneVerified: this.isPhoneVerified,
      language: 'ar'
    };
  }
}
