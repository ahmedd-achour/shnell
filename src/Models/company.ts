export interface Company {
  email: string;
  name: string;
  phone: string;
  role: string;
  balance: number;
  darkMode: boolean;
  drivers : string[];
  dailyVolume : string;
  payrate: number;
}

export class Company implements Company {

  constructor(
    public email: string,
    public name: string,
    public phone: string,
    public role: string,
    public darkMode: boolean,
    public balance: number = 50.0,
    public drivers : string[] = [],
    public dailyVolume : string,
      public payrate: number


  ) {}

  static fromJson(json: any): Company {
    return new Company(
      json.email,
      json.name,
      json.phone,
      json.role,
      json.darkMode ?? true,
      Number(json.balance) ?? 50.0,
      json.drivers ?? [],
      json.dailyVolume,
      Number(json.payrate) ?? 0.25
    );
  }

  toJson(): any {
    return {
      email: this.email,
      name: this.name,
      phone: this.phone,
      role: this.role,
      balance: this.balance,
      darkMode: this.darkMode ,
      drivers : this.drivers,
      dailyVolume : this.dailyVolume,
      payrate : this.payrate
    }}}
