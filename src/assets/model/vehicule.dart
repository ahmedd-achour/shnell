class Vehicle {
 String carteGrise;
 String cin;
 String idDriver; // will be setup in the firebase registration logic after creating the email+ pass credantial we stock here so we cann access vehicle data throw driver id
 String type;
 String vehiculeAsset; // URL of the uploaded vehicle asset image
bool isAssetsApproved;
  List<String> allAssets; 
  
  bool isAdminApproved;// Additional photos/docs


  Vehicle({
    required this.carteGrise,
    
    required this.cin,
    required this.idDriver,
    required this.type ,
    required this.vehiculeAsset,
    this.isAssetsApproved = false,
    this.isAdminApproved = false,
    this.allAssets = const [],
  });


factory Vehicle.fromFirestore(Map<String, dynamic> data) {
    return Vehicle(
      carteGrise: data['carteGrise'] ?? '',
      cin: data['cin'] ?? '',
      idDriver: data['idDriver'] ?? '',
      type: data['type'] ?? '',
      vehiculeAsset: data['vehiculeAsset'] ?? '',
      isAdminApproved: data['isAdminApproved'] ?? false,
      isAssetsApproved: data['isAssetsApproved'] ?? false,
      allAssets: List<String>.from(data['allAssets'] ?? []),
    );
  }
  Map<String, dynamic> toJson() {
    return {
      'carteGrise': carteGrise,
      'cin': cin,
      'idDriver': idDriver,
      'type' : type,
      'isAdminApproved': false,
      'vehiculeAsset': vehiculeAsset,
      'isAssetsApproved': isAssetsApproved,
      'allAssets': allAssets,
    };
  }
}
