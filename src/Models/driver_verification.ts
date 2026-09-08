export class DriverVerification {
  idDriver: string;
  cinFrontUrl?: string;
  cinBackUrl?: string;
  drivingLicenseFrontUrl?: string;
  drivingLicenseBackUrl?: string;
  isVerified: boolean;
  id?: string;

  constructor(data: any, documentId?: string) {
    this.idDriver = documentId || data.idDriver || '';
    this.cinFrontUrl = data.cinFrontUrl;
    this.cinBackUrl = data.cinBackUrl;
    this.drivingLicenseFrontUrl = data.drivingLicenseFrontUrl;
    this.drivingLicenseBackUrl = data.drivingLicenseBackUrl;
    this.isVerified = data.isVerified ?? false;
    this.id = documentId || data.id;
  }

  static fromJson(json: any, documentId?: string): DriverVerification {
    return new DriverVerification(json, documentId);
  }
}
