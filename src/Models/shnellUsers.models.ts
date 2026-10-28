export class ShnellUser {
  email: string;
  name: string;
  phone: string;
  role: string;
  isActive: boolean;
  darkMode: boolean;
  platform: string;
  uid?: string;
  id?: string;
  accType?: string;
  isBanned?: boolean;
  isPhoneVerified?: boolean;

  constructor(data: any) {
    this.email = data.email || '';
    this.name = data.name || '';
    this.phone = data.phone || '';
    // Platform roles are 'user' or 'driver' ('admin'/'company' are console-only).
    // Legacy 'customer'/'client' values are normalised to 'user'.
    this.role = ((): string => {
      const r = (data.role || '').toString().trim().toLowerCase();
      if (r === 'customer' || r === 'client' || r === '') return 'user';
      return r;
    })();
    this.isActive = data.isActive ?? true;
    this.darkMode = data.darkMode ?? true;
    this.platform = data.platform || 'unknown';
    this.uid = data.uid || data.id;
    this.id = data.id || data.uid;
    this.accType = data.accType || 'standard';
    this.isBanned = data.isBanned ?? false;
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
      isActive: this.isActive,
      darkMode: this.darkMode,
      platform: this.platform,
      accType: this.accType,
      isBanned: this.isBanned,
      isPhoneVerified: this.isPhoneVerified,
      language: 'ar'
    };
  }
}
