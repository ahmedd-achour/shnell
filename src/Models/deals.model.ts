export type DealPaymentStatus = 'unpaid' | 'paid';

export interface Deal {
  idOrder: string;
  idDriver: string;
  idUser: string;
  idVehicle: string;
  status: string;
  agreedPrice?: number;
  currency?: string;
  commissionPercentage?: number;
  commissionAmount?: number;
  driverAmount?: number;
  paymentStatus?: DealPaymentStatus;
  acceptedAt?: any;
  startedAt?: any;
  completedAt?: any;
  cancelledAt?: any;
}

export class DealModel implements Deal {
  constructor(
    public idOrder: string,
    public idDriver: string,
    public idUser: string,
    public idVehicle: string,
    public status: string,
    public agreedPrice?: number,
    public currency: string = 'TND',
    public commissionPercentage?: number,
    public commissionAmount?: number,
    public driverAmount?: number,
    public paymentStatus: DealPaymentStatus = 'unpaid'
  ) {}

  toJson(): any {
    return {
      idOrder: this.idOrder,
      idDriver: this.idDriver,
      idUser: this.idUser,
      idVehicle: this.idVehicle,
      status: this.status,
      agreedPrice: this.agreedPrice,
      currency: this.currency,
      commissionPercentage: this.commissionPercentage,
      commissionAmount: this.commissionAmount,
      driverAmount: this.driverAmount,
      paymentStatus: this.paymentStatus,
      timestamp: new Date()
    };
  }
}
