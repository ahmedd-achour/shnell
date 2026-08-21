export interface Deal {
  idOrder: string;
  idDriver: string;
  idUser: string;
  idVehicle: string;
  status: string;
}

export class DealModel implements Deal {
  constructor(
    public idOrder: string,
    public idDriver: string,
    public idUser: string,
    public idVehicle: string,
    public status: string
  ) {}

  toJson(): any {
    return {
      idOrder: this.idOrder,
      idDriver: this.idDriver,
      idUser: this.idUser,
      idVehicle: this.idVehicle,
      status: this.status,
      timestamp: new Date()
    };
  }
}
